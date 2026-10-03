'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Send, Loader2, CornerUpLeft, X, AlertCircle, CheckCheck, Copy, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import {
  ACTIVE_HEARTBEAT_MS,
  ACTIVE_WINDOW_MS,
  DELETED_PLACEHOLDER,
  MAX_MESSAGE_LENGTH,
  TYPING_THROTTLE_MS,
  canDeleteMessage,
  isActiveAt,
  quoteOf,
  resolveQuotes,
  type DmMessage,
  type DmThread,
} from '@/lib/messages';
import { LoadingCircle } from '@/components/LoadingCircle';
import { describeSendFailure, notify } from '@/lib/notices';

/**
 * One 1:1 conversation.
 *
 * Delivery is Realtime: the channel is filtered to this thread and RLS decides
 * which inserts actually arrive, so a listener on someone else's conversation
 * receives nothing. A failed subscribe is not fatal — the conversation still
 * loads on open and the send path refetches — but it is surfaced, because a
 * chat that silently stops updating is the kind of bug nobody reports.
 *
 * The sender is optimistic: the line appears immediately with the client_id it
 * was sent under, and the server row replaces it when it lands. The same
 * client_id makes a retry safe, so a failed send can be retried without risking
 * a duplicate.
 */

interface Props {
  threadId: string;
  peer: {
    id: string;
    name: string;
    handle: string;
    avatar_url: string | null;
  };
  onClose: () => void;
  onSent?: () => void;
  /**
   * Called when this thread's unread count reaches zero — on open and again on
   * every message that arrives while it is open. The inbox uses it to clear its
   * own badges without refetching the whole list.
   */
  onRead?: () => void;
}

interface PendingMessage extends DmMessage {
  pending: true;
}

/** A line on screen: either a stored message or one still being sent. */
type ShownMessage = DmMessage | PendingMessage;

function isPending(m: ShownMessage): m is PendingMessage {
  return (m as PendingMessage).pending === true;
}

/** "Today" / "Yesterday" / a date, for the separators in the transcript. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Clock time on a bubble, so a long transcript stays readable. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/**
 * "last seen 5m ago", from an expired presence window.
 *
 * The window holds a future timestamp, so once it lapses the moment they were
 * last present is that timestamp minus the window length — not the timestamp
 * itself. Reading it raw would report them as seen slightly in the future.
 */
function lastSeenLabel(activeUntil: string | null): string {
  if (!activeUntil) return 'recently';
  const seenAt = new Date(activeUntil).getTime() - ACTIVE_WINDOW_MS;
  if (Number.isNaN(seenAt)) return 'recently';
  const mins = Math.floor((Date.now() - seenAt) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function Avatar({ peer, size = 'md' }: { peer: Props['peer']; size?: 'md' | 'sm' }) {
  const cls = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-10 h-10 text-sm';
  if (peer.avatar_url) {
    return (
      <img
        src={peer.avatar_url}
        alt={peer.name}
        className={`${cls} rounded-full object-cover border border-slate-700 shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${cls} rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950 flex items-center justify-center font-black shrink-0`}
    >
      {(peer.name || 'K').charAt(0).toUpperCase()}
    </div>
  );
}

export function MessageThread({ threadId, peer, onClose, onSent, onRead }: Props) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  // Which thread the loaded messages belong to. Loading is derived from this
  // rather than a separate flag, so switching threads cannot leave the previous
  // conversation's messages on screen next to a spinner.
  const [loadedThreadId, setLoadedThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = loadedThreadId !== threadId;
  const [draft, setDraft] = useState('');
  // The message the next send will quote. Null means an ordinary reply.
  const [replyTo, setReplyTo] = useState<{ id: string; body: string; sender_id: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);

  // ── Conversation state the transcript draws from ──────────────────────────
  /** The other person's read cursor: what turns a tick blue. */
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  /** The caller's own cursor: what separates read from unread. */
  const [myReadAt, setMyReadAt] = useState<string | null>(null);
  const [peerActiveUntil, setPeerActiveUntil] = useState<string | null>(null);
  const [peerTypingUntil, setPeerTypingUntil] = useState<string | null>(null);
  /** In-chat search. Filters the transcript rather than hiding the composer. */
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const token = session?.access_token;

  // Load history once per thread. Nothing is set synchronously in the effect
  // body: `loading` is derived from loadedThreadId, and the error is cleared
  // inside the request, so opening a chat cannot cascade a render.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/community/messages/${threadId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        setError(null);
        if (!res.ok) {
          setError(body.error || 'Could not open this conversation.');
          // Marked loaded so the error shows instead of an endless spinner.
          setLoadedThreadId(threadId);
          return;
        }
        setMessages(body.messages ?? []);
        setMyReadAt(body.my_read_at ?? null);
        setPeerReadAt(body.peer_read_at ?? null);
        setPeerActiveUntil(body.peer_active_until ?? null);
        setPeerTypingUntil(body.peer_typing_until ?? null);
        setLoadedThreadId(threadId);
      } catch {
        if (cancelled) return;
        setError('Network error. Please try again.');
        setLoadedThreadId(threadId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId, token]);

  /**
   * Advance this reader's cursor. Fire-and-forget: a failure only leaves the
   * badge looking stale until the next refetch, which is never worth showing an
   * error for.
   */
  const markRead = useCallback(() => {
    if (!token) return;
    void fetch(`/api/community/messages/${threadId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      /* the badge heals on the next inbox refresh */
    });
    onRead?.();
  }, [threadId, token, onRead]);

  // Opening a conversation is what "reading" it means.
  useEffect(() => {
    if (loadedThreadId !== threadId) return;
    markRead();
  }, [loadedThreadId, threadId, markRead]);

  /**
 * Tells the server this conversation is on screen, so a message arriving here
 * does not also ring a bell.
 *
 * Only runs while the tab is actually visible and focused. A thread sitting open
 * in a background tab is not being read, and suppressing notifications for it
 * would lose messages the user never saw — the badge would be gone and the
 * signal with it. The window this buys expires on its own, so a closed or
 * crashed tab needs no cleanup.
 */
useEffect(() => {
    if (!token || !loadedThreadId) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const beat = (typing?: boolean) => {
      void fetch(`/api/community/messages/${threadId}/active`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Sent only when the flag is known; omitted entirely otherwise so an
        // untype beat does not clear a typing state we never claimed.
        body: typeof typing === 'boolean' ? JSON.stringify({ typing }) : undefined,
      }).catch(() => {
        /* presence is best-effort; losing it only means an extra bell */
      });
    };

    const watching = () => document.visibilityState === 'visible' && document.hasFocus();

    const sync = () => {
      const active = watching();
      if (active && !timer) {
        beat();
        timer = setInterval(beat, ACTIVE_HEARTBEAT_MS);
      } else if (!active && timer) {
        // Stop the beat. The window drains on its own — no "leave" call to get
        // wrong, and nothing to leak if the tab is killed instead.
        clearInterval(timer);
        timer = null;
      }
    };

    sync();
    const onActivity = () => sync();
    document.addEventListener('visibilitychange', onActivity);
    window.addEventListener('focus', onActivity);
    window.addEventListener('blur', onActivity);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onActivity);
      window.removeEventListener('focus', onActivity);
      window.removeEventListener('blur', onActivity);
    };
  }, [threadId, token, loadedThreadId]);

  /**
   * Pushes this user's typing state, throttled.
   *
   * A write per keystroke would be a database round trip per character on every
   * device. The indicator only needs to be roughly live, so the first keystroke
   * writes immediately and the rest collapse into one write per interval. Sending
   * `false` on send and on unmount means the indicator clears the moment they
   * stop rather than lingering until the window drains.
   */
  const lastTypingSent = useRef(0);
  const typingRef = useRef(false);

  const signalTyping = useCallback(
    (typing: boolean) => {
      if (!token || typingRef.current === typing) return;
      const now = Date.now();
      if (typing && now - lastTypingSent.current < TYPING_THROTTLE_MS) return;
      typingRef.current = typing;
      lastTypingSent.current = now;
      void fetch(`/api/community/messages/${threadId}/active`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ typing }),
      }).catch(() => {
        /* best-effort; the window drains on its own */
      });
    },
    [threadId, token]
  );

  // Stops claiming to be typing when the conversation closes, so the other person
  // is not left with a composer indicator for somebody who has left.
  useEffect(() => {
    return () => {
      if (!typingRef.current) return;
      typingRef.current = false;
      if (!token) return;
      // keepalive so the clear survives the request the unmount is tearing down
      void fetch(`/api/community/messages/${threadId}/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ typing: false }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [threadId, token]);

  /**
   * Keeps the peer strip fresh.
   *
   * Presence and typing are written by the other device, so the only way to see
   * them is to ask. The interval is shorter than the typing window so an
   * indicator cannot visibly outlive the typing it reports.
   */
  useEffect(() => {
    if (!token || !loadedThreadId) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const res = await fetch(`/api/community/messages/${threadId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setPeerReadAt(body.peer_read_at ?? null);
        setPeerActiveUntil(body.peer_active_until ?? null);
        setPeerTypingUntil(body.peer_typing_until ?? null);
      } catch {
        /* a failed poll leaves the last known state on screen */
      }
    };

    void pull();
    const timer = setInterval(pull, 4_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [threadId, token, loadedThreadId]);

  // Realtime for this thread. The filter is scoped to the thread id; RLS is what
  // actually decides delivery, so the filter is an optimisation, not the guard.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session?.access_token) return;

    const channel = supabase
      .channel(`dm:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `thread_id=eq.${threadId}` },
        (payload: { new: Record<string, unknown> }) => {
          const incoming = payload.new as unknown as DmMessage;
          setMessages((prev) => {
            // The sender also gets its own insert back. Drop the optimistic copy
            // in favour of the server row, and ignore anything already listed
            // so a refetch plus a live event cannot double a line.
            const withoutOptimistic = prev.filter(
              (m) => !(isPending(m) && m.client_id && m.client_id === incoming.client_id)
            );
            if (withoutOptimistic.some((m) => m.id === incoming.id)) return withoutOptimistic;
            return [...withoutOptimistic, incoming];
          });

          // A message that lands while the conversation is open and the tab is
          // in front is read by definition. The window focus check is what keeps
          // a chat open in a background tab from quietly draining the badge.
          if (document.visibilityState === 'visible' && document.hasFocus()) {
            markRead();
            // Advanced locally as well: the cursor write is fire-and-forget and
            // can be seconds behind, and a divider that outlives the message it
            // is marking read looks like the unread marker is broken.
            setMyReadAt(new Date().toISOString());
          }
        }
      )
      // The peer flipping their read cursor is what turns the tick on your own
      // outgoing messages blue, and it is a row update on the thread rather than
      // an insert on the messages table — without this a read receipt would only
      // refresh when the chat happened to be reopened.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dm_threads', filter: `id=eq.${threadId}` },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as unknown as DmThread;
          if (!row || !myId) return;
          const iAmA = row.participant_a === myId;
          setPeerReadAt((iAmA ? row.participant_b_read_at : row.participant_a_read_at) ?? null);
          setPeerActiveUntil((iAmA ? row.participant_b_active_until : row.participant_a_active_until) ?? null);
          setPeerTypingUntil((iAmA ? row.participant_b_typing_until : row.participant_a_typing_until) ?? null);
        }
      )
      .subscribe((status: string) => {
        setLive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, session?.access_token, markRead]);

  // Coming back to the tab with the conversation open clears whatever arrived
  // while it was in the background.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') markRead();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  // Pin to the newest line whenever the list grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    // Captured before the state is cleared below, so the optimistic bubble can
    // already carry its quote rather than showing one only after it lands.
    const quoteTarget = replyTo;
    const quote = quoteTarget
      ? { body: quoteTarget.body, sender_id: quoteTarget.sender_id }
      : null;

    // Generated per attempt and reused for the retry, so a timeout can be
    // retried without posting the same line twice.
    const clientId = crypto.randomUUID();
    const optimistic: PendingMessage = {
      id: clientId,
      thread_id: threadId,
      sender_id: session?.user?.id ?? '',
      recipient_id: peer.id,
      body: text,
      client_id: clientId,
      reply_to_id: quoteTarget?.id ?? null,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    // Stop claiming to be typing the moment the line goes out, rather than
    // leaving the indicator up until the window drains.
    signalTyping(false);
    setReplyTo(null);
    setSending(true);

    try {
      const res = await fetch(`/api/community/messages/${threadId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          body: text,
          client_id: clientId,
          reply_to_id: quoteTarget?.id ?? null,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Put the line back in the box rather than dropping what was written.
        setDraft((prev) => (prev ? `${text}\n${prev}` : text));
        setMessages((prev) => prev.filter((m) => m.id !== clientId));
        // The quote is restored too, or a retried reply silently stops quoting.
        if (quote) setReplyTo(quoteTarget);
        setError(body.error || 'Message could not be sent.');
        return;
      }

      setMessages((prev) => prev.map((m) => (m.id === clientId ? body.message : m)));
      // The caller has by definition read their own message, so the unread
      // divider must not be drawn above it while the cursor catches up.
      setMyReadAt(new Date().toISOString());
      onSent?.();
    } catch (err) {
      // A thrown fetch is a transport failure, not a rejection by the server.
      // Naming which one matters: "Network error" for both meant a dropped
      // connection and a blocked request were indistinguishable, and the second
      // one is fixed by signing in again while the first is not.
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setError(
        offline
          ? 'You are offline. Your message was not sent — it is still in the box.'
          : `Could not reach the server${(err as Error)?.message ? ` (${(err as Error).message})` : ''}. Your message is still in the box.`
      );
      setDraft((prev) => (prev ? `${text}\n${prev}` : text));
      setMessages((prev) => prev.filter((m) => m.id !== clientId));
      if (quote) setReplyTo(quoteTarget);
    } finally {
      setSending(false);
    }
  };

  const myId = session?.user?.id;

  /**
   * Delete a message for everyone.
   *
   * Confirming first is not politeness, it is the whole point: this removes a
   * line from the other person's copy too, so an accidental click would erase
   * something they may have already read. The optimistic tombstone is applied
   * locally so the bubble reacts immediately; a refusal puts the text back,
   * because a deleted-looking message that is still there is worse than a delay.
   */
  const requestDelete = async (messageId: string, body: string) => {
    if (!token) return;
    const ok = window.confirm('Delete this message for both of you?');
    if (!ok) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, deleted_at: new Date().toISOString(), body: DELETED_PLACEHOLDER }
          : m
      )
    );

    try {
      const res = await fetch(`/api/community/messages/message/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, deleted_at: null, body } : m))
        );
        notify(payload.error || "Couldn't delete that message.");
        return;
      }
      notify('Message deleted for everyone');
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deleted_at: null, body } : m))
      );
      notify(describeSendFailure(err, 'Deleting that message'));
    }
  };

  // Quotes are resolved from the thread already in memory. Recomputed whenever
  // the list changes, which also covers a message arriving over Realtime.
  const quotes = resolveQuotes(messages);

  // ── Derived transcript model ───────────────────────────────────────────────
  // Built once per render so the date separators, the unread divider and the read
  // ticks are all decided from the same pass — three separate filters over the
  // same list is how they end up disagreeing with each other.
  const peerReadMs = peerReadAt ? new Date(peerReadAt).getTime() : 0;
  const myReadMs = myReadAt ? new Date(myReadAt).getTime() : 0;

  // In-chat search narrows the transcript. Matched messages keep their order and
  // everything else is dropped rather than greyed, because a result list you have
  // to read around defeats the point of searching.
  const searchTerm = query.trim().toLowerCase();
  const visibleMessages = useMemo(
    () =>
      searchTerm
        ? messages.filter((m) => m.body.toLowerCase().includes(searchTerm))
        : messages,
    [messages, searchTerm]
  );
  const matchCount = searchTerm ? visibleMessages.length : 0;

  // One entry per rendered bubble, carrying what the separators need.
  const rendered = useMemo(() => {
    const isNewerThanCursor = (m: ShownMessage) =>
      myReadMs > 0 && new Date(m.created_at).getTime() > myReadMs;

    // Pure index math rather than a running flag: mutable locals captured inside
    // a memo are exactly the shape that makes two passes disagree.
    const firstUnread = visibleMessages.findIndex(isNewerThanCursor);

    return visibleMessages.map((m, i) => {
      const previous = i > 0 ? visibleMessages[i - 1] : null;
      const day = new Date(m.created_at).toDateString();
      const showDay = !previous || new Date(previous.created_at).toDateString() !== day;

      return {
        message: m,
        showDay,
        dayLabel: showDay ? dayLabel(m.created_at) : '',
        // The divider goes above the first unread message, and exactly once.
        showUnread: i === firstUnread && firstUnread >= 0,
      };
    });
  }, [visibleMessages, myReadMs]);

  const peerIsOnline = isActiveAt(peerActiveUntil);
  const peerIsTyping = isActiveAt(peerTypingUntil) && peerIsOnline;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#06070B]/95 backdrop-blur-xl">
      {/* Header — the only way out of the conversation on mobile. */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/70 shrink-0">
        <button
          onClick={onClose}
          aria-label="Back"
          className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Avatar peer={peer} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{peer.name}</p>
          {/* One line carries whichever of the three states is true, in priority
              order. Stacking them would make the header reflow on every keystroke
              anywhere in the app. */}
          <p
            className={`text-[11px] font-mono truncate ${
              peerIsTyping
                ? 'text-cyan-300'
                : peerIsOnline
                  ? 'text-emerald-400'
                  : 'text-slate-500'
            }`}
            aria-live="polite"
          >
            {peerIsTyping ? 'typing…' : peerIsOnline ? 'online' : `last seen ${lastSeenLabel(peerActiveUntil)}`}
          </p>
        </div>

        <button
          onClick={() => {
            setSearching((s) => !s);
            if (searching) setQuery('');
          }}
          aria-label={searching ? 'Close search' : 'Search in conversation'}
          title="Search in conversation"
          aria-pressed={searching}
          className={`p-2 rounded-xl border transition-colors shrink-0 ${
            searching
              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
              : 'bg-slate-800/70 hover:bg-slate-700 border-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          {searching ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>

        {!live && (
          <span
            className="text-[10px] font-mono text-amber-400/90 shrink-0"
            title="Live updates are not connected — messages will still send, but new ones may not appear until you reopen this chat."
          >
            offline
          </span>
        )}
      </header>

      {/* In-chat search. Sits under the header so the transcript keeps its
          position, and shows the hit count because a filtered transcript with
          no count reads as messages having gone missing. */}
      {searching && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in this conversation…"
              aria-label="Search in this conversation"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800/70 border border-slate-700 text-[13px] text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500/50"
            />
          </div>
          <span className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums">
            {searchTerm ? `${matchCount}` : ''}
          </span>
        </div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <LoadingCircle className="w-8 h-8" label="Loading messages" />
          </div>
        ) : error && messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
            <Avatar peer={peer} size="sm" />
            <p className="text-sm font-bold text-white">This is the start of your conversation</p>
            <p className="text-xs text-slate-500 max-w-xs">
              Messages here are private to you and {peer.name}.
            </p>
          </div>
        ) : matchCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
            <p className="text-sm font-bold text-white">No messages match “{query.trim()}”</p>
            <button
              onClick={() => {
                setQuery('');
                setSearching(false);
              }}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-2.5">
            {rendered.map(({ message: m, showDay, dayLabel: label, showUnread }, i) => {
              const mine = m.sender_id === myId;
              const previous = rendered[i - 1]?.message;
              // Group consecutive lines from the same person, the way a chat
              // reads, instead of one bubble per line. A reply always starts its
              // own group — the quote it carries is the visual separator.
              const grouped = previous?.sender_id === m.sender_id && !m.reply_to_id;
              const quote = quotes.get(m.id);
              // Read is decided against the OTHER person's cursor. "Delivered"
              // is deliberately absent: nothing in this schema can prove a device
              // received a message, and a tick that claims delivery without
              // evidence is worse than no tick at all.
              const seenByPeer = !mine && !isPending(m) && peerReadMs > 0 &&
                new Date(m.created_at).getTime() <= peerReadMs;
              const mineRead = mine && peerReadMs > 0 &&
                new Date(m.created_at).getTime() <= peerReadMs;

              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex items-center gap-3 py-3 select-none">
                      <span className="h-px flex-1 bg-slate-800" />
                      <span className="text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
                        {label}
                      </span>
                      <span className="h-px flex-1 bg-slate-800" />
                    </div>
                  )}
                  {showUnread && (
                    <div className="flex items-center gap-3 py-2 select-none">
                      <span className="h-px flex-1 bg-cyan-500/40" />
                      <span className="text-[10.5px] font-mono uppercase tracking-wider text-cyan-400/90">
                        Unread
                      </span>
                      <span className="h-px flex-1 bg-cyan-500/40" />
                    </div>
                  )}

                  <div
                    className={`group flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* Hidden until hover on a pointer, always visible on touch:
                        `hover:` never fires on a phone, so a hover-only control is
                        a control that does not exist for half the users. */}
                    <button
                      onClick={() => setReplyTo({ id: m.id, body: m.body, sender_id: m.sender_id })}
                      aria-label={`Reply to this message${mine ? ' from you' : ` from ${peer.name}`}`}
                      title="Reply"
                      className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-cyan-300 hover:bg-slate-800 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <CornerUpLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(m.body);
                        notify('Message copied');
                      }}
                      aria-label="Copy message"
                      title="Copy"
                      className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-cyan-300 hover:bg-slate-800 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {/* Delete for everyone, inside the window. Shown only when the
                        server would actually allow it, so the control never
                        appears for something that is going to be refused. */}
                    {!m.deleted_at && canDeleteMessage(m, myId ?? '') && (
                      <button
                        onClick={() => requestDelete(m.id, m.body)}
                        aria-label="Delete message for everyone"
                        title="Delete for everyone"
                        className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div
                      className={`max-w-[80%] sm:max-w-[70%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed break-words ${
                        mine
                          ? 'bg-gradient-to-br from-cyan-500 to-indigo-600 text-white rounded-br-md'
                          : 'bg-slate-800/80 text-slate-200 border border-slate-700/60 rounded-bl-md'
                      } ${grouped ? (mine ? 'rounded-tr-md' : 'rounded-tl-md') : ''} ${
                        isPending(m) ? 'opacity-60' : ''
                      }`}
                    >
                      {/* The quoted line. Resolved from the loaded thread rather
                          than stored, so a reply still renders when the message it
                          quotes is older than the loaded window — it just falls
                          back to naming the sender. */}
                      {m.reply_to_id && (
                        <div
                          className={`mb-1.5 border-l-2 pl-2 py-0.5 ${
                            mine ? 'border-white/50' : 'border-cyan-400'
                          }`}
                        >
                          <p className={`text-[10.5px] font-bold ${mine ? 'text-white/80' : 'text-cyan-300'}`}>
                            {quote?.sender_id === myId ? 'You' : peer.name}
                          </p>
                          <p className={`text-[11.5px] ${mine ? 'text-white/75' : 'text-slate-400'}`}>
                            {quote?.body ?? 'Quoted a message'}
                          </p>
                        </div>
                      )}

                      <span className={`whitespace-pre-wrap ${m.deleted_at ? 'italic opacity-70' : ''}`}>
                        {m.deleted_at ? DELETED_PLACEHOLDER : m.body}
                      </span>

                      <span className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
                        <span
                          className={`text-[9.5px] font-mono ${
                            mine ? 'text-white/60' : 'text-slate-500'
                          }`}
                        >
                          {clockTime(m.created_at)}
                        </span>
                        {mine && (
                          <CheckCheck
                            className={`w-3 h-3 ${
                              mineRead ? 'text-sky-300' : 'text-white/50'
                            }`}
                            aria-label={mineRead ? 'Read' : 'Sent'}
                          />
                        )}
                        {seenByPeer && (
                          <span className="sr-only">Read by {peer.name}</span>
                        )}
                      </span>

                      {isPending(m) && (
                        <Loader2 className="w-3 h-3 inline ml-1.5 animate-spin align-[-2px]" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Shown whether or not any message has loaded. Gating this on
          messages.length > 0 hid the one failure a new conversation hits first:
          sending its very first message. A send that fails silently in an empty
          thread looks exactly like a send button that does nothing. */}
      {error && (
        <p className="px-4 pb-2 text-[11.5px] text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}

      {/* Composer */}
      <footer className="border-t border-slate-800 bg-slate-900/70 px-4 py-3 shrink-0">
        <div className="max-w-2xl mx-auto">
          {/* What the next message will quote. Dismissible, because picking the
              wrong message should not force a cancel before writing. */}
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 pl-1">
              <div className="flex-1 min-w-0 border-l-2 border-cyan-400 pl-2.5">
                <p className="text-[10px] font-mono text-cyan-300/90 uppercase tracking-wider">
                  Replying to {replyTo.sender_id === myId ? 'yourself' : peer.name}
                </p>
                <p className="text-xs text-slate-400 truncate">{quoteOf(replyTo.body, 120)}</p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
              // Typing state is pushed on a throttle inside signalTyping; an
              // empty box means they stopped.
              signalTyping(e.target.value.length > 0);
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter is a newline — the convention every
              // chat uses, so Enter must not also insert a line.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={
              replyTo ? `Replying to ${replyTo.sender_id === myId ? 'yourself' : peer.name}…` : `Message ${peer.name}…`
            }
            aria-label={`Message ${peer.name}`}
            className="flex-1 resize-none rounded-2xl bg-slate-800/70 border border-slate-700 px-4 py-2.5 text-[13px] text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500/50 max-h-32"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-indigo-500 transition-all active:scale-95 disabled:opacity-40 disabled:shadow-none shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Small entry point for a member profile: opens the conversation with that
 * person, creating the thread on first use. Returns null when signed out, so
 * the profile page decides whether to prompt instead.
 */
export function MessageButton({
  peerId,
  peerName,
  peerHandle,
  peerAvatarUrl,
  className = '',
}: {
  peerId: string;
  peerName: string;
  peerHandle: string;
  peerAvatarUrl?: string | null;
  className?: string;
}) {
  const { session } = useAuth();
  const [thread, setThread] = useState<DmThread | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session?.access_token) return null;

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch('/api/community/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_id: peerId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not open a conversation.');
        return;
      }
      setThread(body.thread);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      {/* The button and its error are one unit. The error used to live only in
          the button's title attribute — an invisible tooltip — so any failure
          here presented as a button that does nothing when pressed. */}
      <div className="inline-flex flex-col gap-1.5">
        <button
          onClick={open}
          disabled={opening}
          aria-label={`Message ${peerName}`}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 hover:border-cyan-500/40 transition-all active:scale-95 disabled:opacity-60 ${className}`}
        >
          {opening ? <LoadingCircle className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          {opening ? 'Opening…' : 'Message'}
        </button>

        {error && (
          <p className="flex items-start gap-1.5 text-[11px] text-rose-300 max-w-[16rem]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{error}</span>
          </p>
        )}
      </div>

      {thread && (
        <MessageThread
          threadId={thread.id}
          peer={{ id: peerId, name: peerName, handle: peerHandle, avatar_url: peerAvatarUrl ?? null }}
          onClose={() => setThread(null)}
        />
      )}
    </>
  );
}