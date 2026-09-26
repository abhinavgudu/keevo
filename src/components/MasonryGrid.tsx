'use client';

import React from 'react';
import { ContentItem } from '@/types/vault';
import { PortraitReelCard } from './cards/PortraitReelCard';
import { LandscapeWideCard } from './cards/LandscapeWideCard';
import { DocumentPdfCard } from './cards/DocumentPdfCard';
import { Sparkles, Compass } from 'lucide-react';

interface MasonryGridProps {
  items: ContentItem[];
  onOpenPreview: (item: ContentItem) => void;
  onOpenPdf: (item: ContentItem) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onTagClick?: (tag: string) => void;
  onResetFilters?: () => void;
}

export function MasonryGrid({
  items,
  onOpenPreview,
  onOpenPdf,
  onToggleFavorite,
  onDelete,
  onTagClick,
  onResetFilters,
}: MasonryGridProps) {
  if (items.length === 0) {
    return (
      <div className="w-full py-24 flex flex-col items-center justify-center text-center px-4">
        <div className="w-20 h-20 rounded-3xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-500 mb-5 shadow-2xl">
          <Compass className="w-10 h-10 animate-pulse text-cyan-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-200 mb-2">No Vault Items Found</h3>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          No content matches your current search query or active filter tags.
        </p>
        {onResetFilters && (
          <button
            onClick={onResetFilters}
            className="px-5 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-semibold text-xs hover:bg-cyan-500/20 transition-all shadow-lg shadow-cyan-500/10 flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" /> Reset All Filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-5 space-y-5">
      {items.map((item) => {
        if (item.media_type === 'DOCUMENT' || item.aspect_ratio === 'STANDARD_DOCUMENT') {
          return (
            <DocumentPdfCard
              key={item.id}
              item={item}
              onOpenPdf={onOpenPdf}
              onToggleFavorite={onToggleFavorite}
              onDelete={onDelete}
              onTagClick={onTagClick}
            />
          );
        }

        if (item.media_type === 'REEL') {
          return (
            <PortraitReelCard
              key={item.id}
              item={item}
              onOpenPreview={onOpenPreview}
              onToggleFavorite={onToggleFavorite}
              onDelete={onDelete}
              onTagClick={onTagClick}
            />
          );
        }

        return (
          <LandscapeWideCard
            key={item.id}
            item={item}
            onOpenPreview={onOpenPreview}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
            onTagClick={onTagClick}
          />
        );
      })}
    </div>
  );
}
