import { createClient, SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import type { CommunityNotificationKind, NotificationInput } from './communityNotifications';

/**
 * Server-side Web Push delivery.
 *
 * This is what makes a phone buzz when the app is closed. The in-app bell in
 * useCommunityNotifications can only see anything while the tab is alive, so it
 * is a mirror of this, not a substitute for it.
 *
 * Nothing in here may ever throw. Every call site is inside the request path of
 * an action the user already got a success response for — a posted comment, a
 * registered like — and a push failure is not a reason to turn any of those into
 * a 500. The notification row is the source of truth; this is best-effort
 * delivery on top of it.
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

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

let vapidConfigured = false;

/**
 * Configure web-push once per process. A missing key is a deployment mistake, not
 * a runtime condition to retry in a loop, so it is reported once and push
 * delivery silently stays off until the keys exist.
 */
function configureVapid(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.warn(
      'Web Push disabled: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are not all set. ' +
        'Run `node scripts/generate-vapid-keys.mjs` and redeploy.'
    );
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

// ── Message copy ─────────────────────────────────────────────────────────────

/**
 * What the notification says. Kept as a lookup rather than built at each call
 * site so the wording for a kind cannot drift between "new_post" and "like".
 */
const KIND_COPY: Record<CommunityNotificationKind, { verb: string; fallback: string }> = {
  new_post: {
    verb: 'shared a new post with the community',
    fallback: 'Tap to see what is new on Keeva.',
  },
  comment: {
    verb: 'left a comment on your post',
    fallback: 'Tap to read the comment on Keeva.',
  },
  reply: {
    verb: 'replied to your comment',
    fallback: 'Tap to read the reply on Keeva.',
  },
  mention: {
    verb: 'mentioned you in a comment',
    fallback: 'Tap to see the mention on Keeva.',
  },
  like: {
    verb: 'liked your post',
    fallback: 'Tap to see your post on Keeva.',
  },
  post_edited: {
    verb: 'edited a post you interacted with',
    fallback: 'Tap to see the latest version on Keeva.',
  },
};

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Collapses repeat pushes for the same post on the device. */
  tag: string;
  /** Where the service worker should send the user when the notification is tapped. */
  url: string;
  kind: CommunityNotificationKind;
}

export function buildPushPayload(params: {
  kind: CommunityNotificationKind;
  actorName: string;
  itemTitle: string | null;
  href: string;
}): PushPayload {
  const copy = KIND_COPY[params.kind] ?? { verb: 'interacted with a post', fallback: '' };
  const who = params.actorName?.trim() || 'Someone';

  return {
    title: `${who} ${copy.verb}`,
    body: params.itemTitle ? truncate(params.itemTitle, 110) : copy.fallback,
    // Scoped to the post so several comments on the same post do not stack up in
    // the device tray, but a different post is always a separate notification.
    tag: `keeva-${params.kind}-${params.href}`,
    url: params.href,
    kind: params.kind,
  };
}

// ── Delivery ─────────────────────────────────────────────────────────────────

/** A push service saying 404/410 means this browser is permanently gone. */
function isGone(statusCode?: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

/** web-push rejects with an object carrying statusCode, not an Error subclass. */
function statusCodeOf(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const value = (err as { statusCode?: unknown }).statusCode;
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function subscriptionsFor(inputs: NotificationInput[]): Promise<PushSubscriptionRow[]> {
  const directRecipients = new Set<string>();
  const broadcastActors = new Set<string>();

  for (const input of inputs) {
    if (input.recipientUserId) {
      // Never push someone their own action, even if a caller forgot to drop it.
      if (input.recipientUserId !== input.actorUserId) directRecipients.add(input.recipientUserId);
    } else {
      // A broadcast row (new_post) means "everybody but the actor". Selecting
      // push_subscriptions directly is deliberate: it is both cheaper than
      // enumerating members and self-limiting, since a member with no push
      // permission on this device simply has no row to send to.
      broadcastActors.add(input.actorUserId);
    }
  }

  if (!directRecipients.size && !broadcastActors.size) return [];

  const rows: PushSubscriptionRow[] = [];
  const seen = new Set<string>();

  if (directRecipients.size) {
    const { data, error } = await admin()
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', Array.from(directRecipients));
    if (error) console.error('Push: failed to read subscriptions:', error);
    for (const row of data || []) {
      if (seen.has(row.endpoint)) continue;
      seen.add(row.endpoint);
      rows.push(row);
    }
  }

  if (broadcastActors.size) {
    const { data, error } = await admin()
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .not('user_id', 'in', `(${Array.from(broadcastActors).join(',')})`);
    if (error) console.error('Push: failed to read broadcast subscriptions:', error);
    for (const row of data || []) {
      if (seen.has(row.endpoint)) continue;
      seen.add(row.endpoint);
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Push one notification to every device that should see it.
 *
 * Awaited on purpose: on serverless a fire-and-forget send is killed the moment
 * the response is flushed, so an un-awaited push would silently never arrive.
 * The latency cost is one round trip to the push service, on a route that has
 * already done database work.
 */
export async function sendPush(
  inputs: NotificationInput[],
  makePayload: (input: NotificationInput) => PushPayload
): Promise<void> {
  if (!inputs.length) return;
  if (!configureVapid()) return;

  try {
    // Resolve per device, not per row. A device belongs to exactly one user, so
    // the payload it should show is the one addressed to that user — or the
    // broadcast, if no direct notification is addressed to them.
    const direct = new Map<string, PushPayload>();
    const broadcasts: Array<{ actorUserId: string; payload: PushPayload }> = [];

    for (const input of inputs) {
      if (input.recipientUserId && input.recipientUserId !== input.actorUserId) {
        direct.set(input.recipientUserId, makePayload(input));
      } else if (!input.recipientUserId) {
        broadcasts.push({ actorUserId: input.actorUserId, payload: makePayload(input) });
      }
    }

    if (!direct.size && !broadcasts.length) return;

    const subscriptions = await subscriptionsFor(inputs);
    if (!subscriptions.length) return;

    const dead: string[] = [];
    const succeeded: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        const payload =
          direct.get(sub.user_id) ??
          broadcasts.find((b) => b.actorUserId !== sub.user_id)?.payload;
        if (!payload) return;

        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              ...payload,
              // Android renders a Web Push icon as a white silhouette taken from
              // its alpha channel, so this has to be a real PNG with genuine
              // transparency. /keeva-icon.png is a JPEG wearing a .png name —
              // no alpha, so Android drew a solid white block — and the manifest
              // icons are full-bleed squares, which mask to the same white block.
              icon: '/notification-icon.png',
              // iOS-only, and wants a monochrome glyph for the status bar. The
              // same silhouette is already white-on-transparent, which is what
              // this field wants anyway.
              badge: '/notification-icon.png',
            }),
            { TTL: 60 * 60 * 12, urgency: 'normal' }
          );
          succeeded.push(sub.id);
        } catch (err: unknown) {
          if (isGone(statusCodeOf(err))) {
            dead.push(sub.id);
          } else {
            // A transient failure. Keep the row: a 500 from the push service or a
            // flaky network must not be mistaken for an uninstalled browser.
            console.warn('Push: send failed, subscription kept:', describe(err));
          }
        }
      })
    );

    if (succeeded.length) {
      await admin()
        .from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString() })
        .in('id', succeeded);
    }

    if (dead.length) {
      // Prune so the table cannot grow without bound as browsers come and go.
      const { error } = await admin().from('push_subscriptions').delete().in('id', dead);
      if (error) console.error('Push: failed to prune dead subscriptions:', error);
      else console.log(`Push: pruned ${dead.length} dead subscription(s)`);
    }
  } catch (err) {
    console.error('Push: delivery failed:', err);
  }
}
