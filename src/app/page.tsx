'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Category, ContentItem, VaultStats } from '@/types/vault';
import { VaultStorage } from '@/lib/storage';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/Header';
import { QuickAddBar } from '@/components/QuickAddBar';
import { MetricsBar } from '@/components/MetricsBar';
import { FilterBar, FilterMediaType, SortOption } from '@/components/FilterBar';
import { MasonryGrid } from '@/components/MasonryGrid';
import { AddItemModal } from '@/components/modals/AddItemModal';
import { PdfViewerModal } from '@/components/modals/PdfViewerModal';
import { MediaPreviewModal } from '@/components/modals/MediaPreviewModal';
import { CategoryManagerModal } from '@/components/modals/CategoryManagerModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ReelsDeckModal } from '@/components/modals/ReelsDeckModal';
import { CommandPalette } from '@/components/CommandPalette';
import { GlobalDropzone } from '@/components/GlobalDropzone';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Footer } from '@/components/Footer';
import { Plus, Loader2, BookmarkCheck, Compass } from 'lucide-react';

export default function VaultXDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupabaseActive, setIsSupabaseActive] = useState(false);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<FilterMediaType>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('PRIORITY_DESC');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isReelsDeckOpen, setIsReelsDeckOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [activePdfItem, setActivePdfItem] = useState<ContentItem | null>(null);
  const [activeMediaItem, setActiveMediaItem] = useState<ContentItem | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadVaultData = useCallback(async () => {
    try {
      const [loadedCategories, loadedItems, loadedStats] = await Promise.all([
        VaultStorage.getCategories(),
        VaultStorage.getItems(),
        VaultStorage.getStats(),
      ]);
      setCategories(loadedCategories);
      setItems(loadedItems);
      setStats(loadedStats);
      setIsSupabaseActive(isSupabaseConfigured());
    } catch (err) {
      console.error('Error loading vault data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auth guard — redirect unauthenticated users to /auth/signin
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) {
      loadVaultData();
    }

    // Check if redirected from share target or saved param
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('saved') === 'true') {
        showToast('Content captured & saved into Keevo!');
        window.history.replaceState({}, '', '/');
      }
    }
  }, [loadVaultData, user]);

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Real-time sub-millisecond filtering with useMemo
  const filteredItems = useMemo(() => {
    let result = [...items];

    // 1. Text Search Filter (Title, Description, Platform, Tags, Notes)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((item) => {
        const titleMatch = item.title.toLowerCase().includes(q);
        const descMatch = item.description?.toLowerCase().includes(q);
        const platformMatch = item.platform.toLowerCase().includes(q);
        const tagsMatch = item.tags?.some((t) => t.toLowerCase().includes(q));
        const notesMatch = item.notes?.toLowerCase().includes(q);
        return titleMatch || descMatch || platformMatch || tagsMatch || notesMatch;
      });
    }

    // 2. Category Filter
    if (selectedCategoryId) {
      result = result.filter((item) => item.category_id === selectedCategoryId);
    }

    // 3. Media Type / Preset Filter
    if (selectedMediaType === 'MUST_LEARN') {
      result = result.filter((item) => item.priority === 'MUST_LEARN' || item.priority_score >= 100);
    } else if (selectedMediaType === 'REEL') {
      result = result.filter((item) => item.aspect_ratio === 'PORTRAIT_9_16' || item.media_type === 'REEL');
    } else if (selectedMediaType === 'LANDSCAPE') {
      result = result.filter((item) => item.aspect_ratio === 'LANDSCAPE_16_9');
    } else if (selectedMediaType === 'PDF') {
      result = result.filter((item) => item.media_type === 'DOCUMENT' || item.aspect_ratio === 'STANDARD_DOCUMENT');
    } else if (selectedMediaType === 'FAVORITES') {
      result = result.filter((item) => item.is_favorite);
    }

    // 4. Sorting
    result.sort((a, b) => {
      if (sortBy === 'PRIORITY_DESC') {
        return b.priority_score - a.priority_score;
      }
      if (sortBy === 'NEWEST') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'ACCESS_COUNT') {
        return (b.access_count || 0) - (a.access_count || 0);
      }
      if (sortBy === 'TITLE_ASC') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return result;
  }, [items, searchQuery, selectedCategoryId, selectedMediaType, sortBy]);

  // Actions
  const handleOpenPdf = async (item: ContentItem) => {
    setActivePdfItem(item);
    const updated = await VaultStorage.incrementAccess(item.id);
    if (updated) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      VaultStorage.getStats().then(setStats);
    }
  };

  const handleOpenPreview = async (item: ContentItem) => {
    setActiveMediaItem(item);
    const updated = await VaultStorage.incrementAccess(item.id);
    if (updated) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      VaultStorage.getStats().then(setStats);
    }
  };

  const handleIncrementAccess = async (id: string) => {
    const updated = await VaultStorage.incrementAccess(id);
    if (updated) {
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      VaultStorage.getStats().then(setStats);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    const updated = await VaultStorage.toggleFavorite(id);
    if (updated) {
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      if (activeMediaItem && activeMediaItem.id === id) {
        setActiveMediaItem(updated);
      }
      if (activePdfItem && activePdfItem.id === id) {
        setActivePdfItem(updated);
      }
      VaultStorage.getStats().then(setStats);
      showToast(updated.is_favorite ? 'Added to Favorites (+30 score bonus)' : 'Removed from Favorites');
    }
  };

  const handleDeleteItem = async (id: string) => {
    await VaultStorage.deleteItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    VaultStorage.getStats().then(setStats);
    showToast('Item deleted from Vault');
  };

  const handleSaveItem = async (itemPayload: Partial<ContentItem> & { title: string; source_url: string }) => {
    const saved = await VaultStorage.saveItem(itemPayload);
    setItems((prev) => [saved, ...prev.filter((i) => i.id !== saved.id)]);
    VaultStorage.getStats().then(setStats);
    showToast(`Saved "${saved.title.slice(0, 28)}..." to Vault!`);
  };

  const handleUpdateNotes = async (id: string, notes: string) => {
    const current = items.find((i) => i.id === id);
    if (!current) return;
    const saved = await VaultStorage.saveItem({ ...current, notes });
    setItems((prev) => prev.map((i) => (i.id === id ? saved : i)));
  };

  const handleSaveCategory = async (cat: { name: string; color_hex: string }) => {
    const newCat = await VaultStorage.saveCategory(cat);
    setCategories((prev) => [...prev.filter((c) => c.id !== newCat.id), newCat]);
    showToast(`Category "${newCat.name}" created`);
  };

  const handleDeleteCategory = async (id: string) => {
    await VaultStorage.deleteCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    if (selectedCategoryId === id) setSelectedCategoryId(null);
    showToast('Category removed');
  };

  const handleExportData = async () => {
    const data = await VaultStorage.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaultx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Vault backup JSON exported');
  };

  const handleClearAll = async () => {
    if (confirm('Are you sure you want to clear all vault content items?')) {
      await VaultStorage.clearAllItems();
      setItems([]);
      VaultStorage.getStats().then(setStats);
      showToast('Vault cleared');
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategoryId(null);
    setSelectedMediaType('ALL');
    setSortBy('PRIORITY_DESC');
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasActiveFilters = Boolean(
    searchQuery || selectedCategoryId !== null || selectedMediaType !== 'ALL' || sortBy !== 'PRIORITY_DESC'
  );

  // Show loading spinner while auth is being checked
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-[#06070B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-600 p-[1.5px] shadow-2xl shadow-cyan-500/30 animate-pulse">
            <div className="w-full h-full bg-[#06070B] rounded-[14px] flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-7 h-7" fill="none">
                <defs>
                  <linearGradient id="lkg1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00E5FF"/>
                    <stop offset="50%" stopColor="#6366F1"/>
                    <stop offset="100%" stopColor="#D946EF"/>
                  </linearGradient>
                </defs>
                <rect x="26" y="22" width="11" height="56" rx="3" fill="url(#lkg1)"/>
                <path d="M37 50 L68 22 L78 22 L47 50Z" fill="url(#lkg1)" opacity="0.95"/>
                <path d="M37 50 L68 78 L78 78 L47 50Z" fill="url(#lkg1)" opacity="0.95"/>
                <circle cx="44" cy="50" r="4" fill="#00E5FF" opacity="0.9"/>
              </svg>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-mono">Loading Keevo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col relative pb-20 md:pb-6">
      {/* Global Drag and Drop Engine */}
      <GlobalDropzone onSaveItem={handleSaveItem} showToast={showToast} />

      {/* Ambient Glows */}
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Main Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenReelsDeck={() => setIsReelsDeckOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        stats={stats}
        isSupabaseActive={isSupabaseActive}
      />

      {/* Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 relative z-10">
        {/* Omni-Capture Quick Ingestion Hero Bar */}
        <QuickAddBar
          onSaveItem={handleSaveItem}
          onOpenPdfModal={() => setIsAddModalOpen(true)}
        />

        {/* Metric Stats Banner */}
        <MetricsBar
          stats={stats}
          onFilterMustLearn={() => setSelectedMediaType('MUST_LEARN')}
          onFilterReels={() => setSelectedMediaType('REEL')}
          onFilterPdfs={() => setSelectedMediaType('PDF')}
          onFilterFavorites={() => setSelectedMediaType('FAVORITES')}
        />

        {/* Filter & Sorting Toolbar */}
        <FilterBar
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
          selectedMediaType={selectedMediaType}
          onSelectMediaType={setSelectedMediaType}
          sortBy={sortBy}
          onSelectSortBy={setSortBy}
          totalCount={items.length}
          filteredCount={filteredItems.length}
          onReset={handleResetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="w-full py-32 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
            <p className="text-xs text-slate-400 font-mono">Loading VaultX OS...</p>
          </div>
        ) : items.length === 0 ? (
          /* Clean Empty State */
          <div className="w-full py-16 flex flex-col items-center justify-center text-center px-4">
            <div className="w-18 h-18 rounded-3xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-cyan-400 mb-4 shadow-2xl">
              <Compass className="w-9 h-9 animate-pulse" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1.5">Your Vault is Ready & Clean</h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-5 leading-relaxed">
              Paste any Instagram Reel, YouTube Shorts/Video, LinkedIn post, or drop any document file above.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add First Content
            </button>
          </div>
        ) : (
          /* Masonry Grid */
          <MasonryGrid
            items={filteredItems}
            onOpenPreview={handleOpenPreview}
            onOpenPdf={handleOpenPdf}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleDeleteItem}
            onTagClick={(tag) => setSearchQuery(tag)}
            onResetFilters={handleResetFilters}
          />
        )}
      </main>

      {/* Footer */}
      <div className="hidden md:block">
        <Footer />
      </div>

      {/* Mobile Native Bottom Navigation Bar */}
      <MobileBottomNav
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenReelsDeck={() => setIsReelsDeckOpen(true)}
        onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onScrollToTop={scrollToTop}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900/95 border border-cyan-500/40 text-cyan-200 text-xs font-semibold shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5">
          <BookmarkCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <AddItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        categories={categories}
        onSave={handleSaveItem}
      />

      <PdfViewerModal
        isOpen={Boolean(activePdfItem)}
        item={activePdfItem}
        onClose={() => setActivePdfItem(null)}
        onToggleFavorite={handleToggleFavorite}
      />

      <MediaPreviewModal
        isOpen={Boolean(activeMediaItem)}
        item={activeMediaItem}
        onClose={() => setActiveMediaItem(null)}
        onToggleFavorite={handleToggleFavorite}
        onUpdateNotes={handleUpdateNotes}
      />

      <ReelsDeckModal
        isOpen={isReelsDeckOpen}
        onClose={() => setIsReelsDeckOpen(false)}
        items={items}
        onToggleFavorite={handleToggleFavorite}
        onUpdateNotes={handleUpdateNotes}
        onSaveItem={handleSaveItem}
        onIncrementAccess={handleIncrementAccess}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        items={items}
        categories={categories}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenReelsDeck={() => setIsReelsDeckOpen(true)}
        onOpenPdfModal={() => setIsAddModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onSelectCategory={setSelectedCategoryId}
        onSelectMediaType={setSelectedMediaType}
        onOpenPreview={handleOpenPreview}
        onOpenPdf={handleOpenPdf}
        onExportData={handleExportData}
        onClearAll={handleClearAll}
      />

      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onSaveCategory={handleSaveCategory}
        onDeleteCategory={handleDeleteCategory}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onDataChanged={loadVaultData}
      />
    </div>
  );
}
