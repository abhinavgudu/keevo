/**
 * Deep links from a notification to the exact community post it is about.
 *
 * These live in their own module because both the notification bell and the
 * community page need them, and either one importing the other would be a cycle.
 */

/**
 * Fired by the bell when a notification is clicked while the community feed is
 * already on screen. Pushing a different query string does not remount the page,
 * so the feed needs to be told directly; when the feed is not mounted yet it
 * reads the same values off the URL instead.
 */
export const FOCUS_POST_EVENT = 'keeva:focus-community-post';

export type PostFocus = { postId: string; focusComposer: boolean };

/** Kinds where writing back is almost certainly the next thing wanted. */
const CONVERSATION_KINDS = ['comment', 'reply', 'mention'];

export function isConversationKind(kind: string): boolean {
  return CONVERSATION_KINDS.includes(kind);
}

export function buildCommunityPostHref(itemId: string | null, kind: string): string {
  if (!itemId) return '/community';
  return `/community?post=${encodeURIComponent(itemId)}${isConversationKind(kind) ? '&reply=1' : ''}`;
}

export function notifyCommunityPostFocus(postId: string, focusComposer: boolean) {
  window.dispatchEvent(
    new CustomEvent<PostFocus>(FOCUS_POST_EVENT, { detail: { postId, focusComposer } })
  );
}

export function readPostFocusFromUrl(): PostFocus | null {
  const params = new URLSearchParams(window.location.search);
  const postId = params.get('post');
  if (!postId) return null;
  return { postId, focusComposer: params.get('reply') === '1' };
}

/**
 * Deep link to one conversation. Kept next to the post links because the bell
 * decides between them in the same switch, and a DM thread has no post id.
 *
 * Falls back to the inbox for a missing thread rather than to /community: a
 * conversation that cannot open should still land the user somewhere useful.
 */
export function buildDmThreadHref(threadId: string | null): string {
  if (!threadId) return '/messages';
  return `/messages?thread=${encodeURIComponent(threadId)}`;
}

/** The conversation the inbox should open on mount, if the URL names one. */
export function readDmThreadFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('thread');
}
