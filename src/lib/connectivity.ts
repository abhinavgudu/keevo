'use client';

/**
 * Whether the app is currently showing data it had to fall back on.
 *
 * This is deliberately separate from `navigator.onLine`, which only says the
 * device has *a* network interface — it reports true on a captive portal and on
 * a laptop whose wifi is associated but has no route out. That makes it useless
 * as a signal for "what the user is looking at right now".
 *
 * The two real states the UI must distinguish:
 *   - online:  what is on screen came from the server
 *   - offline: what is on screen came from the cache, and edits are queued
 *
 * The second is the one worth telling the user about, because they are about to
 * make decisions on data that is not current.
 */

type Listener = () => void;

let servingFromCache = false;
let pendingSync = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the last vault load fell back to the offline cache. */
export function isServingFromCache(): boolean {
  return servingFromCache;
}

/** Called by the storage layer when it falls back to cached rows. */
export function noteOfflineSource(): void {
  if (servingFromCache) return;
  servingFromCache = true;
  emit();
}

/** Called when a real server response lands, which clears the stale flag. */
export function noteOnlineSource(): void {
  if (!servingFromCache) return;
  servingFromCache = false;
  emit();
}

/** Edits waiting in the outbox to be replayed. */
export function pendingEditCount(): number {
  return pendingSync;
}

export function notePendingEdits(count: number): void {
  if (count === pendingSync) return;
  pendingSync = count;
  emit();
}