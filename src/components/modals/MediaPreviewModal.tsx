'use client';

import React, { useState } from 'react';
import { ContentItem } from '@/types/vault';
import { X, ExternalLink, Heart, Eye, Sparkles, MessageSquare, Play, Flame, Check } from 'lucide-react';

interface MediaPreviewModalProps {
  item: ContentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
}

export function MediaPreviewModal({
  item,
  isOpen,
  onClose,
  onToggleFavorite,
  onUpdateNotes,
}: MediaPreviewModalProps) {
  const [notesText, setNotesText] = useState(item?.notes || '');
  const [isSavedNotes, setIsSavedNotes] = useState(false);

  if (!isOpen || !item) return null;

  const isPortrait = item.aspect_ratio === 'PORTRAIT_9_16' || item.media_type === 'REEL';

  const handleSaveNotes = () => {
    onUpdateNotes(item.id, notesText);
    setIsSavedNotes(true);
    setTimeout(() => setIsSavedNotes(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl overflow-y-auto">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-slate-100 max-h-[90vh]">
        {/* Left Side: Media Preview Canvas (9:16 phone mockup or 16:9 wide) */}
        <div
          className={`relative bg-slate-950 flex items-center justify-center p-4 border-b md:border-b-0 md:border-r border-slate-800 ${
            isPortrait ? 'md:w-5/12' : 'md:w-7/12'
          }`}
        >
          {isPortrait ? (
            /* 9:16 Mobile Phone Mockup */
            <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-black flex flex-col justify-between">
              {item.thumbnail_url ? (
                <img
                  src={item.thumbnail_url}
                  alt={item.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 via-slate-900 to-black flex items-center justify-center text-slate-500">
                  <Play className="w-12 h-12 text-cyan-400 opacity-60" />
                </div>
              )}

              {/* Top notch */}
              <div className="relative z-10 w-full pt-3 px-4 flex justify-between items-center">
                <span className="text-[10px] font-mono font-bold text-white/80 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md">
                  {item.platform} 9:16
                </span>
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-700/40">
                  Score: {item.priority_score}
                </span>
              </div>

              {/* Bottom title inside mockup */}
              <div className="relative z-10 p-4 bg-gradient-to-t from-black via-black/80 to-transparent">
                <h4 className="text-xs font-bold text-white line-clamp-3 mb-2">{item.title}</h4>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Watch on {item.platform}
                </a>
              </div>
            </div>
          ) : (
            /* 16:9 Wide Preview */
            <div className="w-full space-y-4">
              <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden border border-slate-800 bg-black">
                {item.thumbnail_url ? (
                  <img
                    src={item.thumbnail_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <Play className="w-12 h-12" />
                  </div>
                )}
              </div>
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                <ExternalLink className="w-4 h-4" /> Open Original Post on {item.platform}
              </a>
            </div>
          )}
        </div>

        {/* Right Side: Metadata, Priority Formula Breakdown & Study Notes */}
        <div
          className={`p-6 flex flex-col justify-between overflow-y-auto ${
            isPortrait ? 'md:w-7/12' : 'md:w-5/12'
          }`}
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                {item.category && (
                  <span
                    className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md text-white/90 mb-2"
                    style={{ backgroundColor: `${item.category.color_hex}40`, borderColor: item.category.color_hex, borderWidth: '1px' }}
                  >
                    {item.category.name}
                  </span>
                )}
                <h3 className="text-base font-bold text-white leading-snug">{item.title}</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Description */}
            {item.description && (
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                {item.description}
              </p>
            )}

            {/* Priority Score Breakdown Box */}
            <div className="p-3.5 bg-gradient-to-br from-slate-950 to-indigo-950/40 rounded-xl border border-slate-800/90 text-xs space-y-2">
              <div className="flex items-center justify-between font-semibold text-cyan-300">
                <span className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-400" /> Priority Engine Breakdown
                </span>
                <span className="font-mono text-sm font-bold text-white">{item.priority_score} pts</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
                <div>Tier: <span className="text-slate-200">{item.priority}</span></div>
                <div>Accesses: <span className="text-cyan-400">{item.access_count} (+{(item.access_count || 0) * 2} pts)</span></div>
                <div>Favorite: <span className={item.is_favorite ? 'text-rose-400' : 'text-slate-500'}>{item.is_favorite ? '+30 pts' : '0 pts'}</span></div>
                <div>Created: <span className="text-slate-300">{new Date(item.created_at).toLocaleDateString()}</span></div>
              </div>
            </div>

            {/* Study Notes Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> My Study Insights & Key Takeaways
                </label>
                {isSavedNotes && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
              <textarea
                rows={3}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Write actionable takeaways, syntax snippets or architecture notes..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
              />
              <button
                type="button"
                onClick={handleSaveNotes}
                className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
              >
                Save Notes
              </button>
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between mt-4">
            <button
              onClick={() => onToggleFavorite(item.id)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            >
              <Heart
                className={`w-4 h-4 ${
                  item.is_favorite ? 'text-rose-500 fill-rose-500' : 'text-slate-400'
                }`}
              />
              <span>{item.is_favorite ? 'Favorited' : 'Favorite (+30)'}</span>
            </button>

            <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {item.access_count} views
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
