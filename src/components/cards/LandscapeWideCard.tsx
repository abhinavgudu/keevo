'use client';

import React from 'react';
import { ContentItem } from '@/types/vault';
import { ExternalLink, Heart, Eye, Trash2, Sparkles, Globe, BookOpen, Video, Share2 } from 'lucide-react';

interface LandscapeWideCardProps {
  item: ContentItem;
  onOpenPreview: (item: ContentItem) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

export function LandscapeWideCard({
  item,
  onOpenPreview,
  onToggleFavorite,
  onDelete,
  onTagClick,
}: LandscapeWideCardProps) {
  const getPriorityStyle = (score: number, level: string) => {
    if (level === 'MUST_LEARN' || score >= 100) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/20';
    }
    if (level === 'HIGH' || score >= 75) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/20';
    }
    if (level === 'MEDIUM' || score >= 50) {
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-cyan-500/20';
    }
    return 'bg-slate-500/20 text-slate-400 border-slate-700/40 shadow-none';
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'linkedin':
        return <Share2 className="w-3.5 h-3.5 text-blue-400" />;
      case 'youtube':
        return <Video className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Globe className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  let domain = '';
  try {
    domain = new URL(item.source_url).hostname.replace('www.', '');
  } catch {
    domain = item.platform;
  }

  return (
    <div className="masonry-item group">
      <div className="relative rounded-2xl overflow-hidden glass-panel glass-panel-hover border border-slate-800/80 bg-slate-950/80 transition-all duration-300 flex flex-col">
        {/* 16:9 Thumbnail Header */}
        <div
          onClick={() => onOpenPreview(item)}
          className="relative w-full aspect-[16/9] overflow-hidden cursor-pointer bg-slate-900 group/media"
        >
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/media:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 flex items-center justify-center p-6 text-center">
              <BookOpen className="w-10 h-10 text-slate-700" />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/30 pointer-events-none" />

          {/* Top Badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-semibold text-white shadow-lg">
              {getPlatformIcon(item.platform)}
              <span className="truncate max-w-[120px]">{domain}</span>
            </div>

            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border backdrop-blur-md text-[11px] font-mono font-bold shadow-md ${getPriorityStyle(
                item.priority_score,
                item.priority
              )}`}
              title={`Calculated Score: ${item.priority_score} (${item.priority})`}
            >
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>{item.priority_score}</span>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4 flex flex-col flex-grow justify-between">
          <div>
            {/* Category */}
            {item.category && (
              <div className="mb-2">
                <span
                  className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md text-white/90 backdrop-blur-md"
                  style={{ backgroundColor: `${item.category.color_hex}40`, borderColor: item.category.color_hex, borderWidth: '1px' }}
                >
                  {item.category.name}
                </span>
              </div>
            )}

            {/* Title */}
            <h3
              onClick={() => onOpenPreview(item)}
              className="text-sm font-bold text-slate-100 leading-snug line-clamp-2 mb-2 cursor-pointer hover:text-cyan-300 transition-colors"
            >
              {item.title}
            </h3>

            {/* Excerpt / Description */}
            {item.description && (
              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
                {item.description}
              </p>
            )}

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {item.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    onClick={() => onTagClick?.(tag)}
                    className="text-[10px] text-slate-400 bg-slate-800/80 hover:bg-slate-700/80 px-1.5 py-0.5 rounded transition-colors cursor-pointer border border-slate-700/50"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer Stats & Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400 mt-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-mono text-[11px]" title="Access count">
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                {item.access_count}
              </span>
              <button
                type="button"
                onClick={() => onToggleFavorite(item.id)}
                className="hover:scale-110 active:scale-95 transition-transform"
                title={item.is_favorite ? 'Remove Favorite' : 'Mark Favorite (+30 score)'}
              >
                <Heart
                  className={`w-4 h-4 transition-colors ${
                    item.is_favorite ? 'text-rose-500 fill-rose-500' : 'text-slate-400 hover:text-rose-400'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="Open Source Link"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Delete this item from your vault?')) {
                    onDelete(item.id);
                  }
                }}
                className="p-1.5 rounded-lg bg-slate-800/50 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                title="Delete Item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
