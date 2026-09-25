'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, Plus, Settings2, FolderPlus, Film, Command, LogOut, ShieldAlert, ChevronDown, Database, Globe } from 'lucide-react';
import { VaultStats } from '@/types/vault';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityUnread } from '@/hooks/useCommunityUnread';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenAddModal: () => void;
  onOpenCategoryModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenReelsDeck: () => void;
  onOpenCommandPalette: () => void;
  stats: VaultStats | null;
  isSupabaseActive: boolean;
}

/** Keeva inline logo mark */
function KeevaMark({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/keeva-logo.svg"
      alt="Keeva Logo"
      width={size}
      height={size}
      className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]"
    />
  );
}

export function Header({
  searchQuery,
  onSearchChange,
  onOpenAddModal,
  onOpenCategoryModal,
  onOpenSettingsModal,
  onOpenReelsDeck,
  onOpenCommandPalette,
  stats,
  isSupabaseActive,
}: HeaderProps) {
  const { user, signOut } = useAuth();
  const { unreadCount, markAsRead } = useCommunityUnread();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? 'K';
  const shortEmail = user?.email ? (user.email.length > 22 ? user.email.slice(0, 20) + '…' : user.email) : '';

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between gap-3">

        {/* Brand & Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-600 p-[1.5px] shadow-lg shadow-cyan-500/25">
            <div className="w-full h-full bg-[#06070B] rounded-[14px] flex items-center justify-center">
              <KeevaMark size={20} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-lg sm:text-xl font-black tracking-tight text-white">
                Keeva
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase font-mono px-1.5 sm:px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold">
                2.0
              </span>
            </div>
            <div className="items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 hidden sm:flex font-mono">
              <span>Media Intelligence OS</span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3 text-cyan-400" />
                {isSupabaseActive ? (
                  <span className="text-emerald-400 font-medium">Supabase Cloud</span>
                ) : (
                  <span className="text-cyan-300 font-medium">Local Engine</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Live Search Bar (Desktop) */}
        <div className="flex-1 max-w-lg relative hidden md:block">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search reels, articles, PDFs, tags..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-10 pr-20 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition-all"
            />
            <button
              onClick={onOpenCommandPalette}
              className="absolute right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Command Palette (Cmd+K)"
            >
              <Command className="w-3 h-3" />
              <span>K</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile Search button */}
          <button
            onClick={onOpenCommandPalette}
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Search (Cmd+K)"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Reels Deck Trigger */}
          <button
            onClick={onOpenReelsDeck}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-all cursor-pointer shadow-md hover:scale-105 active:scale-95"
            title="Launch Reels Deck"
          >
            <Film className="w-4 h-4 text-indigo-400" />
            <span>Reels</span>
          </button>

          {/* Community Link - Desktop only */}
          <Link
            href="/community"
            onClick={markAsRead}
            className="relative hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all cursor-pointer shadow-md hover:scale-105 active:scale-95"
            title="Community Feed"
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Community</span>
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] font-black shadow-lg shadow-rose-500/40 border-2 border-[#06070B] animate-bounce">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          {/* Category Manager */}
          <button
            onClick={onOpenCategoryModal}
            className="hidden sm:flex p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Manage Categories"
          >
            <FolderPlus className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettingsModal}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Keeva Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {/* Add Content Button */}
          <button
            onClick={onOpenAddModal}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-semibold text-xs shadow-lg shadow-cyan-500/25 active:scale-95 transition-all border border-white/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>

          {/* User Avatar / Dropdown */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((p) => !p)}
                className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group"
                title="Account"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white text-xs font-black shadow-md">
                  {avatarLetter}
                </div>
                <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors hidden sm:block" />
              </button>

              {showUserMenu && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  {/* Dropdown */}
                  <div className="absolute right-0 mt-2 w-56 bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center text-white text-sm font-black shadow-md shrink-0">
                          {avatarLetter}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{shortEmail}</div>
                          <div className="text-[10px] text-emerald-400 font-mono">● Active</div>
                        </div>
                      </div>
                    </div>
                    <div className="p-1.5 space-y-0.5">
                      {/* Admin Panel — only for admin */}
                      {user?.email === 'miabhisu@gmail.com' && (
                        <Link
                          href="/admin"
                          onClick={() => setShowUserMenu(false)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-fuchsia-300 hover:text-fuchsia-200 hover:bg-fuchsia-500/10 transition-all text-sm cursor-pointer group"
                        >
                          <ShieldAlert className="w-4 h-4" />
                          <span className="font-medium">Admin Panel</span>
                        </Link>
                      )}
                      <button
                        onClick={() => { setShowUserMenu(false); signOut(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-300 hover:text-red-300 hover:bg-red-500/10 transition-all text-sm cursor-pointer group"
                      >
                        <LogOut className="w-4 h-4 group-hover:text-red-400 transition-colors" />
                        <span className="font-medium">Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
