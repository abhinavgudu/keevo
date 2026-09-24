'use client';

import React from 'react';
import { ContentItem } from '@/types/vault';
import { FileText, Download, ExternalLink, Heart, Eye, Trash2, Sparkles, BookOpen, Maximize2 } from 'lucide-react';

interface DocumentPdfCardProps {
  item: ContentItem;
  onOpenPdf: (item: ContentItem) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick?: (tag: string) => void;
}

export function DocumentPdfCard({
  item,
  onOpenPdf,
  onToggleFavorite,
  onDelete,
  onTagClick,
}: DocumentPdfCardProps) {
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

  const pdfUrl = item.doc_file_url || item.source_url;

  return (
    <div className="masonry-item group">
      <div className="relative rounded-2xl overflow-hidden glass-panel glass-panel-hover border border-rose-950/40 bg-slate-950/85 transition-all duration-300 flex flex-col">
        {/* PDF Header with Cover Preview or PDF Graphic */}
        <div
          onClick={() => onOpenPdf(item)}
          className="relative w-full h-44 overflow-hidden cursor-pointer bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 border-b border-slate-800/80 group/doc"
        >
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt={item.title}
              className="w-full h-full object-cover opacity-60 group-hover/doc:scale-105 group-hover/doc:opacity-80 transition-all duration-500"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-2 shadow-lg shadow-rose-500/10 group-hover/doc:scale-110 transition-transform">
                <FileText className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-mono text-rose-300/80 font-semibold tracking-wider">PDF DOCUMENT</span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-black/40 pointer-events-none" />

          {/* Top Badges */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/80 backdrop-blur-md border border-rose-500/30 text-xs font-semibold text-rose-200 shadow-lg">
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span>PDF Engine</span>
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

          {/* Center Hover Action */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/doc:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-[2px]">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-white font-semibold text-xs shadow-xl shadow-rose-500/30 transform scale-95 group-hover/doc:scale-100 transition-transform">
              <Maximize2 className="w-4 h-4" /> Open PDF Reader
            </div>
          </div>
        </div>

        {/* Document Body */}
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
              onClick={() => onOpenPdf(item)}
              className="text-sm font-bold text-slate-100 leading-snug line-clamp-2 mb-2 cursor-pointer hover:text-rose-300 transition-colors"
            >
              {item.title}
            </h3>

            {/* Description */}
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

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400 mt-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-mono text-[11px]" title="Read count">
                <Eye className="w-3.5 h-3.5 text-rose-400" />
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
                href={pdfUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg bg-slate-800/50 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition-colors"
                title="Download PDF"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Delete this PDF from your vault?')) {
                    onDelete(item.id);
                  }
                }}
                className="p-1.5 rounded-lg bg-slate-800/50 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                title="Delete PDF"
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
