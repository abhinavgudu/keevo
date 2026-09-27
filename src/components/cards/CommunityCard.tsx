'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ContentItem } from '@/types/vault';
import { CommunityComments } from '@/components/comments/CommunityComments';
import {
  ExternalLink, Heart, Eye, Sparkles, Clock, Camera, Video, Play,
  Globe, FileText, Expand, MoreHorizontal, BookOpen, Share2,
  Pencil, EyeOff, MessageSquare
} from 'lucide-react';

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHrs / 24);
  if (diffHrs < 1) return 'just now';
  if (diffHrs < 24) return `${diffHrs}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getPlatformIcon(platform: string) {
  switch (platform.toLowerCase()) {
    case 'instagram': return <Camera className="w-3.5 h-3.5 text-pink-400" />;
    case 'youtube': return <Video className="w-3.5 h-3.5 text-red-400" />;
    case 'linkedin': return <Share2 className="w-3.5 h-3.5 text-blue-400" />;
    default: return <Globe className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function getInstagramEmbedUrl(sourceUrl: string): string | null {
  if (!sourceUrl) return null;
  const match = sourceUrl.match(/(?:\/reel\/|\/reels\/|\/p\/|\/tv\/)([A-Za-z0-9_-]+)/i);
  if (match && match[1]) return `https://www.instagram.com/p/${match[1]}/embed/`;
  return null;
}

function getPriorityStyle(score: number, level: string) {
  if (level === 'MUST_LEARN' || score >= 100) return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
  if (level === 'HIGH' || score >= 75) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
  if (level === 'MEDIUM' || score >= 50) return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35';
  return 'bg-slate-500/20 text-slate-400 border-slate-700/40';
}

const LONG_CAPTION = 190;

interface CommunityCardProps {
  item: ContentItem;
  onOpenPreview: (item: ContentItem) => void;
  /**
   * Toggle this post's like. Must resolve to the server's authoritative state,
   * or to null if the request failed, so the card can roll back its optimistic
   * update instead of showing a like that was never saved.
   */
  onToggleFavorite: (id: string) => Promise<{ liked: boolean; like_count: number } | null>;
  variant?: 'feed' | 'masonry';
  isOwner?: boolean;
  onEdit?: (item: ContentItem) => void;
  onRemove?: (item: ContentItem) => void;
  /**
   * True on the card a notification deep-linked to. Brings the post into view
   * and rings it briefly so the reader lands on the right thing.
   */
  autoFocus?: boolean;
  /** With autoFocus, also put the caret in the comment box. */
  focusComposer?: boolean;
  /** Called once the card has actually scrolled and rung itself. */
  onAutoFocused?: () => void;
}

export function CommunityCard({
  item,
  onOpenPreview,
  onToggleFavorite,
  variant = 'feed',
  isOwner = false,
  onEdit,
  onRemove,
  autoFocus = false,
  focusComposer = false,
  onAutoFocused,
}: CommunityCardProps) {
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);
  const [pinged, setPinged] = useState(false);
  const articleRef = useRef<HTMLElement>(null);

  // Land on the post from a notification. Scrolling a card that is already in
  // view is jarring, so this only runs when the card is genuinely off-screen.
  // focusSignal is the same signal the comment button uses, which both fetches
  // the thread and puts the caret in the box.
  //
  // Everything is deferred to a timer rather than run inline, so the effect does
  // not itself set state, and a timer is used instead of requestAnimationFrame
  // because frames are not delivered everywhere: a background tab, an embedded
  // webview or a headless browser all skip them, which would strand the reader
  // at the top of the feed with no sign the post was ever found. The timer also
  // lands after layout, so the off-screen measurement is still accurate.
  useEffect(() => {
    if (!autoFocus) return;

    let pingTimer: ReturnType<typeof setTimeout> | undefined;

    const focusTimer = setTimeout(() => {
      const el = articleRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight;
      // A post with an image and a comment thread is often taller than the
      // window, so it can never be fully in view. What matters is whether its
      // start is visible, otherwise scrolling would fire on a post sitting
      // happily at the top of the feed.
      const startVisible = rect.top >= 0 && rect.top < viewportH;
      if (!startVisible) {
        // Centring a card taller than the window leaves its title above the
        // fold, so those get aligned to the top instead. The jump is instant on
        // purpose: a smooth scroll is driven by animation frames, which are not
        // delivered in every environment, and a deep link that silently fails to
        // move is worse than one that arrives without a flourish.
        el.scrollIntoView({
          behavior: 'auto',
          block: rect.height > viewportH ? 'start' : 'center',
        });
      }

      setPinged(true);
      if (focusComposer) setFocusSignal((n) => n + 1);
      onAutoFocused?.();
      pingTimer = setTimeout(() => setPinged(false), 2600);
    }, 0);

    return () => {
      clearTimeout(focusTimer);
      if (pingTimer) clearTimeout(pingTimer);
    };
  }, [autoFocus, focusComposer, onAutoFocused]);

  // Social like state, held locally so the heart reacts on the click rather than
  // after a refetch.
  const [liked, setLiked] = useState(!!item.liked_by_me);
  const [likeCount, setLikeCount] = useState(item.like_count ?? 0);
  const [likePending, setLikePending] = useState(false);
  const [lastLikeProps, setLastLikeProps] = useState({
    liked: item.liked_by_me,
    count: item.like_count,
  });

  // When the feed hands down a fresh value (first load, or the parent settling on
  // the server's response after a toggle), adopt it. Adjusting during render is
  // React's documented alternative to an effect that mirrors props into state,
  // which would cascade an extra render on every feed update. Guarding on the
  // previous prop values is what keeps a local optimistic update alive across
  // unrelated re-renders.
  if (item.liked_by_me !== lastLikeProps.liked || item.like_count !== lastLikeProps.count) {
    setLastLikeProps({ liked: item.liked_by_me, count: item.like_count });
    setLiked(!!item.liked_by_me);
    setLikeCount(item.like_count ?? 0);
  }

  const handleLike = useCallback(async () => {
    if (likePending) return;
    const nextLiked = !liked;
    // Optimistic, so a tap feels instant. A failed request resolves to null from
    // the parent and both values are rolled back below.
    setLiked(nextLiked);
    setLikeCount((n) => Math.max(0, n + (nextLiked ? 1 : -1)));
    setLikePending(true);
    try {
      const result = await onToggleFavorite(item.id);
      if (result) {
        setLiked(result.liked);
        setLikeCount(result.like_count);
      } else {
        setLiked(!nextLiked);
        setLikeCount((n) => Math.max(0, n + (nextLiked ? -1 : 1)));
      }
    } catch {
      setLiked(!nextLiked);
      setLikeCount((n) => Math.max(0, n + (nextLiked ? -1 : 1)));
    } finally {
      setLikePending(false);
    }
  }, [likePending, liked, item.id, onToggleFavorite]);

  const menuRef = useRef<HTMLDivElement>(null);
  const handleCountChange = useCallback((n: number) => setCommentCount(n), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const sharedBy = item.shared_by;
  const authorName = sharedBy
    ? (sharedBy.first_name || sharedBy.last_name
        ? `${sharedBy.first_name || ''} ${sharedBy.last_name || ''}`.trim()
        : sharedBy.email.split('@')[0])
    : 'Keeva Member';
  const authorInitial = authorName.charAt(0).toUpperCase();

  const isInstagram = item.platform.toLowerCase() === 'instagram';
  const igEmbedUrl = isInstagram ? getInstagramEmbedUrl(item.source_url) : null;

  const isReel = item.media_type === 'REEL' || item.aspect_ratio === 'PORTRAIT_9_16';
  const isPdf = item.media_type === 'DOCUMENT';

  let domain = '';
  try { domain = new URL(item.source_url).hostname.replace('www.', ''); } catch { domain = item.platform; }

  const caption = item.community_caption || '';
  const hasCaption = caption.length > 0;
  const isFeed = variant === 'feed';
  const clampable = hasCaption && caption.length > LONG_CAPTION;

  // ── Media ──────────────────────────────────────────────────────────
  // The card is full width, but the media is not. `aspect-*` combined with a
  // max-height would letterbox a vertical reel into a very wide, short strip, so
  // the size is bounded by width instead, which keeps the ratio exact at any
  // card width and stops a 16:9 video becoming a ~1000px tall block on a wide
  // monitor. Centring the media keeps the preview box itself edge to edge.
  const mediaSize = isReel ? 'mx-auto w-full max-w-[400px] aspect-[9/16]' : 'mx-auto w-full max-w-[1024px] aspect-[16/9]';

  const media = isInstagram && igEmbedUrl ? (
    <div className={`relative ${mediaSize} overflow-hidden bg-black`}>
      {!embedLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#1a1a2e] to-[#0f3460] z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-xl">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <p className="text-[10px] text-white/60">Loading Reel...</p>
          </div>
        </div>
      )}
      <iframe
        src={igEmbedUrl}
        className={`w-full h-full border-0 transition-opacity duration-500 ${embedLoaded ? 'opacity-100' : 'opacity-0'}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
        onLoad={() => setEmbedLoaded(true)}
        title={item.title}
      />
      <button
        onClick={(e) => { e.stopPropagation(); onOpenPreview(item); }}
        className="absolute bottom-2 right-2 z-20 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white transition-all"
      >
        <Expand className="w-3 h-3" />
      </button>
    </div>
  ) : isPdf ? (
    <div className="aspect-[16/9] bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 flex flex-col items-center justify-center gap-2 group/doc">
      <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover/doc:scale-110 transition-transform">
        <FileText className="w-6 h-6" />
      </div>
      <span className="text-[10px] font-mono text-rose-300/80 font-semibold tracking-wider">PDF DOCUMENT</span>
    </div>
  ) : (
    <div className={`relative ${mediaSize} overflow-hidden group/media`}>
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 flex items-center justify-center">
        <BookOpen className="w-8 h-8 text-slate-700" />
      </div>
      {item.thumbnail_url && (
        <img
          src={item.thumbnail_url}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/media:scale-105"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
      {!isInstagram && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-opacity bg-black/30 backdrop-blur-[2px]">
          <div className="w-12 h-12 rounded-full bg-cyan-500/90 text-slate-950 flex items-center justify-center shadow-xl shadow-cyan-500/40">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );

  const onMediaClick = () => { if (!isInstagram) onOpenPreview(item); };

  // ── Preview box: media + domain + title + chips ────────────────────
  const showTitleInPreview = isFeed ? hasCaption : true;

  const preview = (
    <div className={isFeed ? 'border border-slate-800/70 rounded-2xl overflow-hidden bg-slate-950/40' : ''}>
      <div
        className={`relative overflow-hidden bg-slate-900 border-slate-800/50 ${isFeed ? '' : 'mx-3 mb-3 rounded-xl border cursor-pointer group/card'}`}
        onClick={onMediaClick}
      >
        {media}
      </div>
      <div className={isFeed ? 'px-4 py-3.5' : 'px-1'}>
        <div className="flex items-center gap-1.5 mb-1.5">
          {getPlatformIcon(item.platform)}
          <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-slate-500">{domain}</span>
        </div>

        {showTitleInPreview && (
          <h3
            onClick={() => onOpenPreview(item)}
            className={`font-bold text-white leading-snug cursor-pointer hover:text-cyan-300 transition-colors ${isFeed ? 'text-[14.5px]' : 'text-sm line-clamp-2 mb-1'}`}
          >
            {item.title}
          </h3>
        )}

        {item.description && !hasCaption && (
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mt-1">{item.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-bold ${getPriorityStyle(item.priority_score, item.priority)}`}
            title={`Priority: ${item.priority}`}
          >
            <Sparkles className="w-2.5 h-2.5" />
            {item.priority_score}
          </div>
          {item.category && (
            <span
              className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md text-white/90"
              style={{ backgroundColor: `${item.category.color_hex}30`, borderColor: item.category.color_hex, borderWidth: '1px' }}
            >
              {item.category.name}
            </span>
          )}
          {item.tags?.slice(0, 4).map((tag, i) => (
            <span key={i} className="text-[10px] text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/40">#{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Author meta line (name + time + globe) ──────────────────────────
  const authorHeader = (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950 flex items-center justify-center font-black text-sm shadow-md shrink-0">
        {authorInitial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-white">{authorName}</span>
          {isOwner && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold uppercase shrink-0">
              You
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
          <Clock className="w-3 h-3" />
          <span>{formatDate(item.created_at)}</span>
          {item.community_edited_at && (
            <>
              <span>·</span>
              <span title={new Date(item.community_edited_at).toLocaleString()}>edited</span>
            </>
          )}
          <span>·</span>
          <Globe className="w-3 h-3" />
        </div>
      </div>

      {isOwner && (onEdit || onRemove) && (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((p) => !p)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/70 transition-colors"
            title="Post options"
            aria-label="Post options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-slate-900/95 border border-slate-800 rounded-xl shadow-2xl backdrop-blur-xl z-50 overflow-hidden py-1">
              {onEdit && (
                <button
                  onClick={() => { setMenuOpen(false); onEdit(item); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-slate-300 hover:bg-slate-800/70 hover:text-white transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 text-cyan-400" />
                  Edit post
                </button>
              )}
              {onRemove && (
                <button
                  onClick={() => { setMenuOpen(false); onRemove(item); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  Remove from Community
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Action bar ─────────────────────────────────────────────────────
  const actions = (
    <div className={`flex items-center justify-between text-[11px] text-slate-500 ${isFeed ? 'font-mono' : ''}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={handleLike}
          disabled={likePending}
          aria-pressed={liked}
          title={liked ? 'Unlike' : 'Like'}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors group/fav disabled:opacity-60 disabled:cursor-wait"
        >
          <Heart className={`w-4 h-4 transition-colors ${liked ? 'text-rose-500 fill-rose-500' : 'group-hover/fav:text-rose-400'}`} />
          <span className="font-mono text-[11px]">{liked ? 'Liked' : 'Like'}</span>
          {likeCount > 0 && <span className="font-mono text-[11px] text-slate-500">{likeCount}</span>}
        </button>
        <span className="flex items-center gap-1 font-mono">
          <Eye className="w-3.5 h-3.5 text-cyan-400/70" />
          {item.access_count}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setFocusSignal((n) => n + 1)}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            commentCount > 0 ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-500 hover:text-cyan-400'
          }`}
          title="Comments"
        >
          <MessageSquare className="w-4 h-4" />
          {commentCount > 0 && <span className="font-mono text-[11px]">{commentCount}</span>}
        </button>
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors ${isFeed ? 'hover:bg-slate-800/70' : 'bg-slate-800/50 hover:bg-slate-700'}`}
          title="Open Original"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );

  // ── FEED: post on page background, box only around shared content ──
  if (isFeed) {
    return (
      <article
        ref={articleRef}
        className={`pb-4 rounded-2xl transition-all duration-300 ${
          pinged ? 'ring-2 ring-cyan-400/70 bg-cyan-500/[0.04]' : ''
        }`}
      >
        {authorHeader}

        {hasCaption ? (
          <p
            className={`mt-3 text-[15.5px] text-slate-200 leading-[1.62] tracking-[-0.005em] whitespace-pre-wrap break-words ${
              clampable && !expanded ? 'line-clamp-4' : ''
            }`}
          >
            {caption}
            {clampable && (
              <button
                onClick={() => setExpanded((p) => !p)}
                className="ml-1 text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                {expanded ? 'see less' : 'see more'}
              </button>
            )}
          </p>
        ) : (
          <div className="mt-3">
            <h3
              onClick={() => onOpenPreview(item)}
              className="text-[17px] font-bold text-white leading-snug cursor-pointer hover:text-cyan-300 transition-colors"
            >
              {item.title}
            </h3>
            {isOwner && onEdit && (
              // Without a caption the card falls back to the title, which reads
              // like a caption-less post. Point the owner at the one-click fix.
              <button
                onClick={() => onEdit(item)}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400/90 hover:text-cyan-300 transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Add a caption so people know why you shared this
              </button>
            )}
          </div>
        )}

        <div className="mt-3">{preview}</div>

        <div className="mt-3 h-px bg-slate-800/70" />
        <div className="mt-2.5">{actions}</div>

        <CommunityComments
          itemId={item.id}
          initialCount={item.comment_count ?? 0}
          onCountChange={handleCountChange}
          focusSignal={focusSignal}
        />
      </article>
    );
  }

  // ── MASONRY: boxed tile ────────────────────────────────────────────
  return (
    <article
      ref={articleRef}
      className={`bg-slate-950/90 border rounded-2xl overflow-hidden flex flex-col transition-all duration-300 group ${
        pinged
          ? 'border-cyan-500/50 ring-2 ring-cyan-400/70'
          : 'border-slate-800/70 hover:border-slate-700/80'
      }`}
    >
      <div className="px-4 pt-4 pb-3">{authorHeader}</div>
      {hasCaption && (
        <div className="px-4 pb-3">
          <p
            className={`text-[13.5px] text-slate-200 leading-relaxed whitespace-pre-wrap break-words ${
              clampable && !expanded ? 'line-clamp-3' : ''
            }`}
          >
            {caption}
            {clampable && (
              <button
                onClick={() => setExpanded((p) => !p)}
                className="ml-1 text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                {expanded ? 'see less' : 'see more'}
              </button>
            )}
          </p>
        </div>
      )}
      {preview}
      <div className="mt-3 px-4 py-3 border-t border-slate-800/60">{actions}</div>
      <div className="px-4 pb-4">
        <CommunityComments
          itemId={item.id}
          initialCount={item.comment_count ?? 0}
          onCountChange={handleCountChange}
          focusSignal={focusSignal}
        />
      </div>
    </article>
  );
}
