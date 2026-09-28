'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/pushClient';

/**
 * Push permission state for this device, plus the two actions.
 *
 * Only tracks the *current* device. Another device the same person enabled push
 * on is a separate subscription row and is not represented here, which is why
 * the UI phrases the control as "this device" rather than "notifications".
 */
export function usePushNotifications() {
  const { user, session } = useAuth();
  const token = session?.access_token;
  const authed = !!user && !!token;

  const [resolved, setResolved] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    getPushState()
      .then((next) => {
        if (!cancelled) setResolved(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authed]);

  // For a signed-out visitor there is nothing to enable and nothing to say, and
  // "unsupported" already renders as no control at all. Deriving it beats
  // calling setState in the effect body, which costs an extra render pass.
  const state = authed ? resolved : 'unsupported';

  const enable = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      setResolved(await enablePush(token));
    } finally {
      setBusy(false);
    }
  }, [token, busy]);

  const disable = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      setResolved(await disablePush(token));
    } finally {
      setBusy(false);
    }
  }, [token, busy]);

  return {
    state,
    busy,
    enabled: state === 'subscribed',
    /** Copy is derived from state so the same reason is never worded two ways. */
    reason: PUSH_REASONS[state] ?? null,
    canEnable: state === 'default' || state === 'granted-unsubscribed' || state === 'denied',
    enable,
    disable,
  };
}

/** Why the toggle is unavailable, or what happened. Null when it just works. */
const PUSH_REASONS: Record<PushState, string | null> = {
  unsupported: 'This browser does not support push notifications.',
  insecure: 'Notifications need a secure (https) connection.',
  'ios-not-installed':
    'On iPhone, add Keeva to the Home Screen and open it from there — that is the only way iOS allows notifications.',
  denied: 'Notifications are blocked for this site. Re-enable them in your browser settings.',
  default: 'Turn on notifications to get alerts when someone comments, replies, mentions or likes you.',
  'granted-unsubscribed': 'Permission was granted but this device was not registered. Try turning it on again.',
  subscribed: null,
};
