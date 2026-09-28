'use client';

import React, { useState } from 'react';
import { ContentItem } from '@/types/vault';
import { X, Pencil, Check, Camera, Video, Play } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingCircle } from '@/components/LoadingCircle';

interface EditCommunityPostModalProps {
  item: ContentItem | null;
  onClose: () => void;
  onSaved: (item: ContentItem) => void;
  onError: (message: string) => void;
}

function getPlatformIcon(platform: string) {
  switch (platform.toLowerCase()) {
    case 'instagram': return <Camera className="w-4 h-4 text-pink-400" />;
    case 'youtube': return <Video className="w-4 h-4 text-red-400" />;
    default: return <Play className="w-4 h-4 text-indigo-400" />;
  }
}

export function EditCommunityPostModal({ item, onClose, onSaved, onError }: EditCommunityPostModalProps) {
  const { session } = useAuth();
  const [caption, setCaption] = useState(item?.community_caption || '');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (!item) return null;

  const handleSave = async () => {
    if (!session?.access_token) {
      onError('You need to be signed in to edit a post.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_public: true, community_caption: caption.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onError(body.error || 'Could not save your changes.');
        return;
      }
      setDone(true);
      onSaved({ ...item, community_caption: caption.trim() });
      setTimeout(() => onClose(), 900);
    } catch {
      onError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
      <div className="w-full max-w-lg bg-[#0d1117] border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Edit post</h3>
              <p className="text-[11px] text-slate-400">Update what you wrote about this content</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-3">
          <textarea
            rows={5}
            autoFocus
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What do you think about this? ✨"
            className="w-full bg-transparent border-0 text-[15px] text-slate-200 placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
            maxLength={500}
          />
          <div className="flex justify-end">
            <span className={`text-[10px] font-mono ${caption.length > 450 ? 'text-amber-400' : 'text-slate-600'}`}>
              {caption.length}/500
            </span>
          </div>
        </div>

        <div className="mx-5 mb-4 rounded-xl border border-slate-700/60 bg-slate-900/50 overflow-hidden flex items-center gap-3 p-3">
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt={item.title}
              className="w-16 h-12 object-cover rounded-lg shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-16 h-12 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
              {getPlatformIcon(item.platform)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {getPlatformIcon(item.platform)}
              <span className="text-[10px] text-slate-400 font-mono uppercase">{item.platform}</span>
            </div>
            <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">{item.title}</p>
          </div>
        </div>

        <div className="h-px bg-slate-800/80 mx-5" />

        <div className="px-5 py-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || done}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2 ${
              done
                ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                : 'bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 shadow-cyan-500/25 active:scale-95'
            } disabled:opacity-70`}
          >
            {saving ? (
              <LoadingCircle className="w-4 h-4" />
            ) : done ? (
              <><Check className="w-4 h-4" /> Saved!</>
            ) : (
              <><Pencil className="w-3.5 h-3.5" /> Save changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
