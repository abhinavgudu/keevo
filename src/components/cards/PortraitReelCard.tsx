'use client';

import React, { useState } from 'react';
import { ContentItem } from '@/types/vault';
import { ExternalLink, Heart, Eye, Trash2, Sparkles, Clock, Camera, Video, Play, Expand } from 'lucide-react';

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface PortraitReelCardProps {
  item: ContentItem;
  onOpenPreview: (item: ContentItem) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

function getInstagramEmbedUrl(sourceUrl: string): string | null {
  try {
    const urlObj = new URL(sourceUrl);
    if (!urlObj.hostname.includes('instagram.com')) return null;
    const parts = urlObj.pathname.split('/').filter(Boolean);
    const idIndex = parts.findIndex((p) => p === 'reel' || p === 'reels' || p === 'p') + 1;
    if (idIndex > 0 && parts[idIndex]) {
      return `https://www.instagram.com/p/${parts[idIndex]}/embed/`;
    }
  } catch {
    return null;
  }
  return null;
}

export function PortraitReelCard({
  item,
  onOpenPreview,
  onToggleFavorite,
  onDelete,
  onTagClick,
}: PortraitReelCardProps) {
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);

  const isInstagram = item.platform.toLowerCase() === 'instagram';
  const igEmbedUrl = isInstagram ? getInstagramEmbedUrl(item.source_url) : null;

  const getPriorityStyle = (score: number, level: string) => {
    if (level === 'MUST_LEARN' || score >= 100) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
    if (level === 'HIGH' || score >= 75) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
    if (level === 'MEDIUM' || score >= 50) {
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    }
    return 'bg-slate-500/20 text-slate-400 border-slate-700/40';
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

  // For Instagram: show native embed inline; for others show thumbnail
  const renderMedia = () => {
    if (isInstagram && igEmbedUrl) {
      return (
        <div className="relative w-full aspect-[9/16] overflow-hidden bg-black">
          {/* Show thumbnail as placeholder while embed loads */}
          {!embedLoaded && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460]">
              {item.thumbnail_url ? (
                <img
                  src={item.thumbnail_url}
                  alt={item.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                />
              ) : null}
              <div className="relative z-10 flex flex-col items-center gap-3 p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-500 flex items-center justify-center shadow-xl shadow-pink-500/40">
                  <Camera className="w-6 h-6 text-white" />
                </div>
                <p className="text-[11px] text-white/80 font-medium">Loading Instagram Reel...</p>
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
          {/* Top badge overlay */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-xs font-semibold text-white shadow-lg pointer-events-auto">
              <Camera className="w-3.5 h-3.5 text-pink-400" />
              <span>Instagram</span>
              {item.category && (
                <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                  {item.category.name}
                </span>
              )}
            </div>
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border backdrop-blur-md text-[11px] font-mono font-bold shadow-md pointer-events-auto ${getPriorityStyle(item.priority_score, item.priority)}`}
            >
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>{item.priority_score}</span>
            </div>
          </div>
          {/* Expand button to open full modal */}
          <button
            onClick={() => onOpenPreview(item)}
            className="absolute bottom-3 right-3 z-20 p-2 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white transition-all hover:scale-110 active:scale-95"
            title="Open in Full View"
          >
            <Expand className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    // Non-Instagram: thumbnail with play button
    return (
      <div
        onClick={() => onOpenPreview(item)}
        className="relative w-full aspect-[9/16] overflow-hidden cursor-pointer bg-slate-900 group/media select-none"
      >
        {/* Fallback background */}
        <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950/50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3">
            {getPlatformIcon(item.platform)}
          </div>
          <p className="text-xs text-slate-400 font-medium">{item.platform} Reel</p>
        </div>

        {/* Thumbnail image */}
        <img
          src={
            item.thumbnail_url?.includes('grayscale')
              ? `https://picsum.photos/seed/${item.id}/600/1000`
              : item.thumbnail_url || `https://picsum.photos/seed/${item.id}/600/1000`
          }
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover/media:scale-105 z-10"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-black/30 pointer-events-none z-10" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-xs font-semibold text-white shadow-lg">
            {getPlatformIcon(item.platform)}
            <span>{item.platform}</span>
            {item.category && (
              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {item.category.name}
              </span>
            )}
          </div>
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border backdrop-blur-md text-[11px] font-mono font-bold shadow-md ${getPriorityStyle(item.priority_score, item.priority)}`}
          >
            <Sparkles className="w-3 h-3 animate-pulse" />
            <span>{item.priority_score}</span>
          </div>
        </div>

        {/* Play hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-[2px] z-20">
          <div className="w-14 h-14 rounded-full bg-cyan-500/90 text-slate-950 flex items-center justify-center shadow-xl shadow-cyan-500/40 transform scale-90 group-hover/media:scale-100 transition-transform">
            <Play className="w-6 h-6 fill-current ml-0.5" />
          </div>
        </div>

        {/* Bottom content */}
        <div className="absolute bottom-0 inset-x-0 p-4 z-20 flex flex-col justify-end">
          {item.category && (
            <div className="mb-2">
              <span
                className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md text-white/90 backdrop-blur-md"
                style={{
                  backgroundColor: `${item.category.color_hex}40`,
                  borderColor: item.category.color_hex,
                  borderWidth: '1px',
                }}
              >
                {item.category.name}
              </span>
            </div>
          )}
          <h3 className="text-sm font-bold text-white leading-snug line-clamp-3 mb-1.5 drop-shadow-md group-hover:text-cyan-200 transition-colors">
            {item.title}
          </h3>
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
        </div>
      </div>
    );
  };

  return (
    <div className="masonry-item group">
      <div className="relative rounded-2xl overflow-hidden glass-panel glass-panel-hover border border-slate-800/80 bg-slate-950/80 transition-all duration-300 flex flex-col">
        {renderMedia()}

        {/* Card footer — stats & actions */}
        <div className="px-3.5 py-2.5 flex items-center justify-between border-t border-slate-800/80 text-xs text-slate-400">
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
            {/* Title truncated */}
            {isInstagram && (
              <span className="text-[10px] text-slate-500 max-w-[80px] truncate hidden sm:block">
                {item.title.slice(0, 25)}
              </span>
            )}
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
  );
}
