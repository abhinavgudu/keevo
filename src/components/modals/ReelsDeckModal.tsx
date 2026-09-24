'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ContentItem, PriorityLevel } from '@/types/vault';
import {
  X,
  ChevronUp,
  ChevronDown,
  Heart,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Play,
  Flame,
  Check,
  Share2,
  Film,
  Maximize2,
  Layers,
  Volume2,
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
  // Filter for portrait reels or all media
  const reelItems = items.filter(
    (i) => i.aspect_ratio === 'PORTRAIT_9_16' || i.media_type === 'REEL'
  );
  const displayItems = reelItems.length > 0 ? reelItems : items;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentNote, setCurrentNote] = useState('');
  const [isSavedNote, setIsSavedNote] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);

  const activeItem = displayItems[currentIndex] || null;

  useEffect(() => {
    if (activeItem) {
      setCurrentNote(activeItem.notes || '');
      onIncrementAccess(activeItem.id);
    }
  }, [currentIndex, activeItem?.id]);

  const handleNext = useCallback(() => {
    if (currentIndex < displayItems.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, displayItems.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  // Keyboard navigation: Up/Down arrow keys, Escape
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  if (!isOpen || !activeItem) return null;

  const handleSaveNotes = () => {
    onUpdateNotes(activeItem.id, currentNote);
    setIsSavedNote(true);
    setTimeout(() => setIsSavedNote(false), 2000);
  };

  const handlePriorityChange = async (newPriority: PriorityLevel) => {
    await onSaveItem({
      ...activeItem,
      priority: newPriority,
    });
  };

  // Helper to render media or embed
  const renderMediaContent = () => {
    const isDirectVideo =
      activeItem.source_url.endsWith('.mp4') ||
      activeItem.source_url.endsWith('.webm') ||
      activeItem.doc_file_url?.endsWith('.mp4');

    if (isDirectVideo) {
      return (
        <video
          src={activeItem.doc_file_url || activeItem.source_url}
          controls
          autoPlay
          loop
          className="w-full h-full object-cover rounded-2xl"
        />
      );
    }

    // YouTube Shorts embed
    if (activeItem.platform === 'YouTube' && activeItem.source_url.includes('shorts/')) {
      const shortId = activeItem.source_url.replace(/.*shorts\//, '').split(/[?&#]/)[0];
      if (shortId) {
        return (
          <iframe
            src={`https://www.youtube.com/embed/${shortId}?autoplay=1&loop=1&playlist=${shortId}&modestbranding=1`}
            title={activeItem.title}
            className="w-full h-full rounded-2xl border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        );
      }
    }

    // Default Portrait Frame Preview with Thumbnail and Link Out
    return (
      <div className="relative w-full h-full flex flex-col justify-between p-6">
        {activeItem.thumbnail_url ? (
          <img
            src={activeItem.thumbnail_url}
            alt={activeItem.title}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 via-slate-900 to-black flex items-center justify-center">
            <Film className="w-16 h-16 text-cyan-400/40 animate-pulse" />
          </div>
        )}

        {/* Ambient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-black/60 pointer-events-none" />

        {/* Top Header inside Reel frame */}
        <div className="relative z-10 flex items-center justify-between">
          <span className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-xs font-bold text-white shadow-xl flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-cyan-400" />
            {activeItem.platform} Reel (9:16)
          </span>
          <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-[11px] font-mono font-bold text-cyan-300">
            Score: {activeItem.priority_score}
          </span>
        </div>

        {/* Center Big Play Button */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto">
          <a
            href={activeItem.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-16 h-16 rounded-full bg-cyan-500/90 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-2xl shadow-cyan-500/50 hover:scale-110 active:scale-95 transition-all group"
          >
            <Play className="w-8 h-8 fill-current ml-1" />
          </a>
          <span className="text-[11px] font-medium text-white/80 mt-2.5 bg-black/60 px-3 py-1 rounded-full backdrop-blur-md">
            Click to Play Original on {activeItem.platform}
          </span>
        </div>

        {/* Bottom Details inside Reel */}
        <div className="relative z-10 space-y-2">
          {activeItem.category && (
            <span
              className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md text-white/90"
              style={{
                backgroundColor: `${activeItem.category.color_hex}40`,
                borderColor: activeItem.category.color_hex,
                borderWidth: '1px',
              }}
            >
              {activeItem.category.name}
            </span>
          )}
          <h3 className="text-sm sm:text-base font-bold text-white leading-snug drop-shadow-md">
            {activeItem.title}
          </h3>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-2xl p-2 sm:p-4 text-slate-100">
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 inset-x-4 max-w-6xl mx-auto flex items-center justify-between z-30 pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-bold text-white flex items-center gap-2 shadow-2xl">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Reels Deck Mode</span>
            <span className="text-slate-500">•</span>
            <span className="text-cyan-300 font-mono">
              {currentIndex + 1} of {displayItems.length}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">▲</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">▼</kbd>
            <span>Navigate</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidePanelOpen((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isSidePanelOpen
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
            <span>Study Notes</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Deck Container */}
      <div className="w-full max-w-5xl h-[88vh] flex items-center justify-center gap-6 relative mt-8">
        {/* Left Vertical Swipe Container: 9:16 Mockup */}
        <div className="relative h-full aspect-[9/16] max-h-[82vh] bg-black rounded-3xl border-4 border-slate-800/90 shadow-2xl overflow-hidden flex flex-col justify-between shrink-0">
          {renderMediaContent()}

          {/* Up & Down Navigation Overlay Buttons */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="w-10 h-10 rounded-full bg-slate-900/80 border border-white/20 text-white hover:bg-cyan-500 hover:text-slate-950 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none shadow-xl transition-all cursor-pointer"
              title="Previous Reel (Arrow Up)"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === displayItems.length - 1}
              className="w-10 h-10 rounded-full bg-slate-900/80 border border-white/20 text-white hover:bg-cyan-500 hover:text-slate-950 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none shadow-xl transition-all cursor-pointer"
              title="Next Reel (Arrow Down)"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right Side: Study Insights & Action Workspace */}
        {isSidePanelOpen && (
          <div className="hidden lg:flex flex-col justify-between w-96 h-[82vh] bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl overflow-y-auto">
            <div className="space-y-4">
              {/* Header Title */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                    Study Insights
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        onToggleFavorite(activeItem.id);
                        if (!activeItem.is_favorite) {
                          confetti({ particleCount: 35, spread: 50, origin: { y: 0.7 } });
                        }
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                      title="Toggle Favorite (+30 Score)"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          activeItem.is_favorite
                            ? 'text-rose-500 fill-rose-500'
                            : 'text-slate-400 hover:text-rose-400'
                        }`}
                      />
                    </button>
                    <a
                      href={activeItem.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Open Source Link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
                <h3 className="text-sm font-bold text-white leading-snug">{activeItem.title}</h3>
              </div>

              {/* Priority Scoring Live Widget */}
              <div className="p-3 bg-gradient-to-br from-slate-950 to-indigo-950/50 rounded-2xl border border-slate-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-400" /> Priority Level
                  </span>
                  <span className="font-mono font-bold text-white">{activeItem.priority_score} pts</span>
                </div>
                <div className="grid grid-cols-4 gap-1 pt-1">
                  {(['MUST_LEARN', 'HIGH', 'MEDIUM', 'LOW'] as PriorityLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => handlePriorityChange(lvl)}
                      className={`py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                        activeItem.priority === lvl
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                          : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {lvl === 'MUST_LEARN' ? 'MUST' : lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              {activeItem.description && (
                <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  {activeItem.description}
                </p>
              )}

              {/* Study Notes Markdown Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Key Learnings & Takeaways
                  </label>
                  {isSavedNote && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold animate-pulse">
                      <Check className="w-3 h-3" /> Saved!
                    </span>
                  )}
                </div>
                <textarea
                  rows={5}
                  value={currentNote}
                  onChange={(e) => setCurrentNote(e.target.value)}
                  placeholder="Capture quick code snippets, hooks, or key insights while watching..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none font-mono"
                />
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Study Notes
                </button>
              </div>
            </div>

            {/* Bottom Keyboard Guide */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Press Up/Down to cycle reels</span>
              <span>ESC to exit</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
