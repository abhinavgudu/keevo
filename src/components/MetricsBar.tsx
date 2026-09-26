'use client';

import React from 'react';
import { VaultStats } from '@/types/vault';
import { Flame, Film, FileText, Heart, Layers } from 'lucide-react';

interface MetricsBarProps {
  stats: VaultStats | null;
  onFilterMustLearn: () => void;
  onFilterReels: () => void;
  onFilterPdfs: () => void;
  onFilterFavorites: () => void;
}

export function MetricsBar({
  stats,
  onFilterMustLearn,
  onFilterReels,
  onFilterPdfs,
  onFilterFavorites,
}: MetricsBarProps) {
  if (!stats) return null;

  return (
    <div className="w-full mb-4 sm:mb-6">
      {/* Mobile Compact Horizontal Scroll Strip (< md) */}
      <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 shrink-0 font-mono">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>{stats.totalItems} Items</span>
        </div>

        <button
          type="button"
          onClick={onFilterMustLearn}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-300 shrink-0 font-mono active:scale-95 transition-transform"
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>{stats.mustLearnCount} Must Learn</span>
        </button>

        <button
          type="button"
          onClick={onFilterReels}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-300 shrink-0 font-mono active:scale-95 transition-transform"
        >
          <Film className="w-3.5 h-3.5 text-indigo-400" />
          <span>{stats.reelsCount} Reels</span>
        </button>

        <button
          type="button"
          onClick={onFilterPdfs}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 shrink-0 font-mono active:scale-95 transition-transform"
        >
          <FileText className="w-3.5 h-3.5 text-rose-400" />
          <span>{stats.documentsCount} Docs</span>
        </button>

        <button
          type="button"
          onClick={onFilterFavorites}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-950/40 border border-pink-500/30 text-xs text-pink-300 shrink-0 font-mono active:scale-95 transition-transform"
        >
          <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
          <span>{stats.favoritesCount} Favs</span>
        </button>
      </div>

      {/* Desktop Grid Layout (>= md) */}
      <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Items */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Total Curated</span>
            <span className="text-base font-bold font-mono text-white">{stats.totalItems} Items</span>
          </div>
        </div>

        {/* Must Learn */}
        <button
          onClick={onFilterMustLearn}
          className="p-3.5 rounded-2xl bg-amber-950/20 hover:bg-amber-950/30 border border-amber-500/30 backdrop-blur-md flex items-center gap-3 text-left transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-amber-300/80 block">Must Learn</span>
            <span className="text-base font-bold font-mono text-amber-200">{stats.mustLearnCount} Items</span>
          </div>
        </button>

        {/* 9:16 Reels */}
        <button
          onClick={onFilterReels}
          className="p-3.5 rounded-2xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/80 backdrop-blur-md flex items-center gap-3 text-left transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 group-hover:scale-105 transition-transform">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">9:16 Reels</span>
            <span className="text-base font-bold font-mono text-indigo-200">{stats.reelsCount} Media</span>
          </div>
        </button>

        {/* PDFs */}
        <button
          onClick={onFilterPdfs}
          className="p-3.5 rounded-2xl bg-rose-950/20 hover:bg-rose-950/30 border border-rose-500/30 backdrop-blur-md flex items-center gap-3 text-left transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 group-hover:scale-105 transition-transform">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-rose-300/80 block">PDF Engine</span>
            <span className="text-base font-bold font-mono text-rose-200">{stats.documentsCount} Docs</span>
          </div>
        </button>

        {/* Favorites */}
        <button
          onClick={onFilterFavorites}
          className="p-3.5 rounded-2xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/80 backdrop-blur-md flex items-center gap-3 text-left transition-all group cursor-pointer md:col-span-2 lg:col-span-1"
        >
          <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 shrink-0 group-hover:scale-105 transition-transform">
            <Heart className="w-5 h-5 text-pink-500 fill-pink-500" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block">Favorites (+30)</span>
            <span className="text-base font-bold font-mono text-pink-200">{stats.favoritesCount} Saved</span>
          </div>
        </button>
      </div>
    </div>
  );
}
