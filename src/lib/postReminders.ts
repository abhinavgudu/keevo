import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  deliverPushPayload,
  PUSH_BADGE,
  PUSH_ICON,
  PushSubscriptionRow,
} from './pushSender';

/**
 * Daily "share a post" reminders.
 *
 * Community reactions are event-driven, but a reminder has no actor or post.
 * It is therefore push-only: it never writes to `community_notifications`, and
 * it never appears in the in-app bell. Delivery is deduplicated per user and
 * per UTC calendar day in `post_reminder_deliveries`, so a retried or
 * overlapping Vercel cron invocation cannot send the same day's nudge twice.
 *
 * Recipients are deliberately conservative. Only devices with a push row can be
 * reached, and anyone who shared a post in the last seven days is skipped. A
 * daily nudge is for inactive sharers, not a reward for people who already
 * posted.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let cachedAdmin: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (!cachedAdmin) {
    cachedAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedAdmin;
}

export const POST_REMINDER_INACTIVE_DAYS = 7;
export const POST_REMINDER_RETENTION_DAYS = 90;
const SUBSCRIPTION_PAGE_SIZE = 1000;
const RECENT_POSTER_CHUNK_SIZE = 500;

export interface DailyPostReminderResult {
  date: string;
  checkedUsers: number;
  eligibleUsers: number;
  claimedUsers: number;
  devices: number;
  sentDevices: number;
  deadDevices: number;
  prunedDeliveries: number;
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export function buildPostReminderPayload(date: string): Record<string, unknown> {
  return {
    title: 'A gentle nudge from Keeva',
    body: 'Share today’s post with the community — your next save could help someone.',
    tag: `keeva-post-reminder-${date}`,
    url: '/community',
    kind: 'post_reminder',
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
  };
}

function missingDeliveriesTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { code?: unknown; message?: unknown };
  if (details.code === '42P01') return true;
  return (
    typeof details.message === 'string' &&
    details.message.includes('post_reminder_deliveries') &&
    details.message.includes('does not exist')
  );
}

async function allPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const rows: PushSubscriptionRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await admin()
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .order('user_id', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + SUBSCRIPTION_PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...((data || []) as PushSubscriptionRow[]));
    if (!data || data.length < SUBSCRIPTION_PAGE_SIZE) break;
    from += SUBSCRIPTION_PAGE_SIZE;
  }

  return rows;
}

async function recentSharers(subscribedUserIds: string[], cutoff: string): Promise<Set<string>> {
  // A share is identified by its `new_post` event, not by `content_items`
  // alone: sharing flips an older private save to public, and `content_items`
  // has no share timestamp. Both the actor and the post owner count, because
  // an admin share publishes somebody else's post on their behalf.
  const sharers = new Set<string>();
  const itemIds = new Set<string>();

  for (const ids of chunk(subscribedUserIds, RECENT_POSTER_CHUNK_SIZE)) {
    const { data, error } = await admin()
      .from('community_notifications')
      .select('actor_user_id, item_id')
      .eq('kind', 'new_post')
      .gte('created_at', cutoff)
      .in('actor_user_id', ids);

    if (error) throw error;
    for (const row of (data || []) as Array<{
      actor_user_id: string | null;
      item_id: string | null;
    }>) {
      if (row.actor_user_id) sharers.add(row.actor_user_id);
      if (row.item_id) itemIds.add(row.item_id);
    }
  }

  let from = 0;
  for (;;) {
    const { data, error } = await admin()
      .from('community_notifications')
      .select('item_id')
      .eq('kind', 'new_post')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + SUBSCRIPTION_PAGE_SIZE - 1);

    if (error) throw error;
    for (const row of (data || []) as Array<{ item_id: string | null }>) {
      if (row.item_id) itemIds.add(row.item_id);
    }
    if (!data || data.length < SUBSCRIPTION_PAGE_SIZE) break;
    from += SUBSCRIPTION_PAGE_SIZE;
  }

  for (const ids of chunk(Array.from(itemIds), RECENT_POSTER_CHUNK_SIZE)) {
    if (!ids.length) break;
    const { data, error } = await admin()
      .from('content_items')
      .select('user_id')
      .in('id', ids);

    if (error) throw error;
    for (const row of (data || []) as Array<{ user_id: string | null }>) {
      if (row.user_id) sharers.add(row.user_id);
    }
  }

  const subscribed = new Set(subscribedUserIds);
  for (const userId of Array.from(sharers)) {
    if (!subscribed.has(userId)) sharers.delete(userId);
  }

  return sharers;
}

export async function sendDailyPostReminders(now = new Date()): Promise<DailyPostReminderResult> {
  const date = utcDate(now);

  if (
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    // Claim nothing when delivery is impossible. Otherwise today's date would be
    // marked sent even though nobody received anything.
    throw new Error('Web Push keys are missing; post reminders were not sent.');
  }

  const subscriptions = await allPushSubscriptions();
  const subscribedUserIds = Array.from(
    new Set(subscriptions.map((row) => row.user_id).filter(Boolean))
  );

  // The deliveries table is this job's idempotency lock. Check it before doing
  // eligibility work so a missing migration fails loudly instead of silently
  // doing nothing on days when nobody happens to be subscribed.
  const { error: tableError } = await admin()
    .from('post_reminder_deliveries')
    .select('user_id', { head: true, count: 'exact' })
    .limit(1);
  if (tableError) {
    if (missingDeliveriesTable(tableError)) {
      throw new Error(
        'post_reminder_deliveries table is missing. Run scripts/post-reminder-deliveries-migration.sql in Supabase, then rerun the cron.'
      );
    }
    throw tableError;
  }

  if (!subscribedUserIds.length) {
    return {
      date,
      checkedUsers: 0,
      eligibleUsers: 0,
      claimedUsers: 0,
      devices: 0,
      sentDevices: 0,
      deadDevices: 0,
      prunedDeliveries: await pruneOldDeliveries(date),
    };
  }

  const cutoff = new Date(
    now.getTime() - POST_REMINDER_INACTIVE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const sharers = await recentSharers(subscribedUserIds, cutoff);
  const eligible = subscribedUserIds.filter((userId) => !sharers.has(userId));

  let claimedRows: Array<{ user_id: string | null }> = [];
  if (eligible.length) {
    const { data, error: claimError } = await admin()
      .from('post_reminder_deliveries')
      .upsert(
        eligible.map((userId) => ({ user_id: userId, sent_for_date: date })),
        { onConflict: 'user_id,sent_for_date', ignoreDuplicates: true }
      )
      .select('user_id');

    if (claimError) {
      if (missingDeliveriesTable(claimError)) {
        throw new Error(
          'post_reminder_deliveries table is missing. Run scripts/post-reminder-deliveries-migration.sql in Supabase, then rerun the cron.'
        );
      }
      throw claimError;
    }

    claimedRows = (data || []) as Array<{ user_id: string | null }>;
  }

  const claimed = new Set(
    claimedRows.map((row) => row.user_id).filter(
      (userId): userId is string => Boolean(userId)
    )
  );
  const recipientSubscriptions = subscriptions.filter((row) => claimed.has(row.user_id));
  const result = await deliverPushPayload(
    recipientSubscriptions,
    buildPostReminderPayload(date)
  );

  return {
    date,
    checkedUsers: subscribedUserIds.length,
    eligibleUsers: eligible.length,
    claimedUsers: claimed.size,
    devices: recipientSubscriptions.length,
    sentDevices: result.succeeded.length,
    deadDevices: result.dead.length,
    prunedDeliveries: await pruneOldDeliveries(date),
  };
}

async function pruneOldDeliveries(date: string): Promise<number> {
  const retentionCutoff = new Date(`${date}T00:00:00.000Z`);
  retentionCutoff.setUTCDate(retentionCutoff.getUTCDate() - POST_REMINDER_RETENTION_DAYS);

  const { count, error } = await admin()
    .from('post_reminder_deliveries')
    .delete({ count: 'exact' })
    .lt('sent_for_date', retentionCutoff.toISOString().slice(0, 10));

  if (error) {
    if (missingDeliveriesTable(error)) return 0;
    console.error('Post reminders: failed to prune old deliveries:', error);
    return 0;
  }

  return count ?? 0;
}
