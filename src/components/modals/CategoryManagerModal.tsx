'use client';

import React, { useState } from 'react';
import { Category } from '@/types/vault';
import { X, Plus, Trash2, FolderPlus, Tag, Palette } from 'lucide-react';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSaveCategory: (cat: { name: string; color_hex: string }) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
}

const PRESET_COLORS = [
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#EF4444', // Red
  '#84CC16', // Lime
];

export function CategoryManagerModal({
  isOpen,
  onClose,
  categories,
  onSaveCategory,
  onDeleteCategory,
}: CategoryManagerModalProps) {
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#3B82F6');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setIsSubmitting(true);
    try {
      await onSaveCategory({
        name: newCatName.trim(),
        color_hex: newCatColor,
      });
      setNewCatName('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <FolderPlus className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Smart Categories</h2>
            <p className="text-xs text-slate-400">Organize your content with custom color taxonomies</p>
          </div>
        </div>

        {/* Existing Categories List */}
        <div className="space-y-2 mb-6 max-h-56 overflow-y-auto pr-1">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full shadow-md"
                  style={{ backgroundColor: cat.color_hex }}
                />
                <span className="text-xs font-semibold text-white">{cat.name}</span>
                <span className="text-[10px] font-mono text-slate-500">{cat.color_hex}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete category "${cat.name}"?`)) {
                    onDeleteCategory(cat.id);
                  }
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Delete Category"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add New Category Form */}
        <form onSubmit={handleAdd} className="pt-4 border-t border-slate-800 space-y-3">
          <label className="block text-xs font-semibold text-slate-300">Create New Category</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="E.g. AI Prompt Engineering"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={isSubmitting || !newCatName}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 transition-all"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          {/* Color Palette Selector */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
              <Palette className="w-3.5 h-3.5" /> Color:
            </span>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewCatColor(c)}
                className={`w-6 h-6 rounded-full transition-transform ${
                  newCatColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
