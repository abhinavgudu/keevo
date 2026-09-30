'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const SNOOZE_MS = 15 * 60 * 1000;

/**
 * Persistent push-permission nudge.
 *
 * This is intentionally not a one-time tooltip. A signed-in user on a capable
 * device keeps seeing it until the device reaches `subscribed`. "Later" only
 * snoozes the card for a short period; the underlying state still controls
 * visibility, so a reload or a later app visit brings it back if alerts are
 * still off.
 */
export function PushPermissionNudge() {
  const { state, busy, enable, refresh } = usePushNotifications();
  const [snoozed, setSnoozed] = useState(false);
  const snoozeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (snoozeTimer.current !== null) {
        window.clearTimeout(snoozeTimer.current);
        snoozeTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);

    const handleVisible = () => {
      if (document.visibilityState === 'visible') refresh().catch(() => undefined);
    };
    const handleInstalled = () => refresh().catch(() => undefined);

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [refresh]);

  const snooze = useCallback(() => {
    setSnoozed(true);
    if (snoozeTimer.current !== null) window.clearTimeout(snoozeTimer.current);
    // Later is only a pause. The card, reload behavior, and subscription state
    // decide long-term visibility, so this returns if alerts are still off.
    snoozeTimer.current = window.setTimeout(() => {
      setSnoozed(false);
      snoozeTimer.current = null;
    }, SNOOZE_MS);
  }, []);

  const eligible =
    state === 'default' || state === 'granted-unsubscribed' || state === 'denied';
  if (!eligible || snoozed) return null;

  const blocked = state === 'denied';

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Turn on Keeva notifications"
      className="fixed inset-x-3 bottom-24 z-[70] sm:inset-x-auto sm:right-6 sm:bottom-8 sm:w-[24rem] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="rounded-3xl border border-amber-400/50 bg-slate-950/95 p-4 shadow-2xl shadow-amber-500/20 backdrop-blur-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">
              Alerts are off
            </p>
            <h2 className="mt-0.5 text-sm font-black text-white">
              Turn on notifications for this device
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              {blocked
                ? 'Notifications are blocked for Keeva on this device. Open Chrome site settings, or Android Settings > Apps > Chrome > Notifications, set notifications to Allow, then tap Check again.'
                : state === 'granted-unsubscribed'
                  ? 'Permission is granted. Tap once below to finish registering this device for reminders and community alerts.'
                  : 'Keeva can remind you to post and alert you about comments, replies, mentions, and likes. This reminder stays until alerts are turned on.'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={snooze}
            className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
          >
            Later
          </button>
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="flex-[2] rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-3 py-2.5 text-xs font-bold text-white shadow-lg shadow-orange-500/30 transition-all active:scale-95 disabled:opacity-60"
          >
            {busy ? 'Working…' : blocked ? 'Check again' : 'Turn on alerts'}
          </button>
        </div>
      </div>
    </div>
  );
}
