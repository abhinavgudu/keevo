'use client';

import React from 'react';
import { Category } from '@/types/vault';
import { UNCATEGORIZED_ID } from '@/lib/storage';
import type { CategoryCounts } from '@/lib/storage';
import { Sparkles, Film, FileText, LayoutGrid, Heart, Flame, ArrowUpDown, RotateCcw, Loader2, Inbox } from 'lucide-react';

export type FilterMediaType = 'ALL' | 'REEL' | 'LANDSCAPE' | 'PDF' | 'MUST_LEARN' | 'FAVORITES';
export type SortOption = 'PRIORITY_DESC' | 'NEWEST' | 'ACCESS_COUNT' | 'TITLE_ASC';

interface FilterBarProps {
  categories: Category[];
  categoryCounts: CategoryCounts;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  selectedMediaType: FilterMediaType;
  onSelectMediaType: (type: FilterMediaType) => void;
  sortBy: SortOption;
  onSelectSortBy: (sort: SortOption) => void;
  totalCount: number;
  filteredCount: number;
  isLoading?: boolean;
  onReset: () => void;
  hasActiveFilters: boolean;
}

/** Post count shown on every pill, so the row communicates what is where. */
function CountBadge({ value, active }: { value: number; active: boolean }) {
  return (
    <span
      className={`px-1 py-px rounded text-[9px] sm:text-[10px] font-mono tabular-nums ${
        active ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-slate-400'
      }`}
    >
      {value}
    </span>
  );
}

export function FilterBar({

  categories,
  categoryCounts,
  selectedCategoryId,
  onSelectCategory,
  selectedMediaType,
  onSelectMediaType,
  sortBy,
  onSelectSortBy,
  totalCount,
  filteredCount,
  isLoading,
  onReset,
  hasActiveFilters,
}: FilterBarProps) {
  const mediaTypePills: { id: FilterMediaType; label: string; icon: React.ReactNode }[] = [
    { id: 'ALL', label: 'All Media', icon: <LayoutGrid className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> },
    { id: 'MUST_LEARN', label: 'Must Learn', icon: <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" /> },
    { id: 'REEL', label: 'Reels 9:16', icon: <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400" /> },
    { id: 'LANDSCAPE', label: '16:9 Posts', icon: <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400" /> },
    { id: 'PDF', label: 'PDFs & Docs', icon: <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-400" /> },
    { id: 'FAVORITES', label: 'Favorites', icon: <Heart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-500 fill-rose-500" /> },
  ];

  return (
    <div className="w-full space-y-2.5 sm:space-y-3 mb-4 sm:mb-6">
      {/* Media Type Tabs & Sort Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Horizontal scrollable media tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full sm:w-auto">
          {mediaTypePills.map((pill) => {
            const isActive = selectedMediaType === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => onSelectMediaType(pill.id)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all duration-200 border cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white border-cyan-500/50 shadow-md'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-slate-200'
                }`}
              >
                {pill.icon}
                <span>{pill.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Sort & Dynamic Counter */}
        <div className="flex items-center justify-between sm:justify-end gap-2 text-[11px] sm:text-xs">
          {/* Item Counter */}
          <div className="flex items-center gap-1.5 text-slate-400 font-mono">
            {isLoading ? (
              <span className="flex items-center gap-1 text-cyan-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading
              </span>
            ) : (
              <span>
                <strong className="text-white">{filteredCount}</strong> of{' '}
                <strong className="text-slate-300">{totalCount}</strong>
              </span>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-0.5 text-[10px] sm:text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer ml-1"
                title="Reset active filters"
              >
                <RotateCcw className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Reset
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg sm:rounded-xl px-2 py-1 text-slate-300">
            <ArrowUpDown className="w-3 h-3 text-cyan-400" />
            <select
              value={sortBy}
              onChange={(e) => onSelectSortBy(e.target.value as SortOption)}
              className="bg-transparent text-[11px] sm:text-xs font-medium text-slate-200 outline-none cursor-pointer pr-1"
            >
              <option value="PRIORITY_DESC" className="bg-slate-900 text-slate-200">
                Priority Score
              </option>
              <option value="NEWEST" className="bg-slate-900 text-slate-200">
                Recently Added
              </option>
              <option value="ACCESS_COUNT" className="bg-slate-900 text-slate-200">
                Most Accessed
              </option>
              <option value="TITLE_ASC" className="bg-slate-900 text-slate-200">
                Alphabetical (A-Z)
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Category Pills Row — only categories that actually hold posts are shown,
          so the row stays short and every pill is a real destination. */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => onSelectCategory(null)}
          className={`flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
            selectedCategoryId === null
              ? 'bg-slate-800 text-white border-slate-600 shadow-sm'
              : 'bg-slate-950/60 text-slate-400 border-slate-800/80 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          <span>All</span>
          <CountBadge value={totalCount} active={selectedCategoryId === null} />
        </button>

        {categoryCounts.uncategorized > 0 && (
          <button
            type="button"
            onClick={() =>
              onSelectCategory(selectedCategoryId === UNCATEGORIZED_ID ? null : UNCATEGORIZED_ID)
            }
            className={`flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
              selectedCategoryId === UNCATEGORIZED_ID
                ? 'bg-slate-800 text-white border-slate-500 shadow-sm'
                : 'bg-slate-950/60 text-slate-400 border-slate-800/80 hover:text-slate-200'
            }`}
            title="Posts saved without a category"
          >
            <Inbox className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span>Uncategorized</span>
            <CountBadge value={categoryCounts.uncategorized} active={selectedCategoryId === UNCATEGORIZED_ID} />
          </button>
        )}

        {categories
          .filter((cat) => (categoryCounts.counts[cat.id] ?? 0) > 0)
          .map((cat) => {
            const count = categoryCounts.counts[cat.id] ?? 0;
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(isSelected ? null : cat.id)}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                  isSelected
                    ? 'text-white shadow-md'
                    : 'text-slate-400 bg-slate-950/60 hover:text-slate-200'
                }`}
                style={{
                  borderColor: isSelected ? cat.color_hex : 'rgba(255,255,255,0.08)',
                  backgroundColor: isSelected ? `${cat.color_hex}25` : undefined,
                }}
              >
                <span
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full"
                  style={{ backgroundColor: cat.color_hex }}
                />
                <span>{cat.name}</span>
                <CountBadge value={count} active={isSelected} />
              </button>
            );
          })}
      </div>
    </div>
  );
}
