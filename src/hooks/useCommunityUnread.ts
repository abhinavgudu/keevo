'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const COMMUNITY_SEEN_KEY = 'keeva_community_last_seen_time';
const POLL_INTERVAL_MS = 120_000; // Check at most once every 2 minutes
const THROTTLE_MS = 60_000; // Don't refetch if fetched in the last minute

// Module-level shared state across all hook instances (Header, MobileBottomNav, etc.)
// Prevents duplicate concurrent fetches and duplicate intervals.
let sharedUnreadCount = 0;
const listeners = new Set<(count: number) => void>();
let lastFetchTimestamp = 0;
let inFlightRequest: Promise<number> | null = null;

function setSharedCount(count: number) {
  sharedUnreadCount = count;
  listeners.forEach((listener) => listener(count));
}

async function fetchUnreadCount(userId?: string): Promise<number> {
  const now = Date.now();
  if (inFlightRequest) return inFlightRequest;
  if (now - lastFetchTimestamp < THROTTLE_MS) return sharedUnreadCount;

  lastFetchTimestamp = now;

  const run = async (): Promise<number> => {
    try {
      const lastSeenStr = typeof window !== 'undefined' ? localStorage.getItem(COMMUNITY_SEEN_KEY) : null;
      const lastSeenTime = lastSeenStr ? parseInt(lastSeenStr, 10) || 0 : 0;

      const params = new URLSearchParams({
        since: lastSeenTime.toString(),
      });
      if (userId) {
        params.set('userId', userId);
      }

      // Use the lightweight count endpoint instead of downloading the entire public feed
      const res = await fetch(`/api/community/unread-count?${params.toString()}`);
      if (!res.ok) return sharedUnreadCount;

      const data = await res.json();
      const count = typeof data.unreadCount === 'number' ? data.unreadCount : 0;
      setSharedCount(count);
      return count;
    } catch (e) {
      console.error('Error checking community unread count:', e);
      return sharedUnreadCount;
    } finally {
      inFlightRequest = null;
    }
  };

  inFlightRequest = run();
  return inFlightRequest;
}

export function useCommunityUnread() {
  const [unreadCount, setLocalCount] = useState(sharedUnreadCount);
  const pathname = usePathname();
  const { user } = useAuth();
  const userId = user?.id;

  // Subscribe to shared count
  useEffect(() => {
    listeners.add(setLocalCount);
    setLocalCount(sharedUnreadCount);
    return () => {
      listeners.delete(setLocalCount);
    };
  }, []);

  const checkUnread = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    await fetchUnreadCount(userId);
  }, [userId]);

  // Mark all read when visiting /community
  const markAsRead = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(COMMUNITY_SEEN_KEY, Date.now().toString());
    }
    setSharedCount(0);
  }, []);

  // Update on route change
  useEffect(() => {
    if (pathname === '/community') {
      markAsRead();
    } else {
      void checkUnread();
    }
  }, [pathname, checkUnread, markAsRead]);

  // Re-check when user switches back to the tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pathname !== '/community') {
        void checkUnread();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname, checkUnread]);

  // Periodic polling every 60s, ONLY while tab is visible and not on /community
  useEffect(() => {
    const interval = setInterval(() => {
      if (pathname !== '/community' && document.visibilityState === 'visible') {
        void checkUnread();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pathname, checkUnread]);

  return { unreadCount, markAsRead, refreshUnread: checkUnread };
}
