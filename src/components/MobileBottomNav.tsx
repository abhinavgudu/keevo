'use client';

import React from 'react';
import { Home, Film, Plus, Folder, Globe } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCommunityUnread } from '@/hooks/useCommunityUnread';

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
  onScrollToTop,
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const { unreadCount, markAsRead } = useCommunityUnread();

  // Show bottom nav on vault and community pages
  if (pathname !== '/' && pathname !== '/community') return null;

  const navItemCls = (active?: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-[9px] font-semibold active:scale-95 transition-transform cursor-pointer ${
      active ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
    }`;

  const isVault = pathname === '/';
  const isCommunity = pathname === '/community';

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#06070B]/95 border-t border-slate-800/90 backdrop-blur-2xl flex items-center justify-around pb-[env(safe-area-inset-bottom)] shadow-2xl h-[56px]">
      {/* 1. Vault */}
      <button type="button" onClick={onScrollToTop} className={navItemCls(isVault)}>
        <Home className="w-[18px] h-[18px]" />
        <span>Vault</span>
      </button>

      {/* 2. Reels */}
      <button type="button" onClick={onOpenReelsDeck} className={navItemCls()}>
        <Film className="w-[18px] h-[18px] text-indigo-400" />
        <span>Reels</span>
      </button>

      {/* 3. Center Add Button */}
      <button
        type="button"
        onClick={onOpenAddModal}
        className="flex flex-col items-center justify-center flex-1 -mt-5 cursor-pointer active:scale-90 transition-transform"
        title="Add Content"
      >
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-fuchsia-600 flex items-center justify-center text-white shadow-xl shadow-cyan-500/40 border-2 border-white/25">
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </div>
      </button>

      {/* 4. Community */}
      <Link href="/community" onClick={markAsRead} className={navItemCls(isCommunity)}>
        <div className="relative">
          <Globe className="w-[18px] h-[18px] text-emerald-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-2.5 flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[8px] font-black shadow-md border border-[#06070B] animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <span>Community</span>
      </Link>

      {/* 5. Categories */}
      <button type="button" onClick={onOpenCategoryModal} className={navItemCls()}>
        <Folder className="w-[18px] h-[18px]" />
        <span>Categories</span>
      </button>
    </nav>
  );
}
