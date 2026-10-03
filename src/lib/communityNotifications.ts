import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CommunityAuthor } from './authorProfiles';
import { getAuthorMap } from './authorProfiles';
import { extractMentionHandles, handleFromEmail, resolveHandleDisplayNames } from './mentions';
import { buildCommunityPostHref, buildDmThreadHref } from './communityDeepLink';
import { buildPushPayload, sendPush } from './pushSender';

export { extractMentionHandles, handleFromEmail };

/**
 * Server-side helpers for the community notification feed.
 *
 * The feed is deliberately separate from the Community tab badge. That badge
 * counts unread POSTS and is computed in the browser from
 * keeva_community_last_seen_time; nothing here should ever be wired into it.
 */

export type CommunityNotificationKind =
  | 'new_post'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'like'
  | 'comment_like'
  | 'new_follower'
  | 'post_edited'
  | 'dm_message';

export const COMMUNITY_NOTIFICATION_KINDS: CommunityNotificationKind[] = [
  'new_post',
  'comment',
  'reply',
  'mention',
  'like',
  'comment_like',
  'new_follower',
  'post_edited',
  'dm_message',
];

export interface CommunityNotificationRow {
  id: string;
  recipient_user_id: string | null;
  actor_user_id: string;
  kind: CommunityNotificationKind;
  item_id: string | null;
  comment_id: string | null;
  /** Set for 'dm_message' rows only: the conversation it belongs to. */
  thread_id: string | null;
  /** Set for 'dm_message' rows only: the message, for the retry dedupe. */
  dm_message_id: string | null;
  actor_name: string;
  created_at: string;
  read_at: string | null;
}

export interface CommunityNotification extends CommunityNotificationRow {
  /** Resolved from content_items in the feed route; null if the post is gone. */
  item_title: string | null;
  /** Short excerpt of the comment, for comment/reply/mention rows. */
  comment_excerpt: string | null;
  /** Short excerpt of a DM, for dm_message rows. */
  message_excerpt: string | null;
}

export interface CommunityMember {
  id: string;
  handle: string;
  name: string;
}

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

// ── Mentions ─────────────────────────────────────────────────────────────────

/**
 * Map @handles to real account ids. Matches the email local-part, and also the
 * first/last name, because a member reading a comment sees the author's name
 * there and will naturally type that instead of their email prefix.
 */
export function resolveMentionedUserIds(
  handles: string[],
  authorMap: Record<string, CommunityAuthor>
): string[] {
  const byKey = new Map<string, string>();

  for (const [id, author] of Object.entries(authorMap)) {
    const keys = [handleFromEmail(author.email), author.first_name, author.last_name];
    for (const key of keys) {
      const normalized = (key || '').trim().toLowerCase();
      // First writer wins so a stable email local-part is never shadowed by
      // somebody else's first name.
      if (normalized && !byKey.has(normalized)) byKey.set(normalized, id);
    }
  }

  const ids = new Set<string>();
  for (const handle of handles) {
    const id = byKey.get(handle);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

/** The mention list for the composer: handle + display name, no email addresses. */
export function membersFromAuthorMap(
  authorMap: Record<string, CommunityAuthor>,
  excludeUserId?: string
): CommunityMember[] {
  return Object.entries(authorMap)
    .filter(([id]) => id !== excludeUserId)
    .map(([id, author]) => {
      const name = [author.first_name, author.last_name].filter(Boolean).join(' ').trim();
      const handle = handleFromEmail(author.email);
      return { id, handle, name: name || handle };
    })
    .filter((m) => m.handle)
    .sort((a, b) => a.handle.localeCompare(b.handle));
}

// ── Writing notifications ────────────────────────────────────────────────────

/** Higher wins when one comment produces several events for the same person. */
const KIND_PRIORITY: Record<CommunityNotificationKind, number> = {
  mention: 3,
  reply: 2,
  comment: 1,
  comment_like: 1,
  like: 0,
  new_follower: 0,
  post_edited: 0,
  new_post: 0,
  // A DM has no competition: it is never collapsed against a comment or a like,
  // because each message is its own event with its own recipient.
  dm_message: 0,
};

export interface NotificationInput {
  recipientUserId: string | null;
  actorUserId: string;
  actorName: string;
  kind: CommunityNotificationKind;
  itemId?: string | null;
  commentId?: string | null;
  /** 'dm_message' only — the conversation the message belongs to. */
  threadId?: string | null;
  /** 'dm_message' only — makes a retried send produce one row, not two. */
  dmMessageId?: string | null;
  /**
   * Written to read_at on insert, for an event the recipient has already seen.
   * The row is still stored — it is the permanent record that the message
   * arrived, and the recipient's other devices need it — it simply does not
   * count as unread on the surface they were already looking at.
   */
  readAt?: string | null;
  /** Skips push delivery for an event the recipient is currently watching. */
  skipPush?: boolean;
}

/**
 * Collapse candidate notifications for a single comment down to one row per
 * person. Without this, mentioning the owner of the post you are replying to
 * would ping them three times for the same text.
 */
export function collapseByRecipient(inputs: NotificationInput[]): NotificationInput[] {
  const best = new Map<string, NotificationInput>();

  for (const input of inputs) {
    if (!input.recipientUserId) continue;
    // Never notify someone about their own action.
    if (input.recipientUserId === input.actorUserId) continue;

    const current = best.get(input.recipientUserId);
    if (!current || KIND_PRIORITY[input.kind] > KIND_PRIORITY[current.kind]) {
      best.set(input.recipientUserId, input);
    }
  }

  return Array.from(best.values());
}

/**
 * Persist notifications. NEVER throws.
 *
 * A notification is a side effect of an action the user already got a success
 * response for, so a failure here must never turn a posted comment or a
 * registered like into a 500. Failures are logged and swallowed; the partial
 * unique indexes additionally make a duplicate insert a harmless 23505.
 */
export async function insertNotifications(inputs: NotificationInput[]): Promise<void> {
  if (!inputs.length) return;

  const rows = inputs.map((input) => ({
    recipient_user_id: input.recipientUserId,
    actor_user_id: input.actorUserId,
    actor_name: input.actorName,
    kind: input.kind,
    item_id: input.itemId ?? null,
    comment_id: input.commentId ?? null,
    thread_id: input.threadId ?? null,
    dm_message_id: input.dmMessageId ?? null,
    read_at: input.readAt ?? null,
  }));

  let persisted = false;
  try {
    const { error } = await admin()
      .from('community_notifications')
      .insert(rows);

    // 23505 is the dedupe index doing its job on a retried write.
    if (error && error.code !== '23505') {
      console.error('Failed to record community notifications:', error);
    } else {
      persisted = true;
    }
  } catch (err) {
    console.error('Failed to record community notifications:', err);
  }

  // Push only once the row is actually in the feed. Pushing on a failed write
  // would alert someone to something they cannot then open, and a 23505 counts
  // as persisted because the row the event belongs to is already there.
  //
  // Rows the recipient has already seen are skipped: they are for the record,
  // not for interrupting somebody who is looking at the thing itself.
  const pushable = inputs.filter((input) => !input.skipPush);
  if (persisted && pushable.length) {
    await pushForNotifications(pushable);
  }
}

/**
 * Deliver the same events to devices, for when the app is not open.
 *
 * The row written above is the source of truth; this only mirrors it onto
 * phones. Titles and comment text are read here rather than threaded through
 * the callers because the two callers have different information — one knows the
 * caption being edited, the other has just written a comment body — and neither
 * of those is a good notification line on its own.
 */
async function pushForNotifications(inputs: NotificationInput[]): Promise<void> {
  try {
    const itemIds = Array.from(
      new Set(inputs.map((i) => i.itemId).filter((id): id is string => Boolean(id)))
    );
    const commentIds = Array.from(
      new Set(inputs.map((i) => i.commentId).filter((id): id is string => Boolean(id)))
    );
    const messageIds = Array.from(
      new Set(inputs.map((i) => i.dmMessageId).filter((id): id is string => Boolean(id)))
    );

    const [itemsRes, commentsRes, messagesRes] = await Promise.all([
      itemIds.length
        ? admin().from('content_items').select('id, title').in('id', itemIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string | null }> }),
      commentIds.length
        ? admin().from('community_comments').select('id, body').in('id', commentIds)
        : Promise.resolve({ data: [] as Array<{ id: string; body: string | null }> }),
      // Read here rather than stored on the notification row: see the migration's
      // note on why private message text is not duplicated into that table.
      messageIds.length
        ? admin().from('dm_messages').select('id, body').in('id', messageIds)
        : Promise.resolve({ data: [] as Array<{ id: string; body: string | null }> }),
    ]);

    const titles = new Map(
      (itemsRes.data || []).map((row) => [row.id as string, row.title as string | null])
    );
    const bodies = new Map(
      (commentsRes.data || []).map((row) => [row.id as string, row.body as string | null])
    );
    const messageBodies = new Map(
      (messagesRes.data || []).map((row) => [row.id as string, row.body as string | null])
    );

    // handle → actual name, so a push about "@abhinavguddu99" reads "Abhinav
    // Guddu". Display-only: the stored @handle is still what resolved the
    // recipient, and a failed lookup must never block the push itself.
    let nameByHandle: Record<string, string> = {};
    try {
      const authorMap = await getAuthorMap();
      for (const m of membersFromAuthorMap(authorMap)) {
        if (m.handle && m.name) nameByHandle[m.handle.toLowerCase()] = m.name;
      }
    } catch {
      nameByHandle = {};
    }

    await sendPush(inputs, (input) => {
      // A follow has no post: tapping it opens the follower's profile, which
      // is the new person the recipient will want to check out. A DM opens the
      // conversation itself. Everything else is about a post.
      const href =
        input.kind === 'new_follower'
          ? `/members/${input.actorUserId}`
          : input.kind === 'dm_message'
            ? buildDmThreadHref(input.threadId ?? null)
            : buildCommunityPostHref(input.itemId ?? null, input.kind);
      // For a mention or a reply the comment text is the useful part; for a DM the
      // message itself is. For the rest the post title is, and a body would be
      // noise.
      const detail = input.commentId
        ? commentExcerpt(resolveHandleDisplayNames(bodies.get(input.commentId) ?? null, nameByHandle))
        : input.dmMessageId
          ? commentExcerpt(messageBodies.get(input.dmMessageId) ?? null)
          : null;
      return buildPushPayload({
        kind: input.kind,
        actorName: input.actorName,
        itemTitle: detail ?? titles.get(input.itemId ?? '') ?? null,
        href,
      });
    });
  } catch (err) {
    console.error('Failed to send push notifications:', err);
  }
}

/**
 * Announce a post that just entered the community. One broadcast row, not one
 * row per member.
 */
export async function notifyNewPost(params: {
  actorUserId: string;
  actorName: string;
  itemId: string;
}): Promise<void> {
  await insertNotifications([
    {
      recipientUserId: null,
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      kind: 'new_post',
      itemId: params.itemId,
      commentId: null,
    },
  ]);
}

/**
 * Announce that a post already in the community had its caption changed.
 *
 * Goes to the people who actually engaged with it — everyone who commented or
 * liked it — because a reworded post is news for exactly those people. A
 * broadcast to the whole community for a typo fix would be noise. The editor is
 * never notified about their own edit.
 *
 * Never throws, and fires only on a genuine text change, so repeatedly saving an
 * unchanged caption is silent.
 */
export async function notifyPostEdited(params: {
  actorUserId: string;
  actorName: string;
  itemId: string;
}): Promise<void> {
  try {
    const [commentsRes, likesRes] = await Promise.all([
      admin()
        .from('community_comments')
        .select('user_id')
        .eq('item_id', params.itemId),
      admin()
        .from('community_likes')
        .select('user_id')
        .eq('item_id', params.itemId),
    ]);

    const recipients = new Set<string>();
    for (const row of commentsRes.data || []) {
      if (row.user_id) recipients.add(row.user_id);
    }
    for (const row of likesRes.data || []) {
      if (row.user_id) recipients.add(row.user_id);
    }
    recipients.delete(params.actorUserId);

    await insertNotifications(
      Array.from(recipients).map((recipientUserId) => ({
        recipientUserId,
        actorUserId: params.actorUserId,
        actorName: params.actorName,
        kind: 'post_edited' as const,
        itemId: params.itemId,
        commentId: null,
      }))
    );
  } catch (err) {
    console.error('Failed to record post edit notification:', err);
  }
}

/**
 * The like is a toggle, so unlike has to take the notification back. Only the
 * 'like' rows for that exact (actor, item) pair are removed — a comment or
 * mention on the same post is unrelated and must survive.
 */
export async function removeLikeNotification(params: {
  actorUserId: string;
  itemId: string;
}): Promise<void> {
  try {
    const { error } = await admin()
      .from('community_notifications')
      .delete()
      .eq('actor_user_id', params.actorUserId)
      .eq('item_id', params.itemId)
      .eq('kind', 'like');

    if (error) console.error('Failed to clear like notification:', error);
  } catch (err) {
    console.error('Failed to clear like notification:', err);
  }
}

/**
 * Same toggle contract for comment likes: unliking a comment takes back only
 * the 'comment_like' row for that exact (actor, comment) pair. A reply or
 * mention on the same comment is unrelated and must survive.
 */
export async function removeCommentLikeNotification(params: {
  actorUserId: string;
  commentId: string;
}): Promise<void> {
  try {
    const { error } = await admin()
      .from('community_notifications')
      .delete()
      .eq('actor_user_id', params.actorUserId)
      .eq('comment_id', params.commentId)
      .eq('kind', 'comment_like');

    if (error) console.error('Failed to clear comment like notification:', error);
  } catch (err) {
    console.error('Failed to clear comment like notification:', err);
  }
}

/**
 * Tell the recipient that a direct message arrived.
 *
 * One row per message, keyed on dm_message_id by a partial unique index — so a
 * retried send (the client reuses its client_id on a timeout) is absorbed by a
 * 23505 rather than producing a second bell entry. Never throws: the message is
 * already stored, and failing to notify must not turn a successful send into an
 * error the sender sees.
 */
export async function notifyDirectMessage(params: {
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  threadId: string;
  messageId: string;
  /** True when the recipient is looking at this conversation as it arrives. */
  recipientIsWatching?: boolean;
}): Promise<void> {
  try {
    const watching = params.recipientIsWatching === true;
    await insertNotifications([
      {
        recipientUserId: params.recipientUserId,
        actorUserId: params.actorUserId,
        actorName: params.actorName,
        kind: 'dm_message',
        itemId: null,
        commentId: null,
        threadId: params.threadId,
        dmMessageId: params.messageId,
        // Watched: stored as already read. NOT stored — this is the subtle
        // part. The row must still exist, because it is the permanent record
        // that the message arrived, and because the recipient's other devices
        // read from this same table and have no way to know it was suppressed
        // here. Only this surface's unread count is spared.
        readAt: watching ? new Date().toISOString() : null,
        skipPush: watching,
      },
    ]);
  } catch (err) {
    console.error('Failed to record DM notification:', err);
  }
}

/**
 * Same toggle contract for follows: unfollowing takes back only the
 * 'new_follower' row for that exact (follower, target) pair.
 */
export async function removeFollowNotification(params: {
  actorUserId: string;
  targetUserId: string;
}): Promise<void> {
  try {
    const { error } = await admin()
      .from('community_notifications')
      .delete()
      .eq('actor_user_id', params.actorUserId)
      .eq('recipient_user_id', params.targetUserId)
      .eq('kind', 'new_follower');

    if (error) console.error('Failed to clear follow notification:', error);
  } catch (err) {
    console.error('Failed to clear follow notification:', err);
  }
}

// ── Reading the feed ─────────────────────────────────────────────────────────

/**
 * The visibility rule, duplicated from the SELECT policy because the service
 * role bypasses RLS. Any admin-side query that touches another member's rows has
 * to apply this by hand.
 */
export function visibleToUserFilter(userId: string): string {
  return `recipient_user_id.eq.${userId},and(recipient_user_id.is.null,actor_user_id.neq.${userId})`;
}

export function readFilterForUser(userId: string) {
  return admin()
    .from('community_notifications')
    .select('*')
    .or(visibleToUserFilter(userId));
}

/** Short excerpt of a comment body for the notification line. */
export function commentExcerpt(body: string | null | undefined): string | null {
  if (!body) return null;
  const clean = body.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > 90 ? `${clean.slice(0, 90)}…` : clean;
}
