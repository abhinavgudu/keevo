'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Category, ContentItem, VaultStats, SaveItemInput } from '@/types/vault';
import { VaultStorage } from '@/lib/storage';
import type { CategoryCounts } from '@/lib/storage';
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
import { TranscriptViewerModal } from '@/components/modals/TranscriptViewerModal';
import { CategoryManagerModal } from '@/components/modals/CategoryManagerModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ReelsDeckModal } from '@/components/modals/ReelsDeckModal';
import { CommandPalette } from '@/components/CommandPalette';
import { GlobalDropzone } from '@/components/GlobalDropzone';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { Footer } from '@/components/Footer';
import { ExitConfirmPopup } from '@/components/ExitConfirmPopup';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { useMobileBackHandler } from '@/hooks/useMobileBackHandler';
import { searchItemsWithMatches } from '@/lib/vaultSearch';
import { LoadingCircle } from '@/components/LoadingCircle';
import { Plus, BookmarkCheck, Compass } from 'lucide-react';

export default function KeevaDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCounts>({
    counts: {},
    total: 0,
    uncategorized: 0,
  });
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isItemsLoading, setIsItemsLoading] = useState(false);
  const [isSupabaseActive, setIsSupabaseActive] = useState(false);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<FilterMediaType>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('NEWEST');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isReelsDeckOpen, setIsReelsDeckOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [activePdfItem, setActivePdfItem] = useState<ContentItem | null>(null);
  const [activeMediaItem, setActiveMediaItem] = useState<ContentItem | null>(null);
  const [activeTranscriptItem, setActiveTranscriptItem] = useState<ContentItem | null>(null);

  // Exit confirmation popup
  const [showExitPopup, setShowExitPopup] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Categories, per-category counts and the metrics banner. These describe the
  // whole vault and must stay unfiltered — the pill row needs every count in
  // order to decide which pills to show.
  const loadVaultMeta = useCallback(async () => {
    try {
      const [loadedCategories, loadedCounts, loadedStats] = await Promise.all([
        VaultStorage.getCategories(),
        VaultStorage.getCategoryCounts(),
        VaultStorage.getStats(),
      ]);
      setCategories(loadedCategories);
      setCategoryCounts(loadedCounts);
      setStats(loadedStats);
      setIsSupabaseActive(isSupabaseConfigured());
    } catch (err) {
      console.error('Error loading vault data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Only the rows the current category/media filters allow are fetched. Search
  // is deliberately NOT applied here: it runs client-side (see vaultSearch) so
  // every keystroke filters instantly instead of waiting on a round trip.
  const loadItems = useCallback(async () => {
    setIsItemsLoading(true);
    try {
      const loaded = await VaultStorage.getItems({
        categoryId: selectedCategoryId,
        mediaType: selectedMediaType,
      });
      setItems(loaded);
    } catch (err) {
      console.error('Error loading filtered items:', err);
      setItems([]);
    } finally {
      setIsItemsLoading(false);
    }
  }, [selectedCategoryId, selectedMediaType]);

  const loadVaultData = useCallback(async () => {
    await Promise.all([loadVaultMeta(), loadItems()]);
  }, [loadVaultMeta, loadItems]);

  // Auth guard — redirect unauthenticated users to /auth/signin
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin');
    }
  }, [authLoading, user, router]);

  // Single fetch effect. loadItems changes identity on every filter change, so
  // this re-queries the list when a filter moves; the vault-wide metadata
  // (categories, counts, metrics) is filter-independent and is reloaded only when
  // the signed-in user actually changes.
  const metaLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;

    if (metaLoadedFor.current !== user.id) {
      metaLoadedFor.current = user.id;
      loadVaultMeta();
    }
    loadItems();

    // Check if redirected from share target or saved param
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('saved') === 'true') {
        showToast('Content captured & saved into Keeva!');
        window.history.replaceState({}, '', '/');
      }
    }
  }, [loadItems, loadVaultMeta, user]);

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

  // Category and media type are resolved in the query (see loadItems). Search runs
  // here instead, so results appear on the same keystroke with no network wait,
  // and relevance — not created_at — decides the order while a search is active.
  const filteredItems = useMemo(() => {
    const hasQuery = searchQuery.trim().length > 0;

    const bySort = (a: ContentItem, b: ContentItem) => {
      if (sortBy === 'PRIORITY_DESC') return b.priority_score - a.priority_score;
      if (sortBy === 'ACCESS_COUNT') return (b.access_count || 0) - (a.access_count || 0);
      if (sortBy === 'TITLE_ASC') return a.title.localeCompare(b.title);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };

    // MUST_LEARN is narrowed server-side on the stored priority_score, but the
    // score rendered on each card is recalculated in JS (uncapped access bonus
    // plus time decay), so the two can disagree. Re-check against the value the
    // user actually sees, otherwise this tab would show cards scored under 100.
    const matchesMustLearn = (item: ContentItem) =>
      selectedMediaType !== 'MUST_LEARN' ||
      item.priority === 'MUST_LEARN' ||
      item.priority_score >= 100;

    // With no query the list is just the fetched rows in the chosen order.
    if (!hasQuery) return items.filter(matchesMustLearn).sort(bySort);

    // Relevance decides the order; the sort choice only breaks ties. Sorting by
    // date outright is what used to push an exact title match below an
    // incidental description hit.
    const scored = searchItemsWithMatches(items, searchQuery).filter((s) => matchesMustLearn(s.item));
    return scored
      .sort((a, b) => b.score - a.score || bySort(a.item, b.item))
      .map((s) => s.item);
  }, [items, searchQuery, selectedMediaType, sortBy]);

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
      // Re-favourite changes which rows the active filters match (the Favorites
      // tab in particular) and shifts the priority score, so re-query instead of
      // trusting the local patch.
      await Promise.all([loadItems(), loadVaultMeta()]);
      showToast(updated.is_favorite ? 'Added to Favorites (+30 score bonus)' : 'Removed from Favorites');
    }
  };

  const handleDeleteItem = async (id: string) => {
    await VaultStorage.deleteItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    await Promise.all([loadItems(), loadVaultMeta()]);
    showToast('Item deleted from Vault');
  };

  const handleSaveItem = async (itemPayload: SaveItemInput) => {
    const saved = await VaultStorage.saveItem(itemPayload);
    // A save can create a category (and therefore a new pill) and can land
    // outside the active filter, so both the list and the meta are refreshed.
    await Promise.all([loadItems(), loadVaultMeta()]);
    showToast(`Saved "${saved.title.slice(0, 28)}..." to Vault!`);
  };

  const handleUpdateNotes = async (id: string, notes: string) => {
    const current = items.find((i) => i.id === id);
    if (!current) return;
    const saved = await VaultStorage.saveItem({ ...current, notes });
    setItems((prev) => prev.map((i) => (i.id === id ? saved : i)));
  };

  const handleItemUpdated = (updated: ContentItem) => {
    // A share/remove inside the preview writes straight to Supabase. Mirror it
    // into the vault list so reopening the post shows "Public in Community"
    // instead of stale "Share to Community".
    setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
    if (activeMediaItem && activeMediaItem.id === updated.id) {
      setActiveMediaItem(updated);
    }
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
    // The FK is ON DELETE SET NULL, so the deleted category's posts reappear
    // under Uncategorized and the counts move.
    await Promise.all([loadItems(), loadVaultMeta()]);
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
      await Promise.all([loadItems(), loadVaultMeta()]);
      showToast('Vault cleared');
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategoryId(null);
    setSelectedMediaType('ALL');
    setSortBy('NEWEST');
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasActiveFilters = Boolean(
    searchQuery || selectedCategoryId !== null || selectedMediaType !== 'ALL' || sortBy !== 'NEWEST'
  );

  // Close any top-most open modal (for back button handling)
  const closeTopModal = useCallback(() => {
    if (isCommandPaletteOpen) { setIsCommandPaletteOpen(false); return; }
    if (isSettingsModalOpen) { setIsSettingsModalOpen(false); return; }
    if (isReelsDeckOpen) { setIsReelsDeckOpen(false); return; }
    if (isCategoryModalOpen) { setIsCategoryModalOpen(false); return; }
    if (activeTranscriptItem) { setActiveTranscriptItem(null); return; }
    if (activeMediaItem) { setActiveMediaItem(null); return; }
    if (activePdfItem) { setActivePdfItem(null); return; }
    if (isAddModalOpen) { setIsAddModalOpen(false); return; }
  }, [isCommandPaletteOpen, isSettingsModalOpen, isReelsDeckOpen, isCategoryModalOpen, activeTranscriptItem, activeMediaItem, activePdfItem, isAddModalOpen]);

  const hasAnyModalOpen = isAddModalOpen || isCategoryModalOpen || isSettingsModalOpen ||
    isReelsDeckOpen || isCommandPaletteOpen || !!activePdfItem || !!activeMediaItem ||
    !!activeTranscriptItem;

  // Mobile back button handler
  useMobileBackHandler({
    hasOpenModal: hasAnyModalOpen,
    hasActiveFilters,
    closeModal: closeTopModal,
    resetFilters: handleResetFilters,
    onExitRequest: () => setShowExitPopup(true),
  });

  // Show loading spinner while auth is being checked
  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-[#06070B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <LoadingCircle className="w-12 h-12" label="Loading Keeva" />
          <p className="text-xs text-slate-500 font-mono">Loading Keeva...</p>
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

      {/* Dashboard Body - Fluid 100% responsive width on large displays */}
      <main className="flex-1 w-full max-w-[98%] 2xl:max-w-[96%] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 relative z-10">
        {/* Omni-Capture Quick Ingestion Hero Bar */}
        <QuickAddBar
          onSaveItem={handleSaveItem}
          onOpenPdfModal={() => setIsAddModalOpen(true)}
          categories={categories}
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
          categoryCounts={categoryCounts}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
          selectedMediaType={selectedMediaType}
          onSelectMediaType={setSelectedMediaType}
          sortBy={sortBy}
          onSelectSortBy={setSortBy}
          totalCount={categoryCounts.total}
          filteredCount={filteredItems.length}
          isLoading={isItemsLoading}
          onReset={handleResetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="w-full py-32 flex flex-col items-center justify-center">
            <LoadingCircle className="w-10 h-10 mb-4" />
            <p className="text-xs text-slate-400 font-mono">Loading Keeva OS...</p>
          </div>
        ) : categoryCounts.total === 0 ? (
          /* Clean Empty State — the true "no posts at all" case. A filter that
             matches nothing is handled by MasonryGrid, which offers a reset. */
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

      {/* PWA Smart Install Prompt */}
      <PwaInstallPrompt />

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
        onItemUpdated={handleItemUpdated}
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

      <TranscriptViewerModal
        item={activeTranscriptItem}
        isOpen={!!activeTranscriptItem}
        onClose={() => setActiveTranscriptItem(null)}
      />

      {/* Mobile Exit Confirmation Popup */}
      <ExitConfirmPopup
        isOpen={showExitPopup}
        onStay={() => setShowExitPopup(false)}
        onExit={() => {
          setShowExitPopup(false);
          // Actually exit: navigate back in history
          window.history.go(-1);
        }}
      />
    </div>
  );
}
