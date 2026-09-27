'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { CommunityNotification } from '@/lib/communityNotifications';

const POLL_MS = 20000;

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
export function useCommunityNotifications() {
  const { user, session } = useAuth();
  const token = session?.access_token;
  const authed = !!user && !!token;

  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stateToken, setStateToken] = useState(token);

  // Drop the previous member's notifications the instant the session changes, so
  // signing out and back in as somebody else can never flash their feed. Done
  // during render rather than in an effect, which is the documented way to react
  // to a changed input without cascading a second render through the tree.
  if (token !== stateToken) {
    setStateToken(token);
    setNotifications([]);
    setLoaded(false);
  }

  const refresh = useCallback(() => {
    if (!token) return;

    const run = async (): Promise<CommunityNotification[] | null> => {
      try {
        const res = await fetch('/api/community/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data.notifications) ? data.notifications : [];
      } catch (err) {
        // A failed poll is not worth surfacing — the bell keeps its last known
        // state and tries again on the next tick.
        console.error('Error checking community notifications:', err);
        return null;
      }
    };

    // State is only ever set from inside this callback, never from the body of
    // the function the effect calls. That keeps the update in the "response to
    // an external system" category rather than a synchronous render cascade.
    run().then((next) => {
      if (next) setNotifications(next);
      setLoaded(true);
    });
  }, [token]);

  // One effect for both the first fetch and the poll, so there is a single place
  // that decides "this member wants a feed" and a single place to tear it down.
  useEffect(() => {
    if (!authed) return;

    refresh();
    const interval = setInterval(refresh, POLL_MS);
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
    setNotifications((prev) => {
      const hit =
        ids === 'all' ? new Set(prev.map((n) => n.id)) : new Set<string>(ids);
      return prev.map((n) => (hit.has(n.id) && !n.read_at ? { ...n, read_at: now } : n));
    });
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
