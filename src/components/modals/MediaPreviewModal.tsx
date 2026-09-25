'use client';

import React, { useState } from 'react';
import { ContentItem } from '@/types/vault';
import { X, ExternalLink, Heart, Eye, Sparkles, MessageSquare, Play, Flame, Check, Globe, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { TranscriptViewerModal } from './TranscriptViewerModal';

interface MediaPreviewModalProps {
  item: ContentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // YouTube
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      let videoId = '';
      if (urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.slice(1);
      } else if (urlObj.pathname.includes('/shorts/')) {
        videoId = urlObj.pathname.split('/shorts/')[1];
      } else {
        videoId = urlObj.searchParams.get('v') || '';
      }
      if (videoId) {
        videoId = videoId.split('?')[0].split('/')[0];
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0`;
      }
    }
    // Instagram Reels
    if (urlObj.hostname.includes('instagram.com') && (urlObj.pathname.includes('/reel/') || urlObj.pathname.includes('/p/'))) {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      const idIndex = parts.findIndex(p => p === 'reel' || p === 'p') + 1;
      if (idIndex > 0 && parts[idIndex]) {
        return `https://www.instagram.com/p/${parts[idIndex]}/embed/`;
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

export function MediaPreviewModal({
  item,
  isOpen,
  onClose,
  onToggleFavorite,
  onUpdateNotes,
}: MediaPreviewModalProps) {
  const { session } = useAuth();
  const [notesText, setNotesText] = useState(item?.notes || '');
  const [isSavedNotes, setIsSavedNotes] = useState(false);
  const [isPublic, setIsPublic] = useState(item?.is_public || false);
  const [isUpdatingPublic, setIsUpdatingPublic] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  if (!isOpen || !item) return null;

  const isPortrait = item.aspect_ratio === 'PORTRAIT_9_16' || item.media_type === 'REEL';
  const embedUrl = getEmbedUrl(item.source_url);

  const handleSaveNotes = () => {
    onUpdateNotes(item.id, notesText);
    setIsSavedNotes(true);
    setTimeout(() => setIsSavedNotes(false), 2000);
  };

  const handleTogglePublic = async () => {
    if (!session?.access_token) return;
    setIsUpdatingPublic(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_public: !isPublic })
      });
      if (res.ok) {
        setIsPublic(!isPublic);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdatingPublic(false);
    }
  };

return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl overflow-y-auto">
        <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-slate-100 max-h-[90vh]">
          {/* Left Side: Media Preview Canvas (9:16 phone mockup or 16:9 wide) */}
          <div
            className={`relative bg-slate-950 flex items-center justify-center p-4 border-b md:border-b-0 md:border-r border-slate-800 ${
              isPortrait ? 'md:w-5/12' : 'md:w-7/12'
            }`}
          >
            {isPortrait ? (
              <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-black flex flex-col justify-between">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    className="absolute inset-0 w-full h-full border-0"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <img
                    src={item.thumbnail_url || `https://picsum.photos/seed/${item.id}/600/1000?grayscale&blur=2`}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                <div className="relative z-10 w-full pt-3 px-4 flex justify-between items-center">
                  <span className="text-[10px] font-mono font-bold text-white/80 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-md">
                    {item.platform} 9:16
                  </span>
                  <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-700/40">
                    Score: {item.priority_score}
                  </span>
                </div>

                <div className="relative z-10 p-4 bg-gradient-to-t from-black via-black/80 to-transparent">
                  <h4 className="text-xs font-bold text-white line-clamp-3 mb-2">{item.title}</h4>
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Watch on {item.platform}
                  </a>
                </div>
              </div>
            ) : (
              <div className="w-full space-y-4">
                <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden border border-slate-800 bg-black">
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      className="w-full h-full border-0 absolute inset-0"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <img
                      src={item.thumbnail_url || `https://picsum.photos/seed/${item.id}/800/400?blur=1`}
                      alt={item.title}
                      className="w-full h-full object-cover absolute inset-0"
                    />
                  )}
                </div>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  <ExternalLink className="w-4 h-4" /> Open Original Post on {item.platform}
                </a>
              </div>
            )}
          </div>

          {/* Right Side: Metadata, Priority Formula Breakdown & Study Notes */}
          <div
            className={`p-6 flex flex-col justify-between overflow-y-auto ${
              isPortrait ? 'md:w-7/12' : 'md:w-5/12'
            }`}
          >
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  {item.category && (
                    <span
                      className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md text-white/90 mb-2"
                      style={{ backgroundColor: `${item.category.color_hex}40`, borderColor: item.category.color_hex, borderWidth: '1px' }}
                    >
                      {item.category.name}
                    </span>
                  )}
                  <h3 className="text-base font-bold text-white leading-snug">{item.title}</h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              {item.description && (
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  {item.description}
                </p>
              )}

              {/* Priority Score Breakdown Box */}
              <div className="p-3.5 bg-gradient-to-br from-slate-950 to-indigo-950/40 rounded-xl border border-slate-800/90 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold text-cyan-300">
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-400" /> Priority Engine Breakdown
                  </span>
                  <span className="font-mono text-sm font-bold text-white">{item.priority_score} pts</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
                  <div>Tier: <span className="text-slate-200">{item.priority}</span></div>
                  <div>Accesses: <span className="text-cyan-400">{item.access_count} (+{(item.access_count || 0) * 2} pts)</span></div>
                  <div>Favorite: <span className={item.is_favorite ? 'text-rose-400' : 'text-slate-500'}>{item.is_favorite ? '+30 pts' : '0 pts'}</span></div>
                  <div>Created: <span className="text-slate-300">{new Date(item.created_at).toLocaleDateString()}</span></div>
                </div>
              </div>

              {/* Study Notes Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> My Study Insights & Key Takeaways
                  </label>
                  {isSavedNotes && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  )}
                </div>
                <textarea
                  rows={3}
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Write actionable takeaways, syntax snippets or architecture notes..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
                />
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                >
                  Save Notes
                </button>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between mt-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onToggleFavorite(item.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      item.is_favorite ? 'text-rose-500 fill-rose-500' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.is_favorite ? 'Favorited' : 'Favorite (+30)'}</span>
                </button>

                <button
                  onClick={handleTogglePublic}
                  disabled={isUpdatingPublic}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    isPublic 
                      ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <Globe className={`w-4 h-4 ${isPublic ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{isPublic ? 'Public in Community' : 'Share to Community'}</span>
                </button>

                {/* Transcript Button - only for video content */}
                {(item.media_type === 'REEL' || item.aspect_ratio === 'PORTRAIT_9_16' || 
                  item.platform === 'YouTube' || item.platform === 'YouTube Shorts' || 
                  item.platform === 'Instagram' || item.platform === 'TikTok') && (
                  <button
                    onClick={() => setShowTranscript(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-xs font-semibold text-cyan-300 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{item.transcript_json?.length ? `Transcript (${item.transcript_json.length})` : 'Generate Transcript'}</span>
                  </button>
                )}
              </div>

              <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> {item.access_count} views
              </span>
            </div>
          </div>
        </div>
      </div>

      {showTranscript && (
        <TranscriptViewerModal
          item={item}
          isOpen={showTranscript}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </>
  );
}
