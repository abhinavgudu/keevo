'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ContentItem, Category } from '@/types/vault';
import {
  Search,
  Plus,
  FileText,
  Film,
  Flame,
  Heart,
  Settings,
  Download,
  Trash2,
  Folder,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Command,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: ContentItem[];
  categories: Category[];
  onOpenAddModal: () => void;
  onOpenReelsDeck: () => void;
  onOpenPdfModal: () => void;
  onOpenSettingsModal: () => void;
  onSelectCategory: (id: string | null) => void;
  onSelectMediaType: (type: any) => void;
  onOpenPreview: (item: ContentItem) => void;
  onOpenPdf: (item: ContentItem) => void;
  onExportData: () => void;
  onClearAll: () => void;
}

interface ActionItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  category: 'Actions' | 'Filters' | 'Content Items';
  perform: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  items,
  categories,
  onOpenAddModal,
  onOpenReelsDeck,
  onOpenPdfModal,
  onOpenSettingsModal,
  onSelectCategory,
  onSelectMediaType,
  onOpenPreview,
  onOpenPdf,
  onExportData,
  onClearAll,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build searchable action list
  const allActions: ActionItem[] = useMemo(() => {
    const defaultActions: ActionItem[] = [
      {
        id: 'action-add',
        title: 'Add New Content / Scrape Link',
        subtitle: 'Auto-detect Instagram Reel, YouTube, LinkedIn, or Web URL',
        icon: <Plus className="w-4 h-4 text-cyan-400" />,
        category: 'Actions',
        perform: () => {
          onClose();
          onOpenAddModal();
        },
      },
      {
        id: 'action-reels-deck',
        title: 'Launch Reels Deck / TikTok Mode',
        subtitle: 'Fullscreen vertical swipeable feed for saved 9:16 reels',
        icon: <Film className="w-4 h-4 text-indigo-400" />,
        category: 'Actions',
        perform: () => {
          onClose();
          onOpenReelsDeck();
        },
      },
      {
        id: 'action-upload-pdf',
        title: 'Upload PDF Document',
        subtitle: 'Upload whitepaper, study notes, or slides to object storage',
        icon: <FileText className="w-4 h-4 text-rose-400" />,
        category: 'Actions',
        perform: () => {
          onClose();
          onOpenPdfModal();
        },
      },
      {
        id: 'filter-must-learn',
        title: 'Filter: Must Learn Content (Score 100+)',
        subtitle: 'Show high-priority learning items',
        icon: <Flame className="w-4 h-4 text-amber-400" />,
        category: 'Filters',
        perform: () => {
          onClose();
          onSelectMediaType('MUST_LEARN');
        },
      },
      {
        id: 'filter-reels',
        title: 'Filter: Reels (9:16 Portrait)',
        subtitle: 'Show Instagram Reels and Shorts',
        icon: <Film className="w-4 h-4 text-cyan-400" />,
        category: 'Filters',
        perform: () => {
          onClose();
          onSelectMediaType('REEL');
        },
      },
      {
        id: 'filter-pdfs',
        title: 'Filter: PDF Documents',
        subtitle: 'Show all uploaded PDFs and whitepapers',
        icon: <FileText className="w-4 h-4 text-rose-400" />,
        category: 'Filters',
        perform: () => {
          onClose();
          onSelectMediaType('PDF');
        },
      },
      {
        id: 'filter-favs',
        title: 'Filter: Favorites',
        subtitle: 'Show starred content items',
        icon: <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />,
        category: 'Filters',
        perform: () => {
          onClose();
          onSelectMediaType('FAVORITES');
        },
      },
      {
        id: 'action-settings',
        title: 'System Settings & Supabase Cloud DB',
        subtitle: 'Configure PostgreSQL sync, SQL triggers, and export',
        icon: <Settings className="w-4 h-4 text-slate-400" />,
        category: 'Actions',
        perform: () => {
          onClose();
          onOpenSettingsModal();
        },
      },
      {
        id: 'action-export',
        title: 'Export Vault Backup JSON',
        subtitle: 'Download complete state backup',
        icon: <Download className="w-4 h-4 text-emerald-400" />,
        category: 'Actions',
        perform: () => {
          onClose();
          onExportData();
        },
      },
      {
        id: 'action-clear',
        title: 'Clear All Vault Items',
        subtitle: 'Remove all saved items to start fresh',
        icon: <Trash2 className="w-4 h-4 text-rose-400" />,
        category: 'Actions',
        perform: () => {
          onClose();
          onClearAll();
        },
      },
    ];

    // Add Categories
    const categoryActions: ActionItem[] = categories.map((cat) => ({
      id: `cat-${cat.id}`,
      title: `Category: ${cat.name}`,
      subtitle: `Filter vault items by ${cat.name}`,
      icon: (
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: cat.color_hex }}
        />
      ),
      category: 'Filters',
      perform: () => {
        onClose();
        onSelectCategory(cat.id);
      },
    }));

    // Add Content Items (top 15)
    const contentActions: ActionItem[] = items.slice(0, 15).map((item) => ({
      id: `item-${item.id}`,
      title: item.title,
      subtitle: `${item.platform} • Priority Score: ${item.priority_score}`,
      icon:
        item.media_type === 'DOCUMENT' ? (
          <FileText className="w-4 h-4 text-rose-400" />
        ) : item.aspect_ratio === 'PORTRAIT_9_16' ? (
          <Film className="w-4 h-4 text-cyan-400" />
        ) : (
          <ExternalLink className="w-4 h-4 text-blue-400" />
        ),
      category: 'Content Items',
      perform: () => {
        onClose();
        if (item.media_type === 'DOCUMENT') {
          onOpenPdf(item);
        } else {
          onOpenPreview(item);
        }
      },
    }));

    return [...defaultActions, ...categoryActions, ...contentActions];
  }, [items, categories, onClose, onOpenAddModal, onOpenReelsDeck, onOpenPdfModal, onOpenSettingsModal, onSelectCategory, onSelectMediaType, onOpenPreview, onOpenPdf, onExportData, onClearAll]);

  // Filter actions based on search query
  const filteredActions = useMemo(() => {
    if (!query.trim()) return allActions;
    const q = query.toLowerCase().trim();
    return allActions.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.subtitle && a.subtitle.toLowerCase().includes(q))
    );
  }, [allActions, query]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredActions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredActions[selectedIndex]) {
          filteredActions[selectedIndex].perform();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredActions, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] p-4 bg-black/80 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Search Header Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 gap-3 bg-slate-950/80">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command, search reels, PDFs, or jump to filters..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            ESC to close
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredActions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No commands or content found matching "{query}"
            </div>
          ) : (
            filteredActions.map((action, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={action.id}
                  onClick={action.perform}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${isSelected
                      ? 'bg-cyan-500/15 text-white border border-cyan-500/30 shadow-md'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 shrink-0">
                      {action.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{action.title}</div>
                      {action.subtitle && (
                        <div className="text-[10px] text-slate-400 truncate font-mono">
                          {action.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500 shrink-0 uppercase tracking-wider ml-2">
                    {action.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
          </div>
          <span className="flex items-center gap-1 text-cyan-400 font-semibold">
            <Command className="w-3 h-3" /> Keeva OS
          </span>
        </div>
      </div>
    </div>
  );
}
