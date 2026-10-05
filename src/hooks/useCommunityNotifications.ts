'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { CommunityNotification } from '@/lib/communityNotifications';

const POLL_MS = 120_000;

/**
 * The community activity feed: new posts, comments, replies, mentions and likes.
 *
 * This is NOT the Community tab badge. That badge counts unread POSTS and is
 * computed in the browser by useCommunityUnread from keeva_community_last_seen_time.
 * The two share no state, no storage key and no query on purpose — mixing them
 * would make "unread posts" mean "unread everything", which the badge must not.
 *
 * Read state lives in the database rather than localStorage, so it follows the
 * member across devices instead of resetting on a new browser.
 */
// Module-level shared state across all hook instances (Header bell, Community page bell, etc.)
let sharedNotifications: CommunityNotification[] = [];
let sharedLoaded = false;
const listeners = new Set<(items: CommunityNotification[]) => void>();
let lastFetchTimestamp = 0;
let inFlightRequest: Promise<CommunityNotification[] | null> | null = null;
const NOTIFICATIONS_THROTTLE_MS = 30_000;

function setSharedNotifications(items: CommunityNotification[]) {
  sharedNotifications = items;
  sharedLoaded = true;
  listeners.forEach((listener) => listener(items));
}

export function useCommunityNotifications() {
  const { user, session } = useAuth();
  const token = session?.access_token;
  const authed = !!user && !!token;

  const [notifications, setLocalNotifications] = useState<CommunityNotification[]>(sharedNotifications);
  const [loaded, setLocalLoaded] = useState(sharedLoaded);
  const [stateToken, setStateToken] = useState(token);

  useEffect(() => {
    listeners.add(setLocalNotifications);
    setLocalNotifications(sharedNotifications);
    setLocalLoaded(sharedLoaded);
    return () => {
      listeners.delete(setLocalNotifications);
    };
  }, []);

  // Drop notifications the instant the session changes
  if (token !== stateToken) {
    setStateToken(token);
    sharedNotifications = [];
    sharedLoaded = false;
    lastFetchTimestamp = 0;
    setLocalNotifications([]);
    setLocalLoaded(false);
  }

  const refresh = useCallback(() => {
    if (!token) return;

    const now = Date.now();
    if (inFlightRequest) return inFlightRequest;
    if (now - lastFetchTimestamp < NOTIFICATIONS_THROTTLE_MS && sharedLoaded) {
      return Promise.resolve(sharedNotifications);
    }
    lastFetchTimestamp = now;

    const run = async (): Promise<CommunityNotification[] | null> => {
      try {
        const res = await fetch('/api/community/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const next = Array.isArray(data.notifications) ? data.notifications : [];
        setSharedNotifications(next);
        setLocalLoaded(true);
        return next;
      } catch (err) {
        console.error('Error checking community notifications:', err);
        return null;
      } finally {
        inFlightRequest = null;
      }
    };

    inFlightRequest = run();
    return inFlightRequest;
  }, [token]);

  // One effect for both the first fetch and the poll, so there is a single place
  // that decides "this member wants a feed" and a single place to tear it down.
  useEffect(() => {
    if (!authed) return;

    refresh();
    const interval = setInterval(() => {
      // Don't poll Supabase when tab is in background/minimized
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      refresh();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [authed, refresh]);

  // Coming back into the tab is the cheapest moment to catch up, and it avoids a
  // poll landing while the member was looking at something else.
  useEffect(() => {
    if (!authed) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [authed, refresh]);

  // Derived rather than stored, so the badge and the list can never disagree
  // about what is unread. The API returns at most the same 50 rows it counts.
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications]
  );

  /** Flip local read state so the UI reacts immediately, then persist. */
  const applyRead = useCallback((ids: string[] | 'all') => {
    const now = new Date().toISOString();
    const hit = ids === 'all' ? new Set(sharedNotifications.map((n) => n.id)) : new Set<string>(ids);
    const updated = sharedNotifications.map((n) => (hit.has(n.id) && !n.read_at ? { ...n, read_at: now } : n));
    setSharedNotifications(updated);
  }, []);

  const persist = useCallback(
    (payload: { ids: string[] } | { all: true }) => {
      if (!token) return;
      return fetch('/api/community/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          // A rejected write means the server still thinks these are unread, so
          // pull the truth back rather than leaving a badge that lies.
          if (!res.ok) refresh();
        })
        .catch(() => refresh());
    },
    [refresh, token]
  );

  const markRead = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      applyRead(ids);
      persist({ ids });
    },
    [applyRead, persist]
  );

  const markAllRead = useCallback(() => {
    applyRead('all');
    persist({ all: true });
  }, [applyRead, persist]);

  return {
    notifications,
    unreadCount,
    loading: authed && !loaded,
    markRead,
    markAllRead,
    refresh,
  };
}
