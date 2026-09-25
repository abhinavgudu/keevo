'use client';

import React from 'react';
import { ContentItem } from '@/types/vault';
import { Play, ExternalLink, Heart, Eye, Film, Video, Trash2, Sparkles, Share2, Camera, Clock } from 'lucide-react';

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

interface PortraitReelCardProps {
  item: ContentItem;
  onOpenPreview: (item: ContentItem) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

export function PortraitReelCard({
  item,
  onOpenPreview,
  onToggleFavorite,
  onDelete,
  onTagClick,
}: PortraitReelCardProps) {
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
      case 'instagram':
        return <Camera className="w-3.5 h-3.5 text-pink-400" />;
      case 'youtube':
        return <Video className="w-3.5 h-3.5 text-red-400" />;
      case 'tiktok':
        return <span className="text-xs font-black text-cyan-300">TT</span>;
      default:
        return <Play className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  return (
    <div className="masonry-item group">
      <div className="relative rounded-2xl overflow-hidden glass-panel glass-panel-hover border border-slate-800/80 bg-slate-950/80 transition-all duration-300 flex flex-col">
        {/* 9:16 Media Preview Container */}
        <div
          onClick={() => onOpenPreview(item)}
          className="relative w-full aspect-[9/16] overflow-hidden cursor-pointer bg-slate-900 group/media select-none"
        >
          
          {/* Always render fallback underneath */}
          <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950/50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3">
              {getPlatformIcon(item.platform)}
            </div>
            <p className="text-xs text-slate-400 font-medium">{item.platform} Reel</p>
          </div>

          {/* Render image on top, use aesthetic fallback if null, strip legacy grayscale */}
          <img
            src={
              item.thumbnail_url?.includes('grayscale')
                ? `https://picsum.photos/seed/${item.id}/600/1000`
                : (item.thumbnail_url || `https://picsum.photos/seed/${item.id}/600/1000`)
            }
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover/media:scale-105 z-10"
            loading="lazy"
            onError={(e) => { (e.currentTarget as any).style.display = 'none'; }}
          />

{/* Gradient Overlay for Text Readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-black/30 pointer-events-none" />

          {/* Top Floating Badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
            {/* Platform Tag */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-semibold text-white shadow-lg">
              {getPlatformIcon(item.platform)}
              <span>{item.platform}</span>
              <span className="text-[10px] text-cyan-400 font-mono font-bold ml-0.5">9:16</span>
            </div>

            {/* Priority Score Tag */}
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

          {/* Play Center Hover Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-[2px]">
            <div className="w-14 h-14 rounded-full bg-cyan-500/90 text-slate-950 flex items-center justify-center shadow-xl shadow-cyan-500/40 transform scale-90 group-hover/media:scale-100 transition-transform">
              <Play className="w-6 h-6 fill-current ml-0.5" />
            </div>
          </div>

          {/* Bottom Card Content in 9:16 Frame */}
          <div className="absolute bottom-0 inset-x-0 p-4 z-10 flex flex-col justify-end">
            {/* Category Pill */}
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
            <h3 className="text-sm font-bold text-white leading-snug line-clamp-3 mb-1.5 drop-shadow-md group-hover:text-cyan-200 transition-colors">
              {item.title}
            </h3>

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2.5">
                {item.tags.slice(0, 3).map((tag, idx) => (
                  <span
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagClick?.(tag);
                    }}
                    className="text-[10px] text-slate-300/80 bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Footer Stats & Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-slate-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 font-mono text-[11px]" title="Access count">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  {item.access_count}
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500" title="Saved on">
                  <Clock className="w-3 h-3" />
                  {formatDate(item.created_at)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(item.id);
                  }}
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
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                  title="Open Original Link"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this item from your vault?')) {
                      onDelete(item.id);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                  title="Delete Item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
