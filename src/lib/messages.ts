/**
 * Direct-message types and the thread-key rule.
 *
 * Free of any `@/` import and of the Supabase client so the key derivation —
 * the one piece of logic that has to be identical on the server and in the
 * browser — can be exercised directly.
 *
 * A 1:1 conversation is identified by its two participants, and the row stores
 * them sorted (participant_a < participant_b). Both sides derive the key the
 * same way, so "open a chat with X" is a lookup rather than a search for "a
 * thread that contains me and X".
 */

export interface DmThread {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string | null;
  last_preview: string | null;
  created_at: string;
  /** How far participant_a has read. NULL means "nothing read yet". */
  participant_a_read_at?: string | null;
  /** How far participant_b has read. NULL means "nothing read yet". */
  participant_b_read_at?: string | null;
  /**
   * How far into the future participant_a is still showing this conversation.
   * NULL means not showing it. Always compared against the clock, never trusted
   * as a bare flag — see the presence migration for why.
   */
  participant_a_active_until?: string | null;
  /** Same, for participant_b. */
  participant_b_active_until?: string | null;
  /**
   * How far into the future participant_a is still typing. NULL when idle.
   *
   * Deliberately an expiry and not a boolean, and deliberately much shorter than
   * the presence window: a stale "typing…" claims somebody is composing right
   * now, so it has to stop on its own the moment they stop.
   */
  participant_a_typing_until?: string | null;
  /** Same, for participant_b. */
  participant_b_typing_until?: string | null;
}

export interface DmMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  client_id: string | null;
  /**
   * The message this one quotes, or null. The quoted text is NOT stored here —
   * it is resolved at render time from the thread the client already holds, so
   * private text is never duplicated into a second row.
   */
  reply_to_id?: string | null;
  /**
 * Set instead of deleting the row, within this window of created_at. A NULL
 * means a live message; a set value is a tombstone, and the row keeps existing so
 * replies pointing at it still have something to name.
 */
  deleted_at?: string | null;
  created_at: string;
}

/** How long after sending a message it can still be deleted for everyone. */
export const DELETE_WINDOW_MS = 15 * 60 * 1000;

/** What a tombstone renders as, rather than as an empty bubble. */
export const DELETED_PLACEHOLDER = 'This message was deleted';

/**
 * Whether a message can still be deleted by its sender.
 *
 * `now` is injectable so this is testable at a fixed instant rather than only
 * "right now", which is the only condition that ever actually matters.
 */
export function canDeleteMessage(
  message: { sender_id: string; created_at: string; deleted_at?: string | null },
  viewerId: string,
  now: number = Date.now()
): boolean {
  // Only the author may delete. Letting either party remove a line would turn the
  // conversation into something one person can rewrite.
  if (message.sender_id !== viewerId) return false;
  if (message.deleted_at) return false;
  const sentAt = new Date(message.created_at).getTime();
  if (Number.isNaN(sentAt)) return false;
  return now - sentAt <= DELETE_WINDOW_MS;
}

/** A thread plus the other person's public profile, as the inbox renders it. */
export interface DmConversation extends DmThread {
  peer_id: string;
  peer_name: string;
  peer_handle: string;
  peer_avatar_url: string | null;
  /** Messages in this conversation newer than the reader's cursor. */
  unread_count: number;
}

/**
 * This participant's read cursor in a thread, or null if they have read nothing.
 *
 * The column is picked by which half of the sorted pair the reader is, which is
 * why the row stores them that way in the first place.
 */
export function readCursorOf(
  thread: Pick<DmThread, 'participant_a' | 'participant_b' | 'participant_a_read_at' | 'participant_b_read_at'>,
  viewerId: string
): string | null {
  if (thread.participant_a === viewerId) return thread.participant_a_read_at ?? null;
  if (thread.participant_b === viewerId) return thread.participant_b_read_at ?? null;
  return null;
}

/** The column this reader advances when they mark a thread read. */
export function readCursorColumnFor(
  thread: Pick<DmThread, 'participant_a' | 'participant_b'>,
  viewerId: string
): 'participant_a_read_at' | 'participant_b_read_at' | null {
  if (thread.participant_a === viewerId) return 'participant_a_read_at';
  if (thread.participant_b === viewerId) return 'participant_b_read_at';
  return null;
}

/** The column this participant's presence window is written to. */
export function activeColumnFor(
  thread: Pick<DmThread, 'participant_a' | 'participant_b'>,
  userId: string
): 'participant_a_active_until' | 'participant_b_active_until' | null {
  if (thread.participant_a === userId) return 'participant_a_active_until';
  if (thread.participant_b === userId) return 'participant_b_active_until';
  return null;
}

/** The column this participant's typing window is written to. */
export function typingColumnFor(
  thread: Pick<DmThread, 'participant_a' | 'participant_b'>,
  userId: string
): 'participant_a_typing_until' | 'participant_b_typing_until' | null {
  if (thread.participant_a === userId) return 'participant_a_typing_until';
  if (thread.participant_b === userId) return 'participant_b_typing_until';
  return null;
}

/**
 * How long one typing heartbeat covers.
 *
 * Much shorter than the presence window on purpose: presence can afford twenty
 * seconds because a stale "online" is harmless, while a stale "typing…" is a
 * claim that somebody is composing right now.
 */
export const TYPING_WINDOW_MS = 6_000;

/**
 * Minimum gap between typing writes.
 *
 * A write per keystroke would be a database round trip per character on every
 * device. The indicator only needs to be roughly live, so a burst of typing
 * collapses into one or two writes.
 */
export const TYPING_THROTTLE_MS = 2_500;

/**
 * How long one heartbeat covers.
 *
 * The browser refreshes on this interval while a conversation is open, so the
 * window is comfortably longer than the gap between beats. It is not much longer:
 * a shorter window means a closed tab stops suppressing sooner, and a suppressed
 * notification that is silently withheld forever is far worse than one extra
 * badge for a few seconds.
 */
export const ACTIVE_WINDOW_MS = 20_000;

/** How often the client refreshes while a conversation is open and in front. */
export const ACTIVE_HEARTBEAT_MS = 8_000;

/**
 * Whether a participant is still showing this conversation at `now`.
 *
 * The expiry is what makes presence self-healing: a browser that stops beating —
 * crashed, closed, asleep, navigated away — falls out of the window on its own
 * without anything having to clean up after it.
 */
export function isActiveAt(
  activeUntil: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!activeUntil) return false;
  const until = new Date(activeUntil).getTime();
  // An unparseable timestamp is treated as inactive. Guessing "active" on bad
  // data is the failure mode that loses notifications.
  if (Number.isNaN(until)) return false;
  return until > now;
}

/**
 * Unread count for one conversation, from a flat list of message timestamps.
 *
 * A null cursor means nothing has been read, so every message counts — which is
 * why the cursors are nullable rather than defaulting to created_at. Messages
 * are compared strictly after the cursor, so the message you were reading when
 * you marked it does not reappear as unread.
 */
export function unreadCountFor(
  thread: Pick<DmThread, 'participant_a' | 'participant_b' | 'participant_a_read_at' | 'participant_b_read_at'>,
  viewerId: string,
  messageTimes: Array<string | null | undefined>
): number {
  const cursor = readCursorOf(thread, viewerId);
  if (!cursor) {
    return messageTimes.filter((t): t is string => Boolean(t)).length;
  }
  const at = new Date(cursor).getTime();
  return messageTimes.filter((t): t is string => Boolean(t)).filter(
    (t) => new Date(t).getTime() > at
  ).length;
}

/** Longest message the composer will send. Enforced again by the API. */
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * The other participant of a thread, given who is asking. Returns null when the
 * caller is not part of the thread — the API treats that as "not yours".
 */
export function peerOf(thread: Pick<DmThread, 'participant_a' | 'participant_b'>, viewerId: string): string | null {
  if (thread.participant_a === viewerId) return thread.participant_b;
  if (thread.participant_b === viewerId) return thread.participant_a;
  return null;
}

/**
 * The sorted participant pair for a conversation between two users. Both UUIDs
 * are plain hex with no collation surprises, so plain string comparison matches
 * the `participant_a < participant_b` CHECK constraint in Postgres.
 *
 * Null when either id is missing or the two are the same person — a self-DM is
 * rejected by the database, so there is nothing to derive.
 */
export function pairKey(userA: string, userB: string): { participant_a: string; participant_b: string } | null {
  const a = (userA || '').trim();
  const b = (userB || '').trim();
  if (!a || !b || a === b) return null;
  return a < b ? { participant_a: a, participant_b: b } : { participant_a: b, participant_b: a };
}

/** A short single-line preview for the inbox. Newlines would break the row. */
export function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

/**
 * One line of quoted text, for the reply preview above a composer and the quote
 * strip inside a bubble. Longer than the inbox preview because a quote needs to
 * be readable, not merely identifying.
 */
export function quoteOf(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (!flat) return '(empty message)';
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Resolves each message's quote against the thread.
 *
 * A quote whose target is not in the list resolves to null rather than throwing:
 * that happens when the quoted message is older than the loaded window, and a
 * reply must still render even when what it refers to is off-screen.
 */
export function resolveQuotes<T extends {
  id: string;
  body: string;
  sender_id: string;
  reply_to_id?: string | null;
}>(messages: T[]): Map<string, { body: string; sender_id: string }> {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const quotes = new Map<string, { body: string; sender_id: string }>();

  for (const m of messages) {
    if (!m.reply_to_id) continue;
    // Self-quote is rejected by the database, but the optimistic bubble a user
    // replies to carries its client_id as its own id, so the client can build
    // one locally. Skipped here rather than rendered as a message quoting itself.
    if (m.reply_to_id === m.id) continue;
    // A quote whose target has since been deleted resolves to the tombstone
    // text, not to nothing — "Deleted message" tells the reader the reply did
    // answer something, which an absent quote does not.
    const target = byId.get(m.reply_to_id);
    if (!target) continue;
    const isDeleted = Boolean((target as { deleted_at?: string | null }).deleted_at);
    quotes.set(m.id, {
      body: isDeleted ? 'Deleted message' : quoteOf(target.body),
      sender_id: target.sender_id,
    });
  }

  return quotes;
}