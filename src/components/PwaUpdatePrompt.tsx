'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Detects a deployed update and offers to load it.
 *
 * Why this component exists at all, when the worker already calls
 * `skipWaiting()` and the install prompt already calls `registration.update()`:
 * a new worker going live does NOT reload the page. The open tab keeps running
 * the JavaScript bundle it loaded, and because Next.js deletes the previous
 * deploy's hashed chunks, the next navigation on that tab asks for a chunk that
 * no longer exists — the app white-screens. Nothing about that is recoverable
 * from inside the app, which is why it presents as "the PWA broke" and gets
 * blamed on the install.
 *
 * So the update is shown, not forced. It is deliberately not a silent reload:
 * a PWA tab is often left open on a comment composer or a half-written note, and
 * an automatic reload discards that text with no way back. One tap, and the swap
 * is clean.
 *
 * The reload waits for `controllerchange` rather than firing on click, so the
 * page only reloads once the new worker is genuinely in charge — reloading
 * earlier would race the swap and land back on the old bundle.
 */

/** How often to ask the server whether a newer worker exists. */
const UPDATE_POLL_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt() {
  const [waiting, setWaiting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  // Guards the reload so a stray second controllerchange cannot loop.
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let detach: (() => void) | null = null;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registrationRef.current = reg;

        // A worker that installed while we were away is already parked in
        // `waiting` by the time this runs, so this check has to come first.
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(true);

        const onUpdateFound = () => {
          const installing = reg.installing;
          if (!installing) return;
          // `installed` means the new worker finished precaching but is waiting
          // for the page to let it take over. Anything else — a failed install,
          // for instance — leaves the current worker untouched and must not show
          // a prompt the user cannot act on.
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(true);
            }
          });
        };

        reg.addEventListener('updatefound', onUpdateFound);

        const check = () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => undefined);
          }
        };

        // Browsers re-check the worker on navigation only, so a device left open
        // on one screen would otherwise never see a deploy. Visibility covers the
        // return-to-app case and the hourly poll covers the tab nobody switches
        // back to.
        document.addEventListener('visibilitychange', check);
        window.addEventListener('focus', check);
        const poll = setInterval(check, UPDATE_POLL_MS);

        detach = () => {
          reg.removeEventListener('updatefound', onUpdateFound);
          document.removeEventListener('visibilitychange', check);
          window.removeEventListener('focus', check);
          clearInterval(poll);
        };
      })
      .catch((err) => console.warn('Keeva PWA SW registration notice:', err));

    return () => detach?.();
  }, []);

  // The new worker takes control the moment it calls skipWaiting. Reloading on
  // this event, and not on the click itself, is what guarantees the page is
  // never left running against a worker that is on its way out.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onControllerChange = () => {
      if (!reloadingRef.current) return;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  const applyUpdate = useCallback(() => {
    const reg = registrationRef.current;
    if (!reg) {
      // No registration to hand over to: a plain reload still picks up new HTML.
      window.location.reload();
      return;
    }
    reloadingRef.current = true;
    setReloading(true);

    const waiting = reg.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Backstop. controllerchange should fire within milliseconds, but if the
    // worker refuses to take over the user must not be left on a dead button.
    setTimeout(() => {
      if (!reloadingRef.current) return;
      window.location.reload();
    }, 2000);
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 md:bottom-6 left-4 sm:left-6 z-[70] w-[calc(100vw-2rem)] max-w-sm rounded-2xl bg-slate-950/95 border border-cyan-500/40 shadow-2xl shadow-cyan-500/20 backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
          <RefreshCw className={`w-4 h-4 text-cyan-300 ${reloading ? 'animate-spin' : ''}`} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-white leading-tight">
            {reloading ? 'Updating…' : 'Update available'}
          </p>
          <p className="text-[11.5px] text-slate-400 mt-0.5 leading-snug">
            {reloading
              ? 'Reloading to the latest version.'
              : 'A newer version of Keeva is ready. Reload to switch — anything half-typed will be lost.'}
          </p>
        </div>

        {!reloading && (
          <button
            onClick={() => setWaiting(false)}
            aria-label="Dismiss update prompt"
            className="shrink-0 p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!reloading && (
        <div className="flex gap-2 px-3.5 pb-3.5">
          <button
            onClick={applyUpdate}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-indigo-500 transition-all active:scale-[0.98]"
          >
            Reload now
          </button>
          <button
            onClick={() => setWaiting(false)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
}