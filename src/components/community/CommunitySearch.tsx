'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContentItem } from '@/types/vault';
import type { PostReaction } from '@/lib/reactions';
import { CommunityCard } from '@/components/cards/CommunityCard';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingCircle } from '@/components/LoadingCircle';
import {
  Search, X, MessageSquare, Users, FileText, Clock, CornerDownLeft, Sparkles
} from 'lucide-react';

/**
 * Advanced community search.
 *
 * Owns the search bar and the results view. The feed page mounts it above the
 * feed; while `active` it hides the feed and shows matched posts (rendered as
 * real CommunityCards), matched comments (with their parent post attached), and
 * matched members. Clearing the search hands the feed back intact.
 */

interface SearchMatch {
  key: string;
  label: string;
  snippet: string;
}

type SearchedItem = ContentItem & { matched: SearchMatch[] };

interface CommentHit {
  id: string;
  item_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  author_name: string;
  created_at: string;
  matched: SearchMatch[];
  post: SearchedItem;
}

interface PersonHit {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name: string;
  post_count: number;
  matched: SearchMatch[];
}

interface SearchResults {
  query: string;
  scope: 'all' | 'posts' | 'comments' | 'people';
  posts: SearchedItem[];
  comments: CommentHit[];
  people: PersonHit[];
}

type Scope = 'all' | 'posts' | 'comments' | 'people';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'posts', label: 'Posts' },
  { value: 'comments', label: 'Comments' },
  { value: 'people', label: 'People' },
];

const RECENTS_KEY = 'keeva_community_recent_searches';

/** Splits text on the query tokens and marks the matches. */
function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  const parts = useMemo(() => {
    const sorted = [...tokens].filter((t) => t.length > 0).sort((a, b) => b.length - a.length);
    if (!text || !sorted.length) return [text || ''];
    const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return String(text).split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  }, [text, tokens]);

  return (
    <>
      {parts.map((part, i) => {
        const hit = part.length > 0 && tokens.some((t) => t.toLowerCase() === part.toLowerCase());
        return hit ? (
          <mark key={i} className="bg-cyan-500/30 text-cyan-100 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function trimSnippet(snippet: string, max: number): string {
  const clean = snippet.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function initialOf(name: string): string {
  return (name || 'K').trim().charAt(0).toUpperCase();
}

export function CommunitySearch({
  active,
  onActiveChange,
  onOpenPreview,
  onToggleFavorite,
  onEdit,
  onRemove,
}: {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  onOpenPreview: (item: ContentItem) => void;
  onToggleFavorite: (
    id: string,
    reaction?: PostReaction | null
  ) => Promise<{
    liked: boolean;
    like_count: number;
    my_reaction: PostReaction | null;
    reaction_counts: Record<string, number>;
  } | null>;
  onEdit: (item: ContentItem) => void;
  onRemove: (item: ContentItem) => void;
}) {
  const { user, session } = useAuth();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [recents, setRecents] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string' && s.trim());
      }
    } catch {}
    return [];
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const addRecent = useCallback((term: string) => {
    setRecents((prev) => {
      const next = [term, ...prev.filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, 6);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Live typing means several requests can be in flight at once, and they can
  // resolve out of order. Each call takes a ticket; only the newest ticket is
  // allowed to write state, so a slow early request cannot overwrite the results
  // of a later, more complete query.
  const requestSeq = useRef(0);

  const runSearch = useCallback(
    async (term: string, searchScope: Scope, save: boolean) => {
      const clean = term.trim();
      if (!clean) return;
      if (save) addRecent(clean);
      const ticket = ++requestSeq.current;
      setQ(clean);
      setScope(searchScope);
      setLoading(true);
      setError(null);
      onActiveChange(true);
      try {
        const token = session?.access_token;
        const res = await fetch(
          `/api/community/search?q=${encodeURIComponent(clean)}&scope=${searchScope}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        if (ticket !== requestSeq.current) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || 'Search failed. Please try again.');
          setResults(null);
        } else {
          setResults(await res.json());
          setSubmitted(true);
        }
      } catch {
        if (ticket !== requestSeq.current) return;
        setError('Network error. Please try again.');
        setResults(null);
      } finally {
        if (ticket === requestSeq.current) setLoading(false);
      }
    },
    [onActiveChange, session, addRecent]
  );

  const exit = useCallback(() => {
    // Invalidate any in-flight request so a late response cannot re-open the
    // panel the user just closed.
    requestSeq.current++;
    setQ('');
    setScope('all');
    setResults(null);
    setError(null);
    setSubmitted(false);
    onActiveChange(false);
  }, [onActiveChange]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const term = q.trim();
      if (!term) return;
      // Cancel the pending debounce so this explicit submit is the only request.
      runSearch(term, scope, true);
    },
    [q, scope, runSearch]
  );

  const changeScope = useCallback(
    (next: Scope) => {
      setScope(next);
      if (submitted && q.trim()) runSearch(q, next, false);
    },
    [submitted, q, runSearch]
  );

  // Live search: run the query a short moment after typing stops, so results
  // appear without pressing Enter. A single character is a valid query — the
  // API weights fields rather than doing an exact match, so one letter already
  // ranks meaningfully. Empty input is the only thing that turns this off.
  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    // The first search of a fresh query also records it in the recents list,
    // which is what Enter would have done; submit then just re-runs immediately.
    const timer = setTimeout(() => runSearch(term, scope, false), 250);
    return () => clearTimeout(timer);
  }, [q, scope, runSearch]);

  // "/" focuses the bar from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/' && document.activeElement === document.body && formRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        if (q) setQ('');
        else exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, exit]);

  const tokens = useMemo(() => q.trim().split(/\s+/).filter((t) => t.length > 0), [q]);

  const totalPosts = results?.posts.length ?? 0;
  const totalComments = results?.comments.length ?? 0;
  const totalPeople = results?.people.length ?? 0;

  return (
    <section className="w-full mb-8">
      <form
        ref={formRef}
        onSubmit={onSubmit}
        role="search"
        className={`relative group transition-all ${
          active ? 'max-w-full' : 'max-w-xl'
        }`}
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search posts, comments and people in the community…"
          aria-label="Search the community"
          className="w-full pl-12 pr-24 py-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-slate-200 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all"
        />
        {q ? (
          <button
            type="button"
            onClick={exit}
            aria-label="Clear search"
            className="absolute right-20 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <kbd className="absolute right-20 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/70 border border-slate-700 text-[11px] text-slate-400">
            <CornerDownLeft className="w-3 h-3" />
          </kbd>
        )}
        <button
          type="submit"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-white text-sm font-semibold hover:from-cyan-400 hover:to-indigo-400 transition-all shadow-lg shadow-cyan-500/20"
        >
          Search
        </button>
      </form>

      {!q && recents.length > 0 && !active && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" /> Recent
          </span>
          {recents.map((term) => (
            <button
              key={term}
              onClick={() => {
                // Setting the input drives the live-search effect; recording the
                // term here keeps recents working without a submit.
                setQ(term);
                addRecent(term);
              }}
              className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {(active || submitted) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {SCOPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => changeScope(value)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors border ${
                scope === value
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
          {submitted && results && (
            <span className="ml-auto text-xs text-slate-500">
              {totalPosts} {totalPosts === 1 ? 'post' : 'posts'} · {totalComments}{' '}
              {totalComments === 1 ? 'comment' : 'comments'} · {totalPeople}{' '}
              {totalPeople === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>
      )}

      {loading && (
        <div className="w-full py-16 flex items-center justify-center">
          <LoadingCircle className="w-8 h-8" />
        </div>
      )}

      {error && (
        <div className="mt-5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-300">
          {error}
        </div>
      )}

      {active && !loading && !error && results && (
        <div className="mt-6">
          {totalPosts === 0 && totalComments === 0 && totalPeople === 0 ? (
            <div className="w-full py-20 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-3xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
                <Search className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-200 mb-1.5">Nothing found for “{results.query}”</h3>
              <p className="text-sm text-slate-400 max-w-md">
                Try different keywords, or search a narrower scope like Posts or People.
              </p>
            </div>
          ) : (
            <div className="space-y-9">
              {results.posts.length > 0 && (
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    <FileText className="w-4 h-4 text-cyan-400" /> Posts ({results.posts.length})
                  </h3>
                  <div className="space-y-7">
                    {results.posts.map((item) => {
                      const isOwner = !!user && item.user_id === user.id;
                      return (
                        <div key={item.id}>
                          {item.matched.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {item.matched.slice(0, 3).map((m) => (
                                <span
                                  key={m.key}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-[11px] text-cyan-300"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  {m.label}: <Highlighted text={trimSnippet(m.snippet, 60)} tokens={tokens} />
                                </span>
                              ))}
                            </div>
                          )}
                          <CommunityCard
                            item={item}
                            variant="feed"
                            isOwner={isOwner}
                            onOpenPreview={onOpenPreview}
                            onToggleFavorite={onToggleFavorite}
                            onEdit={isOwner ? onEdit : undefined}
                            onRemove={isOwner ? onRemove : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {results.comments.length > 0 && (
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    <MessageSquare className="w-4 h-4 text-indigo-400" /> Comments ({results.comments.length})
                  </h3>
                  <div className="space-y-3">
                    {results.comments.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onOpenPreview(c.post)}
                        className="w-full text-left rounded-2xl bg-slate-900/70 border border-slate-800 p-4 hover:border-indigo-500/40 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {initialOf(c.author_name)}
                          </span>
                          <span className="text-sm font-semibold text-slate-200">{c.author_name}</span>
                          <span className="text-xs text-slate-500">commented on</span>
                          <span className="text-sm text-cyan-400 truncate group-hover:text-cyan-300">
                            {c.post.title}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed">
                          <Highlighted text={trimSnippet(c.body, 220)} tokens={tokens} />
                        </p>
                        {c.matched.some((m) => m.key !== 'body') && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {c.matched
                              .filter((m) => m.key !== 'body')
                              .map((m) => (
                                <span
                                  key={m.key}
                                  className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-[11px] text-indigo-300"
                                >
                                  {m.label}: <Highlighted text={trimSnippet(m.snippet, 40)} tokens={tokens} />
                                </span>
                              ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.people.length > 0 && (
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    <Users className="w-4 h-4 text-fuchsia-400" /> People ({results.people.length})
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {results.people.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-2xl bg-slate-900/70 border border-slate-800 p-4"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {initialOf(p.display_name)}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-100 truncate">
                              <Highlighted text={p.display_name} tokens={tokens} />
                            </div>
                            <div className="text-xs text-slate-500 truncate">{p.email}</div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 mb-3">
                          {p.post_count} {p.post_count === 1 ? 'post' : 'posts'} in the community
                        </div>
                        {results.posts.filter((post) => post.user_id === p.id).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {results.posts
                              .filter((post) => post.user_id === p.id)
                              .slice(0, 3)
                              .map((post) => (
                                <button
                                  key={post.id}
                                  onClick={() => onOpenPreview(post)}
                                  className="max-w-full truncate px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-cyan-300 hover:border-cyan-500/40 transition-colors"
                                >
                                  {post.title}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}