// Keeva PWA Service Worker v2.0
// Offline capability, web push, and self-update.
//
// Bumped when the pre-cache list or the push handler changes, so a device
// holding the old worker purges its stale copies instead of serving them.
const CACHE_NAME = 'keeva-pwa-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/keeva-logo.png',
  '/keeva-icon.png',
  '/keeva-logo.svg',
  // The push notification icon. Pre-cached so a notification raised while the
  // device is offline still resolves an image instead of a blank square.
  '/notification-icon.png',
];

// Install: pre-cache essential assets
//
// skipWaiting() is deliberately NOT unconditional. A new worker taking over while
// a page is open leaves that page executing the OLD bundle — and Next.js deletes
// the old hashed chunks on deploy, so the next navigation finds a chunk that no
// longer exists and the app white-screens. Instead:
//
//   - No window is open  → take over silently; nobody can be holding a stale page.
//   - A window is open    → wait, and let the page ask via SKIP_WAITING once the
//                          user accepts the update (see PwaUpdatePrompt).
//
// An update that lands while the app is closed is applied on next launch with no
// prompt, which is the common case and needs none.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(STATIC_ASSETS);
      } catch (err) {
        console.warn('PWA Pre-cache notice:', err);
      }

      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      if (windows.length === 0) {
        await self.skipWaiting();
      }
    })()
  );
});

// The page accepted the update. Called only on a deliberate user action, so it
// is the one place a swap is guaranteed not to interrupt typing.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first, fallback to cache for offline resilience
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API routes, chrome-extension, and non-http schemes
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    !url.protocol.startsWith('http')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache successful responses for static assets and pages
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Return cached version when offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Fallback to root for navigations
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// ── Web Push ─────────────────────────────────────────────────────────────────
//
// Everything above only helps while the app is open. These two handlers are the
// reason a phone buzzes when the app is closed, which is the whole point of the
// push_subscriptions table.
//
// The payload is built server-side (src/lib/pushSender.ts) and already carries
// the deep link, so the service worker stays a dumb display surface and never has
// to know how a notification maps to a screen.

self.addEventListener('push', (event) => {
  // A push with no body, or with a non-JSON body, is legal — fall back to a
  // generic notification rather than dropping the event and showing nothing.
  //
  // Everything is inside the waitUntil promise because PushMessageData.json()
  // returns a Promise, not a parsed object. Assigning it to a variable from a
  // synchronous handler left `data` holding an unresolved Promise, so every
  // field read below came back undefined and every notification rendered with
  // the bare defaults — title 'Keeva', no body, and a dead deep link. text() is
  // the synchronous read, and the body can only be consumed once, so it is
  // parsed here rather than calling json() on a second read.
  event.waitUntil(
    (async () => {
      let data = {};
      if (event.data) {
        try {
          const raw = event.data.text();
          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch {
              // Plain text instead of JSON: still better than showing nothing.
              data = { title: raw, body: '' };
            }
          }
        } catch {
          data = {};
        }
      }

      const title = (data && data.title) || 'Keeva';

      await self.registration.showNotification(title, {
        body: (data && data.body) || 'You have new activity in the community.',
        icon: (data && data.icon) || '/notification-icon.png',
        badge: (data && data.badge) || '/notification-icon.png',
        // Scoped per post by the sender, so several comments on one post replace
        // each other in the tray instead of stacking up.
        tag: (data && data.tag) || undefined,
        // Android only; ignored elsewhere.
        vibrate: [60, 40, 60],
        data: { url: (data && data.url) || '/community' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Resolve against our own origin so a malformed or absolute payload from a
  // stale client cannot turn this into a redirect off-site.
  let target;
  try {
    target = new URL((event.notification.data && event.notification.data.url) || '/community', self.location.origin);
  } catch {
    target = new URL('/community', self.location.origin);
  }
  if (target.origin !== self.location.origin) {
    target = new URL('/community', self.location.origin);
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Prefer an existing window: it keeps the app's session and scroll state,
      // which is why this does not unconditionally open a new tab.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ('focus' in client) await client.focus();
        // The page reads its target from the URL, so navigating is what actually
        // carries the deep link across. Skipped when it is already the same URL
        // to avoid pointless reloads.
        if (client.url !== target.href && 'navigate' in client) {
          await client.navigate(target.href);
        }
        return;
      }

      await self.clients.openWindow(target.href);
    })()
  );
});
