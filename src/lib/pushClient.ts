/**
 * Browser-side Web Push plumbing.
 *
 * Deliberately framework-free: these are plain functions over the Push API so
 * they can be unit-tested and reused outside React. State lives in
 * usePushNotifications.
 *
 * The platform rules encoded here are not obvious and are the usual reason
 * "it works on my machine":
 *
 * - iOS only grants push to a PWA that has been ADDED TO THE HOME SCREEN and
 *   launched from there. In a Safari tab, Notification exists but
 *   requestPermission() never resolves to granted, and subscribing throws. So iOS
 *   is detected and reported separately instead of being reported as broken.
 * - PushManager.subscribe() rejects with NotAllowedError unless called from a
 *   user gesture on iOS, so every entry point here is meant to be called from a
 *   click handler.
 */

export type PushState =
  | 'unsupported'
  | 'insecure'
  | 'ios-not-installed'
  | 'denied'
  | 'default'
  | 'granted-unsubscribed'
  | 'subscribed';

/** Safari on iOS, including iPadOS which reports as MacIntel with touch points. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPadOS 13+ masquerades as desktop Safari
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** The VAPID public key, which is meant to be public. Empty means not configured. */
function vapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
}

/** base64url → Uint8Array, which is the shape applicationServerKey must have. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  // ready can hang if no SW is registered at all, so race it.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!pushSupported()) return 'unsupported';

  const secure =
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  if (!secure) return 'insecure';

  if (isIos() && !isStandalone()) return 'ios-not-installed';

  if (!vapidPublicKey()) return 'unsupported';

  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';

  const reg = await registration();
  const existing = await reg?.pushManager.getSubscription().catch(() => null);
  if (existing) return 'subscribed';

  return permission === 'granted' ? 'granted-unsubscribed' : 'default';
}

/**
 * Ask for permission and register this device. Must be called from a user
 * gesture. Returns the resulting state rather than throwing, because the UI
 * needs to show *why* nothing happened.
 */
export async function enablePush(token: string): Promise<PushState> {
  if (!token) return 'unsupported';

  const current = await getPushState();
  if (current === 'unsupported' || current === 'insecure' || current === 'ios-not-installed') {
    return current;
  }

  const reg = await registration();
  if (!reg) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    const key = vapidPublicKey();
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(subscription.toJSON()),
    });

    if (!res.ok) {
      console.error('Push: server rejected the subscription', res.status);
      return 'granted-unsubscribed';
    }
    return 'subscribed';
  } catch (err) {
    console.error('Push: subscribe failed', err);
    return 'granted-unsubscribed';
  }
}

/** Turn this device off. Safe to call when there is nothing to unsubscribe. */
export async function disablePush(token: string): Promise<PushState> {
  const reg = await registration();
  const existing = await reg?.pushManager.getSubscription().catch(() => null);

  if (existing) {
    // Tell the server first: once the browser subscription is gone locally the
    // endpoint is unrecoverable, and the row would linger until a dead send
    // happened to prune it.
    if (token) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint: existing.endpoint }),
      }).catch(() => undefined);
    }
    await existing.unsubscribe().catch(() => undefined);
  }

  return getPushState();
}
