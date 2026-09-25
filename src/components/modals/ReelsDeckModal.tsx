'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ContentItem, PriorityLevel } from '@/types/vault';
import {
  X, Heart, ExternalLink, MessageSquare, Sparkles,
  Play, Flame, Check, Film, Layers, Volume2, VolumeX
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

function getEmbedUrl(url: string, muted: boolean): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const muteParam = muted ? '1' : '0';

    // YouTube Shorts
    if (u.pathname.includes('/shorts/')) {
      const id = u.pathname.split('/shorts/')[1]?.split('?')[0];
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=${muteParam}&loop=1&playlist=${id}&rel=0&modestbranding=1`;
    }
    // YouTube standard
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      let id = '';
      if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1).split('?')[0];
      else id = u.searchParams.get('v') || '';
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=${muteParam}&rel=0&modestbranding=1`;
    }
    // Instagram Reels
    if (u.hostname.includes('instagram.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(p => p === 'reel' || p === 'p') + 1;
      if (idx > 0 && parts[idx]) return `https://www.instagram.com/p/${parts[idx]}/embed/?hidecaption=true`;
    }
  } catch {}
  return null;
}

export function ReelsDeckModal({
  isOpen, onClose, items, initialIndex = 0,
  onToggleFavorite, onUpdateNotes, onSaveItem, onIncrementAccess,
}: ReelsDeckModalProps) {
  const reelItems = items.filter(i => i.aspect_ratio === 'PORTRAIT_9_16' || i.media_type === 'REEL');
  const displayItems = reelItems.length > 0 ? reelItems : items;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentNote, setCurrentNote] = useState('');
  const [isSavedNote, setIsSavedNote] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Touch swipe state
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeItem = displayItems[currentIndex] || null;

  useEffect(() => {
    if (activeItem) {
      setCurrentNote(activeItem.notes || '');
      onIncrementAccess(activeItem.id);
    }
  }, [currentIndex, activeItem?.id]);

  const handleNext = useCallback(() => {
    if (currentIndex < displayItems.length - 1) setCurrentIndex(p => p + 1);
  }, [currentIndex, displayItems.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(p => p - 1);
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); handleNext(); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); handlePrev(); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    
      <style>{`
        .reel-slide-up { animation: slideUp 0.3s ease-out forwards; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .ig-wrapper { overflow: hidden; position: relative; width: 100%; height: 100%; }
        .ig-wrapper iframe { position: absolute; top: -55px; bottom: -55px; height: calc(100% + 110px); width: 100%; pointer-events: auto; }
      `}</style>

  return () => window.removeEventListener('keydown', handler);
  }, [isOpen, handleNext, handlePrev, onClose]);

  // Touch swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(delta) > 50) {
      if (delta > 0) handleNext();   // swipe up → next
      else handlePrev();              // swipe down → prev
    }
    touchStartY.current = null;
  };

  const handleSaveNotes = () => {
    if (!activeItem) return;
    onUpdateNotes(activeItem.id, currentNote);
    setIsSavedNote(true);
    setTimeout(() => setIsSavedNote(false), 2000);
  };

  const handlePriorityChange = async (newPriority: PriorityLevel) => {
    if (!activeItem) return;
    await onSaveItem({ ...activeItem, priority: newPriority });
  };

  if (!isOpen || !activeItem) return null;

  const embedUrl = getEmbedUrl(activeItem.source_url, isMuted);
  const isDirectVideo = activeItem.source_url.endsWith('.mp4') || activeItem.source_url.endsWith('.webm');

  const renderMedia = () => {
    // Direct video file
    if (isDirectVideo) {
      return (
        <video
          src={activeItem.doc_file_url || activeItem.source_url}
          controls autoPlay loop
          muted={isMuted}
          className="w-full h-full object-cover"
        />
      );
    }

    // Platform embed (YouTube / Instagram)
    
      if (embedUrl) {
        if (embedUrl.includes('instagram.com')) {
          return (
            <div className="ig-wrapper">
              <iframe
                key={`${activeItem.id}-${isMuted}`}
                src={embedUrl}
                title={activeItem.title}
                className="w-full h-full border-0 scale-[1.02]"
                allowFullScreen
                scrolling="no"
              />
            </div>
          );
        }
        return (

        <iframe
          key={`${activeItem.id}-${isMuted}`}  // re-mount on mute toggle for YT
          src={embedUrl}
          title={activeItem.title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }

    // Fallback thumbnail + external link
    return (
      <div className="relative w-full h-full flex flex-col justify-between p-5">
        {activeItem.thumbnail_url ? (
          <img src={activeItem.thumbnail_url} alt={activeItem.title}
            className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 via-slate-900 to-black flex items-center justify-center">
            <Film className="w-16 h-16 text-cyan-400/40 animate-pulse" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/50 pointer-events-none" />

        {/* Open externally */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full gap-3">
          <a href={activeItem.source_url} target="_blank" rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 group">
            <div className="w-16 h-16 rounded-full bg-cyan-500/90 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-2xl shadow-cyan-500/50 hover:scale-110 active:scale-95 transition-all">
              <Play className="w-8 h-8 fill-current ml-1" />
            </div>
            <span className="text-xs font-semibold text-white/80 bg-black/60 px-3 py-1 rounded-full backdrop-blur-md">
              Open on {activeItem.platform}
            </span>
          </a>
        </div>

        {/* Bottom info */}
        <div className="relative z-10 space-y-1">
          {activeItem.category && (
            <span className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded text-white/90"
              style={{ backgroundColor: `${activeItem.category.color_hex}40`, border: `1px solid ${activeItem.category.color_hex}` }}>
              {activeItem.category.name}
            </span>
          )}
          <h3 className="text-sm font-bold text-white leading-snug drop-shadow">{activeItem.title}</h3>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/98 backdrop-blur-2xl text-slate-100 flex flex-col">

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 z-30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-bold text-white flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-cyan-300 font-mono">{currentIndex + 1} / {displayItems.length}</span>
          </div>
          <div className="hidden sm:flex text-[11px] text-slate-500 font-mono gap-1 items-center">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">▲</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">▼</kbd>
            <span>or swipe</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mute/Unmute — only for YouTube/direct video */}
          {(embedUrl?.includes('youtube.com') || isDirectVideo) && (
            <button
              onClick={() => setIsMuted(m => !m)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
            </button>
          )}
          <a href={activeItem.source_url} target="_blank" rel="noopener noreferrer"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Open original">
            <ExternalLink className="w-5 h-5" />
          </a>
          <button onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main: phone mockup (center) + side panel */}
      <div className="flex-1 flex items-center justify-center gap-6 overflow-hidden px-4 pb-4">

        {/* 9:16 Phone Mockup — swipeable */}
        <div
          ref={containerRef}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          key={currentIndex} className="relative h-full max-h-[82vh] aspect-[9/16] bg-black rounded-3xl border-2 border-slate-800/80 shadow-2xl shadow-black overflow-hidden shrink-0 select-none reel-slide-up"
        >
          {renderMedia()}

          {/* Left edge: Favorite button */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
            <button
              onClick={() => {
                onToggleFavorite(activeItem.id);
                if (!activeItem.is_favorite) confetti({ particleCount: 35, spread: 50, origin: { y: 0.6 } });
              }}
              className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
            >
              <Heart className={`w-5 h-5 ${activeItem.is_favorite ? 'text-rose-500 fill-rose-500' : 'text-white/80'}`} />
            </button>
          </div>

          
          {currentIndex < displayItems.length - 1 && (
            <div onClick={handleNext} className="absolute bottom-16 inset-x-0 flex justify-center z-20 cursor-pointer opacity-50 hover:opacity-100 transition-opacity">
              <div className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs flex items-center gap-1">
                ↓ Next
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Notes + Priority (desktop only) */}
        <div className="hidden lg:flex flex-col justify-between w-80 h-[82vh] bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl backdrop-blur-xl overflow-y-auto shrink-0">
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase tracking-wider block mb-1">Study Insights</span>
              <h3 className="text-sm font-bold text-white leading-snug">{activeItem.title}</h3>
              {activeItem.category && (
                <span className="inline-block mt-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded text-white/90"
                  style={{ backgroundColor: `${activeItem.category.color_hex}40`, border: `1px solid ${activeItem.category.color_hex}` }}>
                  {activeItem.category.name}
                </span>
              )}
            </div>

            {/* Priority */}
            <div className="p-3 bg-gradient-to-br from-slate-950 to-indigo-950/50 rounded-2xl border border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" /> Priority
                </span>
                <span className="font-mono font-bold text-white">{activeItem.priority_score} pts</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(['MUST_LEARN', 'HIGH', 'MEDIUM', 'LOW'] as PriorityLevel[]).map((lvl) => (
                  <button key={lvl} type="button" onClick={() => handlePriorityChange(lvl)}
                    className={`py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                      activeItem.priority === lvl ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}>
                    {lvl === 'MUST_LEARN' ? 'MUST' : lvl}
                  </button>
                ))}
              </div>
            </div>

            {activeItem.description && (
              <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                {activeItem.description}
              </p>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Key Learnings
                </label>
                {isSavedNote && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <Check className="w-3 h-3" /> Saved!
                  </span>
                )}
              </div>
              <textarea rows={5} value={currentNote} onChange={e => setCurrentNote(e.target.value)}
                placeholder="Capture quick insights while watching..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none font-mono" />
              <button type="button" onClick={handleSaveNotes}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer">
                Save Notes
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Swipe or use ▲ ▼</span>
            <span>ESC to exit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
