'use client';

import React from 'react';
import { Home, Film, Plus, Folder, Search, Globe } from 'lucide-react';
import Link from 'next/link';

interface MobileBottomNavProps {
  onOpenAddModal: () => void;
  onOpenReelsDeck: () => void;
  onOpenCategoryModal: () => void;
  onOpenCommandPalette: () => void;
  onScrollToTop: () => void;
}

export function MobileBottomNav({
  onOpenAddModal,
  onOpenReelsDeck,
  onOpenCategoryModal,
  onOpenCommandPalette,
  onScrollToTop,
}: MobileBottomNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#06070B]/95 border-t border-slate-800/90 backdrop-blur-2xl px-2 py-2 flex items-center justify-around text-slate-400 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl">
      {/* 1. Vault Feed */}
      <button
        type="button"
        onClick={onScrollToTop}
        className="flex flex-col items-center justify-center gap-1 w-14 py-1 text-[10px] font-semibold text-cyan-400 active:scale-95 transition-transform cursor-pointer"
      >
        <div className="p-1 rounded-lg bg-cyan-500/10">
          <Home className="w-4 h-4 text-cyan-400" />
        </div>
        <span>Vault</span>
      </button>

      {/* 2. Reels Deck */}
      <button
        type="button"
        onClick={onOpenReelsDeck}
        className="flex flex-col items-center justify-center gap-1 w-14 py-1 text-[10px] font-semibold text-slate-400 hover:text-white active:scale-95 transition-transform cursor-pointer"
      >
        <div className="p-1 rounded-lg hover:bg-slate-800">
          <Film className="w-4 h-4 text-indigo-400" />
        </div>
        <span>Reels</span>
      </button>

      {/* 3. Center Fast Add Button */}
      <button
        type="button"
        onClick={onOpenAddModal}
        className="flex flex-col items-center justify-center -mt-6 cursor-pointer active:scale-90 transition-transform"
        title="Add Content"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-fuchsia-600 flex items-center justify-center text-white shadow-xl shadow-cyan-500/40 border-2 border-white/25">
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </div>
      </button>

      {/* 4. Categories */}
      <button
        type="button"
        onClick={onOpenCategoryModal}
        className="flex flex-col items-center justify-center gap-1 w-14 py-1 text-[10px] font-semibold text-slate-400 hover:text-white active:scale-95 transition-transform cursor-pointer"
      >
        <div className="p-1 rounded-lg hover:bg-slate-800">
          <Folder className="w-4 h-4" />
        </div>
        <span>Categories</span>
      </button>

      {/* 5. Community */}
      <Link
        href="/community"
        className="flex flex-col items-center justify-center gap-1 w-14 py-1 text-[10px] font-semibold text-slate-400 hover:text-white active:scale-95 transition-transform cursor-pointer"
      >
        <div className="p-1 rounded-lg hover:bg-slate-800">
          <Globe className="w-4 h-4 text-emerald-400" />
        </div>
        <span>Community</span>
      </Link>

      {/* 5. Search / Omnibar */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="flex flex-col items-center justify-center gap-1 w-14 py-1 text-[10px] font-semibold text-slate-400 hover:text-white active:scale-95 transition-transform cursor-pointer"
      >
        <div className="p-1 rounded-lg hover:bg-slate-800">
          <Search className="w-4 h-4 text-cyan-400" />
        </div>
        <span>Search</span>
      </button>
    </nav>
  );
}
