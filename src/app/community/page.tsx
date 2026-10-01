'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ContentItem } from '@/types/vault';
import { CommunityCard } from '@/components/cards/CommunityCard';
import { MediaPreviewModal } from '@/components/modals/MediaPreviewModal';
import { KeevaMark } from '@/components/KeevaMark';
import { EditCommunityPostModal } from '@/components/modals/EditCommunityPostModal';
import { CommunitySearch } from '@/components/community/CommunitySearch';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { FOCUS_POST_EVENT, readPostFocusFromUrl, type PostFocus } from '@/lib/communityDeepLink';
import type { PostReaction } from '@/lib/reactions';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingCircle } from '@/components/LoadingCircle';
import {
  Compass, LayoutList, Columns3, Check, AlertCircle, X
} from 'lucide-react';

type Layout = 'feed' | 'masonry';

function CommunityFeed() {
  const { user, session } = useAuth();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [layout, setLayout] = useState<Layout>('feed');
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [searchActive, setSearchActive] = useState(false);

  // Deep link from a notification: /community?post=<id>&reply=1
  //
  // The query is read straight off the URL instead of with useSearchParams,
  // which opts this statically prerendered page out of static rendering and
  // still hands back an empty result on a cold load, so the param never reaches
  // the cards. The event covers the other case, a notification clicked while
  // this page is already open.
  const [postFocus, setPostFocus] = useState<PostFocus | null>(() =>
    typeof window === 'undefined' ? null : readPostFocusFromUrl()
  );

  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<PostFocus>).detail;
      if (detail?.postId) setPostFocus(detail);
    };
    window.addEventListener(FOCUS_POST_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_POST_EVENT, onFocus);
  }, []);

  // The params are only needed to seed the state above, so they are stripped
  // once the target card has actually taken them. Doing it on a timer instead
  // races the feed, which can take a couple of seconds to load: navigating with
  // router.replace remounts this page, and the fresh mount reads an already
  // cleaned URL, so the post is never focused. history.replaceState rewrites the
  // address bar without a navigation, so the state set above survives.
  const clearDeepLink = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('post')) return;
    url.searchParams.delete('post');
    url.searchParams.delete('reply');
    window.history.replaceState(null, '', url.toString());
  }, []);

  // A post that has since been deleted never matches a card, so nothing would
  // ever report back. Drop the params once the feed is in and the id is absent,
  // otherwise the link sits in the address bar looking like it did nothing.
  useEffect(() => {
    if (loading || !postFocus) return;
    if (items.some((i) => i.id === postFocus.postId)) return;
    clearDeepLink();
  }, [loading, items, postFocus, clearDeepLink]);

  const showToast = useCallback((kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    // Mark community posts as seen
    try {
      localStorage.setItem('keeva_community_last_seen_time', Date.now().toString());
    } catch {}

    // Auth resolves asynchronously, so the first load often has no token yet.
    // Depending on it means the feed refetches once signed in, which is what
    // fills in liked_by_me. The posts themselves are public either way, so a
    // signed-out visitor still gets a complete list with correct like counts.
    let cancelled = false;

    async function fetchCommunityItems() {
      try {
        const token = session?.access_token;
        const res = await fetch('/api/community/items', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json();
        if (!cancelled && data.items) {
          setItems(data.items as ContentItem[]);
        }
      } catch (err) {
        console.error('Error fetching community posts:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCommunityItems();
    return () => { cancelled = true; };
  }, [session?.access_token]);

  const openPreview = (item: ContentItem) => {
    setSelectedItem(item);
    setIsPreviewOpen(true);
  };

  // Social reaction. Returns the server's state so the card can settle on the
  // truth, or null on failure so it rolls its optimistic update back.
  const handleToggleLike = useCallback(async (id: string, reaction?: PostReaction | null) => {
    if (!session?.access_token) {
      showToast('error', 'Sign in to react to posts.');
      return null;
    }
    try {
      const res = await fetch('/api/community/likes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(
          reaction === undefined ? { item_id: id } : { item_id: id, reaction }
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast('error', body.error || 'Could not update reaction.');
        return null;
      }
      const body = await res.json();

      // Keep the feed payload in step so a later re-render, or a switch to grid
      // view, draws from the same values the card settled on.
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                liked_by_me: body.liked,
                like_count: body.like_count,
                my_reaction: body.my_reaction,
                reaction_counts: body.reaction_counts,
              }
            : i
        )
      );

      return {
        liked: body.liked,
        like_count: body.like_count,
        my_reaction: body.my_reaction ?? null,
        reaction_counts: body.reaction_counts ?? {},
      };
    } catch {
      showToast('error', 'Network error. Try again.');
      return null;
    }
  }, [session, showToast]);

  const handleEditSaved = (updated: ContentItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
    setSelectedItem((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
    showToast('success', 'Post updated.');
  };

  const handleRemove = async (item: ContentItem) => {
    if (!confirm('Remove this post from the community?\n\nIt will stay in your personal vault.')) return;
    if (!session?.access_token) {
      showToast('error', 'You need to be signed in.');
      return;
    }
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_public: false, community_caption: '' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast('error', body.error || 'Could not remove the post.');
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (selectedItem?.id === item.id) {
        setIsPreviewOpen(false);
        setSelectedItem(null);
      }
      showToast('success', 'Removed from community. Still in your vault.');
    } catch {
      showToast('error', 'Network error. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090E] flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-5">
          <LoadingCircle className="w-80 h-80 max-w-[80vw] max-h-[80vw]" label="Loading community" />
          <p className="text-sm text-slate-400 font-mono">Loading community…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-200 p-4 sm:p-8">
      <div className="w-full max-w-[98%] 2xl:max-w-[96%] mx-auto">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <KeevaMark className="w-11 h-11" alt="Keeva" />
              <span>Keeva Community</span>
            </h1>
            <p className="text-slate-400 mt-2">Discover content shared by the community.</p>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />

            {items.length > 0 && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800">
                <button
                  onClick={() => setLayout('feed')}
                  title="Feed view"
                  aria-label="Feed view"
                  className={`p-2 rounded-lg transition-colors ${
                    layout === 'feed'
                      ? 'bg-cyan-500/15 text-cyan-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLayout('masonry')}
                  title="Grid view"
                  aria-label="Grid view"
                  className={`p-2 rounded-lg transition-colors ${
                    layout === 'masonry'
                      ? 'bg-cyan-500/15 text-cyan-400'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Columns3 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        <CommunitySearch
          active={searchActive}
          onActiveChange={setSearchActive}
          onOpenPreview={openPreview}
          onToggleFavorite={handleToggleLike}
          onEdit={setEditing}
          onRemove={handleRemove}
        />

        {!searchActive && (items.length === 0 ? (
          <div className="w-full py-24 flex flex-col items-center justify-center text-center px-4">
            <div className="w-20 h-20 rounded-3xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-500 mb-5 shadow-2xl">
              <Compass className="w-10 h-10 animate-pulse text-cyan-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-200 mb-2">No Community Items Found</h3>
            <p className="text-sm text-slate-400 max-w-md">
              Be the first to share something amazing with the community!
            </p>
          </div>
        ) : layout === 'feed' ? (
          <div className="w-full">
            <div className="h-px bg-slate-800/70 mb-6" />
            <div className="space-y-7">
              {items.map((item) => {
                const isOwner = !!user && item.user_id === user.id;
                return (
                  <CommunityCard
                    key={item.id}
                    item={item}
                    variant="feed"
                    isOwner={isOwner}
                    onOpenPreview={openPreview}
                    onToggleFavorite={handleToggleLike}
                    onEdit={isOwner ? setEditing : undefined}
                    onRemove={isOwner ? handleRemove : undefined}
                    autoFocus={!!postFocus && item.id === postFocus.postId}
                    focusComposer={!!postFocus && postFocus.focusComposer}
                    onAutoFocused={clearDeepLink}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="w-full columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 gap-6 space-y-6">
            {items.map((item) => {
              const isOwner = !!user && item.user_id === user.id;
              return (
                <div key={item.id} className="masonry-item group inline-block w-full mb-6 break-inside-avoid">
                  <CommunityCard
                    item={item}
                    variant="masonry"
                    isOwner={isOwner}
                    onOpenPreview={openPreview}
                    onToggleFavorite={handleToggleLike}
                    onEdit={isOwner ? setEditing : undefined}
                    onRemove={isOwner ? handleRemove : undefined}
                    autoFocus={!!postFocus && item.id === postFocus.postId}
                    focusComposer={!!postFocus && postFocus.focusComposer}
                    onAutoFocused={clearDeepLink}
                  />
                </div>
              );
            })}
          </div>
        ))}

        <MediaPreviewModal
          item={selectedItem}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          onToggleFavorite={handleToggleLike}
          onUpdateNotes={() => {}}
          onItemUpdated={(updated) => {
            if (!updated.is_public) {
              setItems((prev) => prev.filter((i) => i.id !== updated.id));
              if (selectedItem?.id === updated.id) {
                setIsPreviewOpen(false);
                setSelectedItem(null);
              }
            } else {
              setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
            }
          }}
        />

        <EditCommunityPostModal
          key={editing?.id ?? 'closed'}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={handleEditSaved}
          onError={(m) => showToast('error', m)}
        />

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl backdrop-blur-xl max-w-[calc(100vw-2rem)]">
            {toast.kind === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="text-[13px] text-slate-200">{toast.text}</span>
            <button onClick={() => setToast(null)} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommunityPage() {
  return <CommunityFeed />;
}
