'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ContentItem, PriorityLevel } from '@/types/vault';
import {
  X, Heart, ExternalLink, MessageSquare, Sparkles,
  Play, Flame, Check, Film, Layers, Volume2, VolumeX,
  ChevronUp, ChevronDown, Share2, ArrowLeft, Smartphone
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ReelsDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ContentItem[];
  initialIndex?: number;
  onToggleFavorite: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onSaveItem: (item: Partial<ContentItem> & { title: string; source_url: string }) => Promise<void>;
  onIncrementAccess: (id: string) => void;
}

function getEmbedInfo(url: string, muted: boolean): { type: 'youtube' | 'instagram' | 'direct' | 'other'; embedUrl: string | null } {
  if (!url) return { type: 'other', embedUrl: null };
  const lower = url.toLowerCase();
  const muteParam = muted ? '1' : '0';

  // Direct video file
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')) {
    return { type: 'direct', embedUrl: url };
  }

  try {
    const u = new URL(url);

    // YouTube Shorts
    if (u.pathname.includes('/shorts/')) {
      const id = u.pathname.split('/shorts/')[1]?.split('?')[0];
      if (id) {
        return {
          type: 'youtube',
          embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&mute=${muteParam}&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1`,
        };
      }
    }

    // YouTube standard video
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      let id = '';
      if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1).split('?')[0];
      else id = u.searchParams.get('v') || '';
      if (id) {
        return {
          type: 'youtube',
          embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&mute=${muteParam}&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0&playsinline=1`,
        };
      }
    }

    // Instagram Reel / Post
    if (u.hostname.includes('instagram.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'reel' || p === 'reels' || p === 'p') + 1;
      if (idx > 0 && parts[idx]) {
        return {
          type: 'instagram',
          embedUrl: `https://www.instagram.com/reel/${parts[idx]}/embed/`,
        };
      }
    }
  } catch {}

  return { type: 'other', embedUrl: null };
}

export function ReelsDeckModal({
  isOpen,
  onClose,
  items,
  initialIndex = 0,
  onToggleFavorite,
  onUpdateNotes,
  onSaveItem,
  onIncrementAccess,
}: ReelsDeckModalProps) {
  // Filter for reel-like items (Instagram, TikTok, YouTube Shorts, 9:16 videos)
  const reelItems = items.filter((i) => {
    const url = (i.source_url || '').toLowerCase();
    return (
      i.aspect_ratio === 'PORTRAIT_9_16' ||
      i.media_type === 'REEL' ||
      i.platform.toLowerCase() === 'instagram' ||
      i.platform.toLowerCase() === 'tiktok' ||
      url.includes('instagram.com/reel') ||
      url.includes('instagram.com/p/') ||
      url.includes('youtube.com/shorts') ||
      url.includes('tiktok.com') ||
      url.endsWith('.mp4') ||
      url.endsWith('.webm')
    );
  });

  const displayItems = reelItems.length > 0 ? reelItems : items;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(false);
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [currentNote, setCurrentNote] = useState('');
  const [isSavedNote, setIsSavedNote] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeItem = displayItems[currentIndex] || null;

  // Sync note when index changes
  useEffect(() => {
    if (activeItem) {
      setCurrentNote(activeItem.notes || '');
      onIncrementAccess(activeItem.id);
    }
  }, [currentIndex, activeItem?.id]);

  // Scroll to initial index when opening
  useEffect(() => {
    if (isOpen && containerRef.current && initialIndex > 0) {
      const clientHeight = containerRef.current.clientHeight;
      containerRef.current.scrollTop = initialIndex * clientHeight;
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  // Detect scroll index with snapping
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const { scrollTop, clientHeight } = containerRef.current;
      const newIdx = Math.round(scrollTop / clientHeight);
      if (newIdx >= 0 && newIdx < displayItems.length && newIdx !== currentIndex) {
        setCurrentIndex(newIdx);
      }
    }, 80);
  }, [displayItems.length, currentIndex]);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!containerRef.current) return;
      const targetIdx = Math.max(0, Math.min(index, displayItems.length - 1));
      const clientHeight = containerRef.current.clientHeight;
      containerRef.current.scrollTo({
        top: targetIdx * clientHeight,
        behavior: 'smooth',
      });
      setCurrentIndex(targetIdx);
    },
    [displayItems.length]
  );

  const handleNext = () => scrollToIndex(currentIndex + 1);
  const handlePrev = () => scrollToIndex(currentIndex - 1);

  // Keyboard navigation (Up/Down/Esc)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'm') {
        setIsMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, displayItems.length]);

  const handleSaveNotes = () => {
    if (!activeItem) return;
    onUpdateNotes(activeItem.id, currentNote);
    setIsSavedNote(true);
    setTimeout(() => setIsSavedNote(false), 2000);
  };

  const handleCopyLink = () => {
    if (!activeItem) return;
    navigator.clipboard.writeText(activeItem.source_url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePriorityChange = async (newPriority: PriorityLevel) => {
    if (!activeItem) return;
    await onSaveItem({ ...activeItem, priority: newPriority });
  };

  if (!isOpen || displayItems.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black text-slate-100 flex flex-col overflow-hidden">
      {/* ─── Top Floating Header Bar ────────────────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 z-40 p-3 sm:p-4 flex items-center justify-between pointer-events-none">
        {/* Left: Back / Close & Counter */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center shadow-lg backdrop-blur-xl transition-transform active:scale-90 cursor-pointer"
            title="Close Reels Feed"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="px-3 py-1.5 rounded-full bg-black/60 border border-white/20 text-xs font-mono font-bold text-cyan-300 backdrop-blur-xl flex items-center gap-1.5 shadow-lg">
            <Film className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {currentIndex + 1} / {displayItems.length}
            </span>
          </div>
        </div>

        {/* Right: Quick Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Mute Toggle */}
          <button
            onClick={() => setIsMuted((m) => !m)}
            className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center shadow-lg backdrop-blur-xl transition-transform active:scale-90 cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>

          {/* Desktop Arrow Nav */}
          <div className="hidden sm:flex items-center gap-1 bg-black/60 border border-white/20 rounded-full p-1 backdrop-blur-xl shadow-lg">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="Previous Reel (▲)"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === displayItems.length - 1}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              title="Next Reel (▼)"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main Content Area: Full Bleed Snap-Slider ──────────────────────── */}
      <div className="flex-1 w-full h-full flex items-center justify-center overflow-hidden">
        {/* On desktop: Centered Phone Form Factor | On Mobile: 100% Fullscreen */}
        <div className="w-full h-full lg:max-w-[420px] lg:h-[94vh] lg:rounded-3xl lg:border-2 lg:border-slate-800/80 lg:shadow-2xl lg:shadow-cyan-500/10 relative overflow-hidden bg-black flex flex-col">
          {/* Vertical Snap Scroll Container */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="w-full h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {displayItems.map((item, index) => {
              const isCurrent = index === currentIndex;
              const isAdjacent = Math.abs(index - currentIndex) <= 1;
              const { type, embedUrl } = getEmbedInfo(item.source_url, isMuted);

              return (
                <div
                  key={item.id}
                  data-index={index}
                  className="w-full h-full snap-start snap-always relative flex items-center justify-center bg-black overflow-hidden select-none shrink-0"
                  style={{ minHeight: '100%' }}
                >
                  {/* Media Player */}
                  {isAdjacent ? (
                    type === 'direct' ? (
                      <video
                        src={item.doc_file_url || item.source_url}
                        autoPlay={isCurrent}
                        loop
                        muted={isMuted}
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : type === 'youtube' && embedUrl ? (
                      <div className="w-full h-full relative pointer-events-auto">
                        <iframe
                          key={`yt-${item.id}-${isCurrent ? 'active' : 'idle'}`}
                          src={isCurrent ? embedUrl : 'about:blank'}
                          title={item.title}
                          className="w-full h-full border-0 pointer-events-auto"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    ) : type === 'instagram' && embedUrl ? (
                      <div className="w-full h-full relative flex items-center justify-center bg-black">
                        <iframe
                          key={`ig-${item.id}-${isCurrent ? 'active' : 'idle'}`}
                          src={isCurrent ? embedUrl : 'about:blank'}
                          title={item.title}
                          className="w-full h-full border-0"
                          allowFullScreen
                          scrolling="no"
                        />
                      </div>
                    ) : (
                      /* Rich Fallback Story Card */
                      <div className="w-full h-full relative flex flex-col justify-between p-6 bg-gradient-to-b from-indigo-950 via-slate-950 to-black">
                        {item.thumbnail_url && (
                          <img
                            src={item.thumbnail_url}
                            alt={item.title}
                            className="absolute inset-0 w-full h-full object-cover filter brightness-75"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />

                        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4">
                          <a
                            href={item.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-18 h-18 rounded-full bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-600 flex items-center justify-center text-white shadow-2xl shadow-cyan-500/50 hover:scale-110 active:scale-95 transition-transform"
                          >
                            <Play className="w-8 h-8 fill-current ml-1" />
                          </a>
                          <span className="px-4 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-xs font-bold text-white shadow-lg">
                            Watch Reel on {item.platform}
                          </span>
                        </div>
                      </div>
                    )
                  ) : (
                    /* Placeholder for distant slides */
                    <div className="w-full h-full bg-black flex items-center justify-center">
                      {item.thumbnail_url && (
                        <img
                          src={item.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover opacity-20"
                        />
                      )}
                    </div>
                  )}

                  {/* Subtle Gradient Vignette Overlays for Maximum Readability */}
                  <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none z-10" />
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />

                  {/* ─── Bottom Left Metadata Overlay ───────────────────────── */}
                  <div className="absolute bottom-5 left-4 right-16 z-20 space-y-2 pointer-events-auto">
                    {/* Category & Platform Badge */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 backdrop-blur-md">
                        {item.platform}
                      </span>
                      {item.category && (
                        <span
                          className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full text-white backdrop-blur-md"
                          style={{
                            backgroundColor: `${item.category.color_hex}40`,
                            border: `1px solid ${item.category.color_hex}`,
                          }}
                        >
                          {item.category.name}
                        </span>
                      )}
                      {item.priority === 'MUST_LEARN' && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 backdrop-blur-md flex items-center gap-1">
                          <Flame className="w-2.5 h-2.5" /> Must Learn
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm sm:text-base font-bold text-white leading-snug drop-shadow-md line-clamp-2">
                      {item.title}
                    </h3>

                    {/* Description preview */}
                    {item.description && (
                      <p className="text-[11px] text-slate-300 line-clamp-1 drop-shadow-sm font-light">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* ─── Right Action Bar (Instagram / TikTok Style) ─────────── */}
                  <div className="absolute bottom-6 right-3.5 z-20 flex flex-col items-center gap-4 pointer-events-auto">
                    {/* Favorite / Heart */}
                    <button
                      onClick={() => {
                        onToggleFavorite(item.id);
                        if (!item.is_favorite) {
                          confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
                        }
                      }}
                      className="flex flex-col items-center gap-1 group active:scale-75 transition-transform cursor-pointer"
                    >
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all ${
                          item.is_favorite
                            ? 'bg-rose-500/30 border-rose-500 text-rose-400 shadow-lg shadow-rose-500/40'
                            : 'bg-black/60 border-white/20 text-white hover:bg-black/80'
                        }`}
                      >
                        <Heart
                          className={`w-5 h-5 ${item.is_favorite ? 'fill-rose-500 text-rose-500' : ''}`}
                        />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-white/90 drop-shadow">
                        {item.is_favorite ? 'Saved' : 'Like'}
                      </span>
                    </button>

                    {/* Notes Drawer Button */}
                    <button
                      onClick={() => setNotesDrawerOpen(true)}
                      className="flex flex-col items-center gap-1 group active:scale-75 transition-transform cursor-pointer"
                      title="Key Notes"
                    >
                      <div className="w-11 h-11 rounded-full bg-black/60 border border-white/20 text-white hover:bg-black/80 flex items-center justify-center backdrop-blur-xl transition-all shadow-md">
                        <MessageSquare className="w-5 h-5 text-cyan-400" />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-white/90 drop-shadow">
                        Notes
                      </span>
                    </button>

                    {/* Share / Copy Link */}
                    <button
                      onClick={handleCopyLink}
                      className="flex flex-col items-center gap-1 group active:scale-75 transition-transform cursor-pointer"
                      title="Share link"
                    >
                      <div className="w-11 h-11 rounded-full bg-black/60 border border-white/20 text-white hover:bg-black/80 flex items-center justify-center backdrop-blur-xl transition-all shadow-md">
                        {copiedLink ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-white/90 drop-shadow">
                        {copiedLink ? 'Copied!' : 'Share'}
                      </span>
                    </button>

                    {/* Open Original in App */}
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-1 group active:scale-75 transition-transform cursor-pointer"
                      title="Open in App"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 border border-white/30 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30">
                        <ExternalLink className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-white/90 drop-shadow">
                        App
                      </span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Desktop Side Insights Panel (Visible on lg screens) ───────────── */}
        <div className="hidden lg:flex flex-col justify-between w-88 h-[94vh] ml-6 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl overflow-y-auto shrink-0">
          <div className="space-y-5">
            <div>
              <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase tracking-wider block mb-1">
                Study Insights & Notes
              </span>
              <h3 className="text-base font-bold text-white leading-snug">{activeItem?.title}</h3>
              {activeItem?.category && (
                <span
                  className="inline-block mt-1.5 text-[10px] uppercase font-bold px-2 py-0.5 rounded text-white/90"
                  style={{
                    backgroundColor: `${activeItem.category.color_hex}40`,
                    border: `1px solid ${activeItem.category.color_hex}`,
                  }}
                >
                  {activeItem.category.name}
                </span>
              )}
            </div>

            {/* Priority Selector */}
            <div className="p-3.5 bg-gradient-to-br from-slate-950 to-indigo-950/50 rounded-2xl border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" /> Mastery Priority
                </span>
                <span className="font-mono font-bold text-white">{activeItem?.priority_score || 0} pts</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['MUST_LEARN', 'HIGH', 'MEDIUM', 'LOW'] as PriorityLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => handlePriorityChange(lvl)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                      activeItem?.priority === lvl
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                        : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {lvl === 'MUST_LEARN' ? 'MUST' : lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            {activeItem?.description && (
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
                {activeItem.description}
              </p>
            )}

            {/* Notes Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Reel Notes
                </label>
                {isSavedNote && (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold">
                    <Check className="w-3.5 h-3.5" /> Saved!
                  </span>
                )}
              </div>
              <textarea
                rows={5}
                value={currentNote}
                onChange={(e) => setCurrentNote(e.target.value)}
                placeholder="Write key concepts, interview answers, or code snippets from this reel..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none font-mono"
              />
              <button
                type="button"
                onClick={handleSaveNotes}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer"
              >
                Save Notes
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Swipe or ▲ / ▼</span>
            <span>ESC to close</span>
          </div>
        </div>
      </div>

      {/* ─── Mobile Slide-Up Notes Bottom Drawer ────────────────────────────── */}
      {notesDrawerOpen && activeItem && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in">
          <div className="p-5 bg-slate-950 border-t border-slate-800 rounded-t-3xl max-h-[75vh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-bold text-white">Reel Study Notes</h4>
              </div>
              <button
                onClick={() => setNotesDrawerOpen(false)}
                className="p-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h5 className="text-xs font-bold text-slate-200 line-clamp-1">{activeItem.title}</h5>

            <textarea
              rows={4}
              value={currentNote}
              onChange={(e) => setCurrentNote(e.target.value)}
              placeholder="Jot down notes while watching..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none font-mono"
            />

            <button
              onClick={() => {
                handleSaveNotes();
                setNotesDrawerOpen(false);
              }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
            >
              Save & Resume Watching
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
