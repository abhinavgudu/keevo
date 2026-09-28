'use client';

import React, { useState } from 'react';
import { ContentItem } from '@/types/vault';
import { X, Globe, Camera, Video, Play, Check, Sparkles, Users, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingCircle } from '@/components/LoadingCircle';

interface ShareToCommunityModalProps {
  item: ContentItem | null;
  isOpen: boolean;
  isCurrentlyPublic: boolean;
  onClose: () => void;
  onShared: (item: ContentItem, caption: string) => void;
}

function getPlatformIcon(platform: string) {
  switch (platform.toLowerCase()) {
    case 'instagram': return <Camera className="w-4 h-4 text-pink-400" />;
    case 'youtube': return <Video className="w-4 h-4 text-red-400" />;
    default: return <Play className="w-4 h-4 text-indigo-400" />;
  }
}

export function ShareToCommunityModal({
  item,
  isOpen,
  isCurrentlyPublic,
  onClose,
  onShared,
}: ShareToCommunityModalProps) {
  const { session, user } = useAuth();
  // Prefilled from the item on mount. MediaPreviewModal remounts this modal via
  // `key={item.id}`, so switching posts re-runs the initialiser.
  const [caption, setCaption] = useState(() => item?.community_caption || '');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  const meta = user?.user_metadata as
    | { first_name?: string; last_name?: string; full_name?: string; name?: string }
    | undefined;
  const fullName = meta?.full_name || meta?.name || '';
  const firstName = meta?.first_name || fullName.split(' ')[0] || '';
  const authorName =
    firstName || user?.email?.split('@')[0] || 'You';
  const authorInitial = authorName.charAt(0).toUpperCase();

  const handleShare = async () => {
    if (!session?.access_token) {
      setError('Your session expired. Please sign in again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_public: true, community_caption: caption.trim() }),
      });
      if (res.ok) {
        setDone(true);
        onShared({ ...item, is_public: true, community_caption: caption.trim() }, caption.trim());
        setTimeout(() => onClose(), 1500);
      } else {
        // Previously a failed PATCH reset the button with no message, so a dead
        // session looked identical to "posted but not showing up in the feed".
        const body = await res.json().catch(() => null);
        setError(
          res.status === 401
            ? 'Your session expired. Please sign in again.'
            : body?.error || `Could not post (error ${res.status}).`
        );
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!session?.access_token) {
      setError('Your session expired. Please sign in again.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_public: false, community_caption: '' }),
      });
      if (res.ok) {
        setDone(true);
        onShared({ ...item, is_public: false, community_caption: '' }, '');
        setTimeout(() => onClose(), 1200);
      } else {
        const body = await res.json().catch(() => null);
        setError(
          res.status === 401
            ? 'Your session expired. Please sign in again.'
            : body?.error || `Could not remove (error ${res.status}).`
        );
      }
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
      <div className="w-full max-w-lg bg-[#0d1117] border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Share to Community</h3>
              <p className="text-[11px] text-slate-400">Your post will be visible to all Keeva users</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-black text-base shadow-md shrink-0">
            {authorInitial}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{authorName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Globe className="w-3 h-3 text-slate-400" />
              <span className="text-[11px] text-slate-400">Sharing with all Keeva community</span>
            </div>
          </div>
        </div>

        <div className="px-5 pt-3 pb-2">
          <textarea
            rows={4}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={`What do you think about this? Share your key insights or why this is worth watching... ✨`}
            className="w-full bg-transparent border-0 text-sm text-slate-200 placeholder-slate-600 focus:outline-none resize-none leading-relaxed"
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
            <img src={item.thumbnail_url} alt={item.title} className="w-16 h-12 object-cover rounded-lg shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-16 h-12 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">{getPlatformIcon(item.platform)}</div>
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

        {error && (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-px" />
            <p className="text-xs text-rose-300 leading-relaxed">{error}</p>
          </div>
        )}


        <div className="px-5 py-4 flex items-center justify-between gap-3">
          {isCurrentlyPublic ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              Already in Community
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">Visible to all Keeva users</span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors">
              Cancel
            </button>
            {isCurrentlyPublic ? (
              <button
                onClick={handleRemove}
                disabled={loading || done}
                className="px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2 bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-70"
              >
                {loading ? <LoadingCircle className="w-4 h-4" /> : done ? <><Check className="w-4 h-4" /> Removed</> : 'Remove from Community'}
              </button>
            ) : (
              <button
                onClick={handleShare}
                disabled={loading || done}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2 ${
                  done ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 shadow-emerald-500/25 active:scale-95'
                } disabled:opacity-70`}
              >
                {loading ? <LoadingCircle className="w-4 h-4" /> : done ? <><Check className="w-4 h-4" /> Posted!</> : <><Sparkles className="w-3.5 h-3.5" /> Post to Community</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
