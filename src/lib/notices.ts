'use client';

/**
 * A single app-wide place for transient notices.
 *
 * Exists because every silent failure in this codebase was the same mistake in
 * different components: an optimistic update was rolled back on failure and the
 * user was shown nothing. A Follow that flashes back to "Follow" looks
 * identical to a Follow that never registered — and the same for a like, a
 * comment that did not post, a category that did not save. No visible cause
 * means no way to tell a bug from a mis-click, and no way to report it.
 *
 * One store rather than per-component state so the wording and placement are
 * the same everywhere, and so a component that has no UI of its own (a toggle
 * button, a card) can still say what went wrong.
 *
 * Errors auto-dismiss: an action that failed is not a state the user needs to
 * manage, and a toast that has to be cleared is a toast that gets missed.
 */

export type NoticeKind = 'error' | 'success';

export interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
}

type Listener = (notices: Notice[]) => void;

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(notices);
}

export function subscribeNotices(listener: Listener): () => void {
  listeners.add(listener);
  listener(notices);
  return () => listeners.delete(listener);
}

/**
 * Push a notice. Errors are the reason this exists; successes are allowed
 * because a component that already has no toast of its own still wants to
 * confirm an action it otherwise performs invisibly.
 */
export function notify(message: string, kind: NoticeKind = 'error'): void {
  const id = nextId++;
  notices = [...notices, { id, kind, message }];
  emit();

  const ttl = kind === 'error' ? 6000 : 3000;
  setTimeout(() => dismissNotice(id), ttl);
}

export function dismissNotice(id: number): void {
  const before = notices.length;
  notices = notices.filter((n) => n.id !== id);
  if (notices.length !== before) emit();
}

export function currentNotices(): Notice[] {
  return notices;
}

/**
 * Turns a thrown fetch into wording a user can act on.
 *
 * "Network error" alone told them nothing about which of the two causes it was,
 * and only one of the two is fixed by waiting. Kept here so every call site
 * says the same thing for the same situation.
 */
export function describeSendFailure(err: unknown, action: string): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return `You are offline. ${action} didn't go through.`;
  }
  return `Could not reach the server. ${action} didn't go through.`;
}