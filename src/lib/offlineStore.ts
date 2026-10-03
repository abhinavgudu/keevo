/**
 * Offline cache for the vault, and an outbox for writes made while offline.
 *
 * IndexedDB rather than the service worker cache, for one reason that decides
 * everything else here: the worker's cache is keyed by URL, and every vault
 * request carries a bearer token in the header, not the URL. A URL-keyed cache
 * cannot tell one member's vault from another's, so on a shared device the
 * second person to sign in would be served the first person's private content.
 * Keying on the user id inside the app makes that impossible by construction,
 * and gives a place to hang the delete on sign-out.
 *
 * Everything is in-memory-bypassing: callers are responsible for treating a
 * cache hit as stale data, because it is. That is surfaced in the UI rather than
 * hidden here — a user who cannot tell they are looking at yesterday's vault
 * will make decisions on it.
 */

import type { ContentItem } from '@/types/vault';

const DB_NAME = 'keeva-offline';
const DB_VERSION = 1;
const ITEMS_STORE = 'items';
const OUTBOX_STORE = 'outbox';

/** A notes edit made offline, waiting to be replayed. */
export interface PendingNotesEdit {
  /** Outbox row id, needed to delete the row once it lands. */
  key?: number;
  userId: string;
  itemId: string;
  notes: string;
  /** When the edit was made, used to drop edits superseded by a later one. */
  queuedAt: number;
}

export function isOfflineCapable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase | null> {
  if (!isOfflineCapable()) return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Private-mode Firefox and locked-down WebViews throw on open. Offline
      // support is an enhancement here, never a requirement, so a failure to
      // open degrades to "no cache" rather than breaking the app.
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        // Key is `${userId}|${itemId}`. The user id leads so a single range
        // delete on sign-out is one operation rather than a scan.
        const items = db.createObjectStore(ITEMS_STORE, { keyPath: 'key' });
        // Needed to read one member's vault and to erase it without loading
        // every other member's rows into memory first.
        items.createIndex('userId', 'userId', { unique: false });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: 'key', autoIncrement: true });
        // Lets a new edit for an item find and replace its predecessor.
        outbox.createIndex('itemId', 'itemId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function tx(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode
): { store: IDBObjectStore; done: Promise<void> } {
  const transaction = db.transaction(store, mode);
  const objectStore = transaction.objectStore(store);
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return { store: objectStore, done };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function itemKey(userId: string, itemId: string): string {
  return `${userId}|${itemId}`;
}

/**
 * Mirrors the caller's vault into the cache. Best-effort by design: a cache
 * write that fails must never turn a successful fetch into an error, because
 * the user already has their data in that case.
 */
export async function cacheItems(userId: string, items: ContentItem[]): Promise<void> {
  if (!userId || !items.length) return;
  const db = await openDb();
  if (!db) return;

  try {
    const { store, done } = tx(db, ITEMS_STORE, 'readwrite');
    for (const item of items) {
      store.put({
        key: itemKey(userId, item.id),
        userId,
        itemId: item.id,
        cachedAt: Date.now(),
        item,
      });
    }
    await done;
  } catch {
    /* cache miss later is an acceptable outcome */
  } finally {
    db.close();
  }
}

/** The cached vault for one member. Empty array when nothing is cached yet. */
export async function readCachedItems(userId: string): Promise<ContentItem[]> {
  if (!userId) return [];
  const db = await openDb();
  if (!db) return [];

  try {
    const { store } = tx(db, ITEMS_STORE, 'readonly');
    const rows = (await request(store.index('userId').getAll(userId))) as Array<{
      item: ContentItem;
    }>;
    return rows.map((row) => row.item);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Applies a notes edit to the cached copy too.
 *
 * Without this, a note written offline would be invisible on the next offline
 * load — the cache would be overwritten by the next successful fetch carrying
 * the pre-edit notes, and the user would think their edit vanished.
 */
export async function patchCachedNotes(
  userId: string,
  itemId: string,
  notes: string
): Promise<void> {
  if (!userId) return;
  const db = await openDb();
  if (!db) return;

  try {
    const { store, done } = tx(db, ITEMS_STORE, 'readwrite');
    const row = await request(store.get(itemKey(userId, itemId)));
    if (row) {
      store.put({
        ...row,
        item: { ...row.item, notes },
        cachedAt: Date.now(),
      });
    }
    await done;
  } catch {
    /* best effort */
  } finally {
    db.close();
  }
}

/**
 * Queues a notes edit for replay.
 *
 * Only the newest edit per item is kept: someone who types five words into a note
 * while offline should cause one write, not five, and replaying all five in
 * order would put the same bytes on the wire five times.
 */
export async function enqueueNotesEdit(edit: Omit<PendingNotesEdit, 'key' | 'queuedAt'>): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    const { store, done } = tx(db, OUTBOX_STORE, 'readwrite');
    const existing = (await request(
      store.index('itemId').getAllKeys(IDBKeyRange.only(edit.itemId))
    )) as IDBValidKey[];
    for (const key of existing) store.delete(key);

    store.add({ ...edit, queuedAt: Date.now() });
    await done;
  } catch {
    /* the caller already showed the optimistic value */
  } finally {
    db.close();
  }
}

/** Pending edits, oldest first, so replay order matches the order they were made. */
export async function listPendingNotes(userId: string): Promise<PendingNotesEdit[]> {
  if (!userId) return [];
  const db = await openDb();
  if (!db) return [];

  try {
    const { store } = tx(db, OUTBOX_STORE, 'readonly');
    const rows = (await request(store.getAll())) as PendingNotesEdit[];
    return rows.filter((r) => r.userId === userId).sort((a, b) => a.queuedAt - b.queuedAt);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function dropPendingNote(key: number): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const { store, done } = tx(db, OUTBOX_STORE, 'readwrite');
    store.delete(key);
    await done;
  } catch {
    /* harmless */
  } finally {
    db.close();
  }
}

/**
 * Everything cached for one member.
 *
 * Called on sign-out. A shared device that keeps the previous member's vault in
 * IndexedDB hands it to whoever signs in next, so this is not optional cleanup.
 */
export async function clearOfflineDataFor(userId: string): Promise<void> {
  if (!userId) return;
  const db = await openDb();
  if (!db) return;

  try {
    // Both stores are keyed off the user id, so erasing one member's data is a
    // read of their keys and nothing more. Walking with a cursor and awaiting
    // inside the transaction would let the transaction auto-close between
    // iterations and abort.
    const items = tx(db, ITEMS_STORE, 'readwrite');
    const itemKeys = (await request(items.store.index('userId').getAllKeys(userId))) as IDBValidKey[];
    for (const key of itemKeys) items.store.delete(key);
    await items.done;

    const outbox = tx(db, OUTBOX_STORE, 'readwrite');
    const pending = (await request(
      outbox.store.getAll()
    )) as Array<{ userId?: string; key?: IDBValidKey }>;
    for (const row of pending) {
      if (row.userId === userId && row.key !== undefined) outbox.store.delete(row.key);
    }
    await outbox.done;
  } catch {
    /* nothing actionable at sign-out time */
  } finally {
    db.close();
  }
}