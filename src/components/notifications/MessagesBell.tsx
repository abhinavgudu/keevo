'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Entry point to the inbox, with a total unread badge.
 *
 * Fetched separately from the notification bell on purpose: the bell counts
 * "activity you have not seen", this counts "messages you have not read". They
 * clear at different moments — opening a conversation clears this one and
 * deliberately leaves the bell line standing — so merging them into one number
 * would make both of them wrong.
 *
 * Only refreshes on mount and on focus, so it is not a poll. A count that is
 * briefly stale after a message arrives on another tab is preferable to a
 * request every few seconds from every open page.
 */
export function MessagesBell({ className = '' }: { className?: string }) {
  const { session } = useAuth();
  const [unread, setUnread] = useState(0);

  const load = useCallback((token: string) => {
    return fetch('/api/community/messages', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (body) setUnread(body.total_unread ?? 0);
      })
      .catch(() => {
        /* a failed count refresh leaves the last known number on screen */
      });
  }, []);

  const token = session?.access_token;

  useEffect(() => {
    if (!token) return;
    void load(token);
  }, [token, load]);

  useEffect(() => {
    if (!token) return;
    const onFocus = () => void load(token);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [token, load]);

  if (!token) return null;

  return (
    <Link
      href="/messages"
      aria-label={unread > 0 ? `Messages (${unread} unread)` : 'Messages'}
      title="Messages"
      className={`relative p-2 sm:p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all ${className}`}
    >
      <MessagesSquare className="w-4 h-4" />
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 text-white text-[9.5px] font-black shadow-lg shadow-cyan-500/40 border-2 border-[#06070B]">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}