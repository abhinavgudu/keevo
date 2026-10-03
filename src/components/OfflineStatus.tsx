'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import {
  isServingFromCache,
  notePendingEdits,
  pendingEditCount,
  subscribeConnectivity,
} from '@/lib/connectivity';

/**
 * Says, plainly, that what is on screen is not current.
 *
 * This exists because the alternative is worse. Offline fallback is only useful
 * if the user knows it happened — a vault that quietly serves yesterday's rows
 * looks exactly like a vault where someone deleted things, and someone will act
 * on that. The queued-edit count is in the same line for the same reason: work
 * that has not reached the server yet is not saved, and saying so is cheaper
 * than losing it.
 *
 * The `online` and `visibilitychange` listeners are what stop this banner lying
 * in the other direction. `navigator.onLine` alone never returns to false after
 * a blip on many platforms, so without a re-check on foreground the banner can
 * sit there claiming to be offline while the app is quietly refetching fine.
 */
export function OfflineBanner() {
  // Initialised from module state rather than set inside the effect, so the
  // first paint already agrees with the server render. `navigator.onLine` is
  // deliberately not read here: it differs between the server and the browser,
  // and initialising from it would be a hydration mismatch.
  const [stale, setStale] = useState(isServingFromCache);
  const [pending, setPending] = useState(pendingEditCount);
  const [browserOffline, setBrowserOffline] = useState(false);

  useEffect(() => {
    const sync = () => {
      setStale(isServingFromCache());
      setPending(pendingEditCount());
      setBrowserOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    };
    // Deferred to a microtask rather than run in the effect body. `navigator`
    // is only meaningful after commit, and reading it synchronously here would
    // set three pieces of state before the browser has painted, which is a
    // cascading render for no gain.
    queueMicrotask(sync);

    const unsub = subscribeConnectivity(sync);
    const onOnline = () => sync();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    // Coming back to the tab is the other moment the truth can have changed.
    document.addEventListener('visibilitychange', sync);

    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  if (!stale && !browserOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-[65] flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-amber-500/15 border border-amber-500/40 backdrop-blur-xl shadow-lg shadow-amber-500/10 animate-in fade-in slide-in-from-top-4"
    >
      {browserOffline ? (
        <CloudOff className="w-4 h-4 text-amber-300 shrink-0" />
      ) : (
        <RefreshCw className="w-4 h-4 text-amber-300 shrink-0" />
      )}
      <p className="text-[11.5px] font-semibold text-amber-100 leading-tight">
        {browserOffline ? 'Offline' : 'Showing saved copy'}
        {pending > 0 && (
          <span className="font-normal text-amber-200/80">
            {' '}
            — {pending} {pending === 1 ? 'edit' : 'edits'} waiting to sync
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Replays the outbox when connectivity returns, and keeps the pending count
 * honest the rest of the time.
 *
 * Mounted once at the root rather than per page: a queued edit has to be flushed
 * even if the user has navigated somewhere that never touches the vault.
 */
export function OfflineSync() {
  useEffect(() => {
    let cancelled = false;

    const refreshCount = async () => {
      if (cancelled) return;
      const { listPendingNotes } = await import('@/lib/offlineStore');
      const { getVaultUserId } = await import('@/lib/storage');
      const userId = getVaultUserId();
      if (cancelled || !userId) return;
      const rows = await listPendingNotes(userId);
      if (cancelled) return;
      notePendingEdits(rows.length);
    };

    const flush = async () => {
      if (cancelled) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      const [{ listPendingNotes, dropPendingNote }, { getVaultUserId }, { VaultStorage }] =
        await Promise.all([
          import('@/lib/offlineStore'),
          import('@/lib/storage'),
          import('@/lib/storage'),
        ]);

      const userId = getVaultUserId();
      if (!userId) return;

      const rows = await listPendingNotes(userId);
      for (const row of rows) {
        if (cancelled) return;
        // A failure here leaves the row queued, which is the point: it is
        // retried on the next foreground rather than dropped on the floor.
        const saved = await VaultStorage.saveNotes(row.itemId, row.notes);
        if (saved && row.key !== undefined) await dropPendingNote(row.key);
      }

      await refreshCount();
    };

    void refreshCount();
    void flush();

    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    const onVisible = () => {
      void refreshCount();
      void flush();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}