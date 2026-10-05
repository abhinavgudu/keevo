'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { DmConversation } from '@/lib/messages';
import { readDmThreadFromUrl } from '@/lib/communityDeepLink';
import { LoadingCircle } from '@/components/LoadingCircle';
import { MessageThread } from '@/components/members/MessageThread';

/**
 * The inbox: every conversation you are part of, newest activity first.
 *
 * There is no poll. The list is fetched on open, and a conversation that has
 * received a message while the tab is open is picked up on window focus, which
 * covers the case that actually matters — you switch back to the tab and expect
 * the unread count to have moved.
 */

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function MessagesPage() {
  const { session, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<DmConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The conversation the user chose here, as opposed to one named in the URL.
  const [chosen, setChosen] = useState<DmConversation | null>(null);

  const token = session?.access_token;

  // A notification deep-links here as /messages?thread=<id>. The conversation
  // shown is derived rather than stored: a row the user taps wins, and only
  // until then does the deep-linked one apply. Resolved against the fetched list
  // so a stale or guessed id falls back to the inbox instead of an empty chat.
  //
  // Read after commit rather than during render. This page is statically
  // prerendered, so touching `window` while rendering it fails the build with
  // "window is not defined" — the URL search string is a client-only concern.
  const [requestedThreadId, setRequestedThreadId] = useState<string | null>(null);
  useEffect(() => {
    queueMicrotask(() => setRequestedThreadId(readDmThreadFromUrl()));
  }, []);

  const deepLinked = requestedThreadId
    ? conversations?.find((c) => c.id === requestedThreadId) ?? null
    : null;
  const open = chosen ?? deepLinked;

  // Derived from the list rather than stored, so a badge cannot disagree with
  // the rows it is counting. Reading a conversation zeroes its row through
  // markThreadRead, and the total follows.
  const totalUnread = conversations?.reduce((sum, c) => sum + c.unread_count, 0) ?? 0;

  const markThreadRead = useCallback((threadId: string) => {
    setConversations((prev) => {
      if (!prev) return prev;
      const match = prev.find((c) => c.id === threadId);
      if (!match || match.unread_count === 0) return prev;
      return prev.map((c) => (c.id === threadId ? { ...c, unread_count: 0 } : c));
    });
  }, []);

  /**
   * Fetches the inbox and writes it to state. Memoized so it does not change
   * identity on every render and trigger infinite effect loops.
   */
  const load = useCallback((authToken: string) => {
    return fetch('/api/community/messages', { headers: { Authorization: `Bearer ${authToken}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body) {
          setError('Could not load your messages.');
          setConversations([]);
          return;
        }
        setError(null);
        setConversations(body.conversations ?? []);
      })
      .catch(() => {
        /* a failed refresh must not replace what is already on screen */
      });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.replace('/auth/signin');
      return;
    }
    void load(token);
  }, [authLoading, token, router, load]);

  // Refetch when the tab regains focus, so a message that arrived while the
  // user was elsewhere is reflected on return.
  useEffect(() => {
    if (!token) return;
    const onFocus = () => void load(token);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [token, load]);

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-100">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-16">
        <Link
          href="/community"
          aria-label="Back to community"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Community
        </Link>

        <div className="mt-4 mb-1 flex items-baseline gap-2.5">
          <h1 className="text-2xl font-black tracking-tight text-white">Messages</h1>
          {totalUnread > 0 && (
            <span className="rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 text-white text-[11px] font-black px-2 py-0.5 shadow-lg shadow-cyan-500/25">
              {totalUnread > 99 ? '99+' : totalUnread} unread
            </span>
          )}
        </div>
        <p className="text-[13px] text-slate-500 mb-6">
          Private conversations with other members of the community.
        </p>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300">
            {error}
          </div>
        )}

        {conversations === null ? (
          <div className="py-20 flex items-center justify-center">
            <LoadingCircle className="w-8 h-8" label="Loading messages" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-3xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
              <MessagesSquare className="w-8 h-8 text-cyan-400" />
            </div>
            <h2 className="text-base font-bold text-white mb-1.5">No conversations yet</h2>
            <p className="text-sm text-slate-400 max-w-sm">
              Open a member&apos;s profile and press Message to start talking.
            </p>
            <Link
              href="/community"
              className="mt-5 px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 transition-colors"
            >
              Find people
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setChosen(c)}
                  aria-label={
                    c.unread_count > 0
                      ? `${c.peer_name}, ${c.unread_count} unread`
                      : `Conversation with ${c.peer_name}`
                  }
                  className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl border transition-colors ${
                    c.unread_count > 0
                      ? 'bg-cyan-500/[0.07] border-cyan-500/25 hover:border-cyan-500/40'
                      : 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/30'
                  }`}
                >
                  {c.peer_avatar_url ? (
                    <img
                      src={c.peer_avatar_url}
                      alt={c.peer_name}
                      className="w-11 h-11 rounded-full object-cover border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950 flex items-center justify-center font-black shrink-0">
                      {c.peer_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      {/* Unread conversations read as unread in the weight of the
                          name, so the state survives greyscale and colour-blind
                          vision — the badge alone would not. */}
                      <span
                        className={`truncate ${c.unread_count > 0 ? 'font-black text-white' : 'font-bold text-white'}`}
                      >
                        {c.peer_name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 ml-auto shrink-0">
                        {relativeTime(c.last_message_at || c.created_at)}
                      </span>
                    </div>
                    <p
                      className={`text-xs truncate ${
                        c.unread_count > 0 ? 'text-slate-200 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {c.last_preview || 'No messages yet'}
                    </p>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="shrink-0 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 text-white text-[10px] font-black shadow-lg shadow-cyan-500/30">
                      {c.unread_count > 99 ? '99+' : c.unread_count}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <MessageThread
          threadId={open.id}
          peer={{
            id: open.peer_id,
            name: open.peer_name,
            handle: open.peer_handle,
            avatar_url: open.peer_avatar_url,
          }}
          onClose={() => {
            setChosen(null);
            if (token) void load(token);
          }}
          onSent={() => {
            if (token) void load(token);
          }}
          onRead={() => {
            if (open.id) markThreadRead(open.id);
          }}
        />
      )}
    </div>
  );
}