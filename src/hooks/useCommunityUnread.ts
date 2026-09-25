'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const COMMUNITY_SEEN_KEY = 'keeva_community_last_seen_time';

export function useCommunityUnread() {
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();
  const { user } = useAuth();

  const checkUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/community/items');
      if (!res.ok) return;
      const data = await res.json();
      const items = data.items || [];

      // Get last seen timestamp from localStorage
      let lastSeenStr = localStorage.getItem(COMMUNITY_SEEN_KEY);
      
      // If never visited before, set baseline to now so historical items don't trigger unread badge
      if (!lastSeenStr) {
        const nowStr = Date.now().toString();
        localStorage.setItem(COMMUNITY_SEEN_KEY, nowStr);
        lastSeenStr = nowStr;
      }

      const lastSeenTime = parseInt(lastSeenStr, 10) || Date.now();
      const currentUserId = user?.id;

      // Filter unread items (items created after lastSeenTime and NOT created by current user)
      const unreadItems = items.filter((item: any) => {
        const itemTime = new Date(item.created_at).getTime();
        const isOtherUser = !currentUserId || item.user_id !== currentUserId;
        return itemTime > lastSeenTime && isOtherUser;
      });

      setUnreadCount(unreadItems.length);
    } catch (e) {
      console.error('Error checking community unread count:', e);
    }
  }, [user]);

  // Mark all read when visiting /community
  const markAsRead = useCallback(() => {
    localStorage.setItem(COMMUNITY_SEEN_KEY, Date.now().toString());
    setUnreadCount(0);
  }, []);

  // Update on route change
  useEffect(() => {
    if (pathname === '/community') {
      markAsRead();
    } else {
      checkUnread();
    }
  }, [pathname, checkUnread, markAsRead]);

  // Periodic polling every 20 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (pathname !== '/community') {
        checkUnread();
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [pathname, checkUnread]);

  return { unreadCount, markAsRead, refreshUnread: checkUnread };
}
