'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
// Type-only: these are string enums, so casting the literals is safe and keeps
// the picker itself out of the initial bundle.
import type { Theme, EmojiStyle } from 'emoji-picker-react';
import { CommunityComment } from '@/types/vault';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityMembers } from '@/hooks/useCommunityMembers';
import { applyMention, detectMentionQuery } from '@/lib/mentions';
import { describeSendFailure } from '@/lib/notices';
import { CommentBody } from '@/components/comments/CommentBody';
import { LoadingCircle } from '@/components/LoadingCircle';
import { MessageSquare, Smile, Send, Trash2, CornerDownRight, Pencil, ThumbsUp } from 'lucide-react';

// The picker ships a large emoji dataset. Keep it out of the initial bundle —
// it only downloads the first time someone actually opens it.
// emojiStyle NATIVE renders the OS glyph directly, so unlike the default APPLE
// style it makes no CDN request per emoji.
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

const MAX_BODY = 1000;
const COLLAPSED_COUNT = 2;

function timeAgo(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateString).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/**
 * Textarea that grows with its content instead of trapping it in one row.
 *
 * `rows={1}` plus a fixed `max-h-*` is what hid everything past the first
 * line: the box never grew, so typed lines scrolled out of view. This resets
 * the height and re-measures on every render, so all lines stay visible up to
 * `maxHeight`, after which it scrolls like a normal long input.
 */
function AutosizeTextarea({
  inputRef,
  value,
  maxHeight = 256,
  className = '',
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  maxHeight?: number;
}) {
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  });

  return (
    <textarea
      ref={inputRef}
      rows={1}
      value={value}
      {...rest}
      style={{ maxHeight, ...(rest.style || {}) }}
      className={`w-full bg-transparent border-0 text-[13px] text-slate-200 placeholder-slate-600 focus:outline-none resize-none leading-relaxed ${className}`}
    />
  );
}

/** @mention autocomplete popup, shared by the main and reply composers. */
function MentionList({
  suggestions,
  onPick,
}: {
  suggestions: { id: string; handle: string; name: string }[];
  onPick: (handle: string) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <div className="absolute bottom-full left-0 mb-2 z-50 w-56 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/50 overflow-hidden">
      {suggestions.map((m) => (
        <button
          key={m.id}
          // onMouseDown fires before the textarea's blur, so the click is not lost.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(m.handle);
          }}
          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-800 transition-colors"
        >
          <span className="shrink-0 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300">
            {(m.name || m.handle).charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] text-slate-200 truncate">{m.name}</span>
            <span className="block text-[10.5px] font-mono text-cyan-400 truncate">@{m.handle}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

interface CommunityCommentsProps {
  itemId: string;
  /** Total from the feed payload, so a post with no comments needs no request. */
  initialCount?: number;
  /** Reports the top-level + reply total so the card can show it in its action bar. */
  onCountChange?: (count: number) => void;
  /** Bump this to move focus into the composer, e.g. when the action-bar button is hit. */
  focusSignal?: number;
}

export function CommunityComments({ itemId, initialCount = 0, onCountChange, focusSignal = 0 }: CommunityCommentsProps) {
  const { user, session } = useAuth();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replyPickerOpen, setReplyPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const replyPickerRef = useRef<HTMLDivElement>(null);
  const mainInputRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // The member list is only needed once somebody actually tries to mention
  // someone, so it is not fetched for a thread that is merely opened.
  const { members, handles: knownHandles } = useCommunityMembers(!!user);

  // handle → actual name, so a stored @handle renders as "Abhinav Guddu".
  // Built from the same member list as the autocomplete, so the composer and
  // the rendered thread can never disagree about who somebody is.
  const nameByHandle = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      if (m.handle && m.name) map[m.handle.toLowerCase()] = m.name;
    }
    return map;
  }, [members]);

  // Which composer, if any, currently has the caret inside an unfinished
  // @handle, and what has been typed after the "@" so far.
  const [mentionState, setMentionState] = useState<{
    target: 'main' | 'reply';
    query: string;
    start: number;
  } | null>(null);

  const suggestions = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query;
    return members
      .filter((m) => !q || m.handle.startsWith(q) || m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionState, members]);

  // Any unfinished "@token" is enough to offer the list. A bare "@" showing the
  // members is the expected behaviour, same as every other chat composer.
  const showSuggestions = !!mentionState;

  const syncMentionState = (target: 'main' | 'reply', value: string, caret: number) => {
    const detected = detectMentionQuery(value, caret);
    setMentionState(detected ? { target, query: detected.query, start: detected.start } : null);
  };

  const chooseMention = (handle: string) => {
    if (!mentionState) return;
    const isMain = mentionState.target === 'main';
    const current = isMain ? draft : replyDraft;
    const result = applyMention(current, mentionState.start, handle);

    if (isMain) {
      setDraft(result.text);
    } else {
      setReplyDraft(result.text);
    }
    setMentionState(null);

    const input = isMain ? mainInputRef.current : replyInputRef.current;
    // Restore focus and put the caret after the inserted handle, otherwise the
    // popup click steals focus and the member has to click back into the box.
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(result.caret, result.caret);
    });
  };

  // The feed already knows the count, so a post with no comments — the common
  // case — never pays for a request just to render an empty thread. Fetch when
  // there is something to show, or the moment the reader engages with it.
  const wantsThread = initialCount > 0 || expanded || focusSignal > 0;
  const threadLoading = wantsThread && !loaded;

  useEffect(() => {
    if (!wantsThread || loaded) return;
    let cancelled = false;
    fetch(`/api/community/items/${itemId}/comments`)
.then((r) => (r.ok ? r.json() : Promise.reject(new Error('request failed'))))
        .then((d) => { if (!cancelled) setComments(d.comments || []); })
        // An empty list is what a post with no comments looks like. Returning
        // one here on a failed request was a lie that reads as deletion: a
        // thread that had replies would silently come back empty, and posting a
        // new comment onto it would look like it started a fresh conversation.
        .catch((err) => {
          if (cancelled) return;
          setComments([]);
          setError(describeSendFailure(err, 'Loading comments'));
        })
        .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [wantsThread, loaded, itemId]);

  useEffect(() => {
    if (!pickerOpen && !replyPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pickerOpen && pickerRef.current && !pickerRef.current.contains(t)) setPickerOpen(false);
      if (replyPickerOpen && replyPickerRef.current && !replyPickerRef.current.contains(t)) setReplyPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPickerOpen(false); setReplyPickerOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen, replyPickerOpen]);

  const tops = comments.filter((c) => !c.parent_id);
  const repliesOf = useCallback(
    (id: string) => comments.filter((c) => c.parent_id === id),
    [comments]
  );
  const visible = expanded ? tops : tops.slice(0, COLLAPSED_COUNT);
  const hiddenCount = tops.length - COLLAPSED_COUNT;

  // Until the thread is fetched the feed's count is the truth; reporting 0
  // here would blank out the action-bar number for every post.
  useEffect(() => {
    onCountChange?.(loaded ? comments.length : initialCount);
  }, [loaded, comments.length, initialCount, onCountChange]);

  useEffect(() => {
    if (focusSignal > 0) mainInputRef.current?.focus();
  }, [focusSignal]);

  const submit = async (text: string, parentId: string | null): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (trimmed.length > MAX_BODY) {
      setError(`Comment cannot exceed ${MAX_BODY} characters.`);
      return false;
    }
    if (!session?.access_token) {
      setError('Please sign in to comment.');
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/items/${itemId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ body: trimmed, parent_id: parentId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not post your comment.');
        return false;
      }
      const { comment } = await res.json();
      setComments((prev) => [...prev, comment]);
      setLoaded(true);
      return true;
    } catch {
      setError('Network error. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (await submit(draft, null)) {
      setDraft('');
      setPickerOpen(false);
      setMentionState(null);
      // The thread shows only the first two comments until expanded, so a new
      // comment appended at the end would sit hidden behind "View all" and look
      // like it never posted. Expand on success so the author sees their own words.
      setExpanded(true);
    }
  };

  const handleReplySend = async () => {
    if (replyTo && await submit(replyDraft, replyTo.id)) {
      setReplyDraft('');
      setReplyTo(null);
      setReplyPickerOpen(false);
      setMentionState(null);
      setExpanded(true);
    }
  };

  const handleDelete = async (comment: CommunityComment) => {
    if (!confirm('Delete this comment?')) return;
    if (!session?.access_token) return;
    setError(null);
    const res = await fetch(`/api/community/comments/${comment.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => null);

    if (!res) {
      setError('Network error. Please try again.');
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Could not delete the comment.');
      return;
    }
    // Replies cascade at the DB level, so drop the subtree locally too.
    setComments((prev) => {
      const replyIds = new Set(prev.filter((c) => c.parent_id === comment.id).map((c) => c.id));
      return prev.filter((c) => c.id !== comment.id && !replyIds.has(c.id));
    });
    if (editingId === comment.id) {
      setEditingId(null);
      setEditDraft('');
    }
  };

  const startEdit = (comment: CommunityComment) => {
    setEditingId(comment.id);
    setEditDraft(comment.body);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = async (comment: CommunityComment) => {
    const text = editDraft.trim();
    if (!text || text === comment.body) {
      cancelEdit();
      return;
    }
    if (text.length > MAX_BODY) {
      setError(`Comment cannot exceed ${MAX_BODY} characters.`);
      return;
    }
    if (!session?.access_token) {
      setError('Please sign in to edit.');
      return;
    }
    // Optimistic, so the correction lands instantly. A failed request rolls
    // back to the server's version instead of showing text that was never saved.
    const prevBody = comment.body;
    const prevEditedAt = comment.edited_at;
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id ? { ...c, body: text, edited_at: new Date().toISOString() } : c
      )
    );
    cancelEdit();
    setEditBusy(true);
    try {
      const res = await fetch(`/api/community/comments/${comment.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not save your edit.');
        setComments((prev) =>
          prev.map((c) =>
            c.id === comment.id ? { ...c, body: prevBody, edited_at: prevEditedAt } : c
          )
        );
        return;
      }
      const { comment: updated } = await res.json();
      if (updated) {
        setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, ...updated } : c)));
      }
    } catch {
      setError('Network error. Please try again.');
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id ? { ...c, body: prevBody, edited_at: prevEditedAt } : c
        )
      );
    } finally {
      setEditBusy(false);
    }
  };

  const handleCommentLike = async (comment: CommunityComment) => {
    if (!session?.access_token || likeBusyId) return;
    const nextLiked = !comment.liked_by_me;
    // Optimistic, so a tap feels instant. A failed request rolls back to the
    // server's values instead of showing a like that was never saved.
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? {
              ...c,
              liked_by_me: nextLiked,
              like_count: Math.max(0, (c.like_count ?? 0) + (nextLiked ? 1 : -1)),
            }
          : c
      )
    );
    setLikeBusyId(comment.id);
    try {
      const res = await fetch(`/api/community/comments/${comment.id}/likes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not update like.');
        setComments((prev) =>
          prev.map((c) =>
            c.id === comment.id
              ? {
                  ...c,
                  liked_by_me: !nextLiked,
                  like_count: Math.max(0, (c.like_count ?? 0) + (nextLiked ? -1 : 1)),
                }
              : c
          )
        );
        return;
      }
      const body = await res.json();
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id ? { ...c, liked_by_me: body.liked, like_count: body.like_count } : c
        )
      );
    } catch {
      setError('Network error. Please try again.');
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                liked_by_me: !nextLiked,
                like_count: Math.max(0, (c.like_count ?? 0) + (nextLiked ? -1 : 1)),
              }
            : c
        )
      );
    } finally {
      setLikeBusyId(null);
    }
  };

  const pickEmoji = (emoji: string) => {
    setDraft((d) => d + emoji);
    mainInputRef.current?.focus();
  };
  const pickReplyEmoji = (emoji: string) => {
    setReplyDraft((d) => d + emoji);
  };

  const CommentRow = ({ c, nested }: { c: CommunityComment; nested?: boolean }) => {
    const initial = (c.author_name || 'K').charAt(0).toUpperCase();
    const mine = !!user && c.user_id === user.id;
    const isEditing = editingId === c.id;
    return (
      <div className={`flex gap-2.5 ${nested ? 'mt-2.5' : ''}`}>
        <div
          className={`rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-slate-200 font-bold shrink-0 ${
            nested ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-[11px]'
          }`}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <Link
              href={`/members/${c.user_id}`}
              className="text-[12.5px] font-semibold text-white hover:text-cyan-300 transition-colors"
            >
              {c.author_name || 'Keeva Member'}
            </Link>
            <span className="text-[10.5px] text-slate-500 font-mono">{timeAgo(c.created_at)}</span>
            {c.edited_at && (
              <span className="text-[10.5px] text-slate-600 italic" title={new Date(c.edited_at).toLocaleString()}>
                · edited
              </span>
            )}
          </div>
          {isEditing ? (
            <div className="mt-1.5 rounded-xl bg-slate-800/60 border border-cyan-500/40 px-2.5 py-1.5">
              <AutosizeTextarea
                inputRef={editInputRef}
                maxHeight={192}
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    saveEdit(c);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                className="disabled:cursor-not-allowed"
                maxLength={MAX_BODY}
              />
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <button
                  onClick={cancelEdit}
                  disabled={editBusy}
                  className="px-2.5 py-1 rounded-lg text-[11.5px] text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveEdit(c)}
                  disabled={editBusy || !editDraft.trim()}
                  className="px-3 py-1 rounded-lg bg-cyan-500 text-slate-950 text-[11.5px] font-bold hover:bg-cyan-400 disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  {editBusy ? <LoadingCircle className="w-3 h-3" /> : null}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <CommentBody body={c.body} knownHandles={knownHandles} nameByHandle={nameByHandle} />
          )}
          <div className="flex items-center gap-3 mt-1">
            {!nested && user && (
              <button
                onClick={() => { setReplyTo(c); setReplyPickerOpen(false); }}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-cyan-400 transition-colors"
              >
                <CornerDownRight className="w-3 h-3" /> Reply
              </button>
            )}
            {user && (
              <button
                onClick={() => handleCommentLike(c)}
                disabled={likeBusyId === c.id}
                aria-pressed={!!c.liked_by_me}
                title={c.liked_by_me ? 'Unlike' : 'Like'}
                className={`flex items-center gap-1 text-[11px] transition-colors disabled:opacity-60 ${
                  c.liked_by_me ? 'text-rose-400' : 'text-slate-500 hover:text-rose-400'
                }`}
              >
                <ThumbsUp className={`w-3 h-3 ${c.liked_by_me ? 'fill-rose-400' : ''}`} />
                {(c.like_count ?? 0) > 0 ? c.like_count : 'Like'}
              </button>
            )}
            {mine && !isEditing && (
              <button
                onClick={() => startEdit(c)}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-cyan-400 transition-colors"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
            {mine && (
              <button
                onClick={() => handleDelete(c)}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-3">
      {threadLoading ? (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 py-2">
          <LoadingCircle className="w-3 h-3" /> Loading comments
        </div>
      ) : (
        <>
          {hiddenCount > 0 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-[12.5px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors mb-2"
            >
              View all {tops.length} comments
            </button>
          )}

          {tops.length === 0 && (
            <p className="text-[12px] text-slate-600 py-1.5">No comments yet. Be the first to say something.</p>
          )}

          <div className="space-y-3">
            {visible.map((c) => (
              <div key={c.id}>
                <CommentRow c={c} />
                {repliesOf(c.id).map((r) => (
                  <div key={r.id} className="ml-9 pl-3 border-l border-slate-800">
                    <CommentRow c={r} nested />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {expanded && tops.length > COLLAPSED_COUNT && (
            <button
              onClick={() => setExpanded(false)}
              className="text-[12.5px] font-semibold text-slate-500 hover:text-slate-300 transition-colors mt-3"
            >
              Show fewer
            </button>
          )}
        </>
      )}

      {error && <p className="text-[11.5px] text-rose-400 mt-2">{error}</p>}

      {/* Reply composer */}
      {replyTo && (
        <div className="mt-3 ml-9 pl-3 border-l border-slate-800">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-bold text-[11px] shrink-0">
              {(user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'Y').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 relative">
              <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-2.5 py-1.5 focus-within:border-cyan-500/50 transition-colors">
                <AutosizeTextarea
                  inputRef={replyInputRef}
                  maxHeight={192}
                  autoFocus
                  value={replyDraft}
                  onChange={(e) => {
                    setReplyDraft(e.target.value);
                    syncMentionState('reply', e.target.value, e.target.selectionStart);
                    if (mentionState?.target === 'reply') setReplyPickerOpen(false);
                  }}
                  onBlur={() => setMentionState(null)}
                  onKeyDown={(e) => {
                    if (mentionState?.target === 'reply' && suggestions.length) {
                      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        chooseMention(suggestions[0].handle);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setMentionState(null);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReplySend(); }
                  }}
                  placeholder={`Reply to ${replyTo.author_name || 'this comment'}…`}
                  className="disabled:cursor-not-allowed"
                  maxLength={MAX_BODY}
                />
                {showSuggestions && mentionState?.target === 'reply' && (
                  <MentionList suggestions={suggestions} onPick={chooseMention} />
                )}
                <div className="flex items-center justify-between mt-1">
                  <div className="relative" ref={replyPickerRef}>
                    <button
                      onClick={() => { setReplyPickerOpen((p) => !p); setPickerOpen(false); }}
                      className={`p-1 rounded transition-colors ${replyPickerOpen ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                      title="Add emoji"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    {replyPickerOpen && (
                      <div className="absolute bottom-full left-0 mb-2 z-50">
                        <EmojiPicker
                          onEmojiClick={(e) => pickReplyEmoji(e.emoji)}
                          theme={'dark' as Theme}
                          emojiStyle={'native' as EmojiStyle}
                          lazyLoadEmojis
                          width={320}
                          height={300}
                          searchPlaceHolder="Search emoji"
                          previewConfig={{ showPreview: false }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setReplyTo(null); setReplyDraft(''); setReplyPickerOpen(false); }}
                      className="px-2.5 py-1 rounded-lg text-[11.5px] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReplySend}
                      disabled={busy || !replyDraft.trim()}
                      className="px-3 py-1 rounded-lg bg-cyan-500 text-slate-950 text-[11.5px] font-bold hover:bg-cyan-400 disabled:opacity-40 transition-colors flex items-center gap-1"
                    >
                      {busy ? <LoadingCircle className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                      Reply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main composer */}
      <div className="flex items-start gap-2.5 mt-3">
        {user ? (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-bold text-[11px] shrink-0">
            {(user.user_metadata?.first_name || user.email?.split('@')[0] || 'Y').charAt(0).toUpperCase()}
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
            <MessageSquare className="w-3.5 h-3.5" />
          </div>
        )}

        <div className="flex-1 min-w-0 relative">
          <div className="rounded-xl bg-slate-800/40 border border-slate-700/70 px-2.5 py-1.5 focus-within:border-cyan-500/50 transition-colors">
            <AutosizeTextarea
              inputRef={mainInputRef}
              maxHeight={256}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                syncMentionState('main', e.target.value, e.target.selectionStart);
                if (mentionState?.target === 'main') setPickerOpen(false);
              }}
              onBlur={() => setMentionState(null)}
              onKeyDown={(e) => {
                if (mentionState?.target === 'main' && suggestions.length) {
                  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    chooseMention(suggestions[0].handle);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setMentionState(null);
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              disabled={!user}
              placeholder={user ? 'Add a comment… (@name to mention)' : 'Sign in to join the conversation'}
              className="disabled:cursor-not-allowed"
              maxLength={MAX_BODY}
            />
            {showSuggestions && mentionState?.target === 'main' && (
              <MentionList suggestions={suggestions} onPick={chooseMention} />
            )}
            {user && (
              <div className="flex items-center justify-between mt-1">
                <div className="relative" ref={pickerRef}>
                  <button
                    onClick={() => { setPickerOpen((p) => !p); setReplyPickerOpen(false); }}
                    className={`p-1 rounded transition-colors ${pickerOpen ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Add emoji"
                  >
                    <Smile className="w-4 h-4" />
                  </button>
                  {pickerOpen && (
                    <div className="absolute bottom-full left-0 mb-2 z-50">
                      <EmojiPicker
                        onEmojiClick={(e) => pickEmoji(e.emoji)}
                        theme={'dark' as Theme}
                        emojiStyle={'native' as EmojiStyle}
                        lazyLoadEmojis
                        width={320}
                        height={300}
                        searchPlaceHolder="Search emoji"
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {draft.length > MAX_BODY - 100 && (
                    <span className="text-[10px] font-mono text-slate-600">{draft.length}/{MAX_BODY}</span>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={busy || !draft.trim()}
                    className="px-3 py-1 rounded-lg bg-cyan-500 text-slate-950 text-[11.5px] font-bold hover:bg-cyan-400 disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    {busy ? <LoadingCircle className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
