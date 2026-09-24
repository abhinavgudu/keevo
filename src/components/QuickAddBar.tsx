'use client';

import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Link as LinkIcon,
  Upload,
  Loader2,
  ArrowRight,
  Clipboard,
  Camera,
  Video,
  Share2,
  FileText,
  Globe,
  Check,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ContentItem } from '@/types/vault';

interface QuickAddBarProps {
  onSaveItem: (item: Partial<ContentItem> & { title: string; source_url: string }) => Promise<void>;
  onOpenPdfModal: () => void;
}

export function QuickAddBar({ onSaveItem, onOpenPdfModal }: QuickAddBarProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isClipboardSuccess, setIsClipboardSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [detectedPlatform, setDetectedPlatform] = useState<{
    name: string;
    icon: React.ReactNode;
    color: string;
  } | null>(null);

  const handleUrlChange = (val: string) => {
    setUrl(val);
    const lowercase = val.toLowerCase().trim();

    if (!val.trim()) {
      setDetectedPlatform(null);
      return;
    }

    if (lowercase.includes('instagram.com') || lowercase.includes('instagr.am')) {
      setDetectedPlatform({
        name: 'Instagram (9:16)',
        icon: <Camera className="w-3.5 h-3.5" />,
        color: 'from-pink-500 to-purple-600',
      });
    } else if (
      lowercase.includes('youtube.com/shorts') ||
      (lowercase.includes('youtu.be') && lowercase.includes('shorts'))
    ) {
      setDetectedPlatform({
        name: 'Shorts (9:16)',
        icon: <Video className="w-3.5 h-3.5" />,
        color: 'from-red-500 to-rose-600',
      });
    } else if (lowercase.includes('youtube.com') || lowercase.includes('youtu.be')) {
      setDetectedPlatform({
        name: 'YouTube (16:9)',
        icon: <Video className="w-3.5 h-3.5" />,
        color: 'from-red-600 to-amber-600',
      });
    } else if (lowercase.includes('tiktok.com')) {
      setDetectedPlatform({
        name: 'TikTok (9:16)',
        icon: <span className="text-[10px] font-black">TT</span>,
        color: 'from-cyan-400 to-pink-500',
      });
    } else if (lowercase.includes('linkedin.com')) {
      setDetectedPlatform({
        name: 'LinkedIn (16:9)',
        icon: <Share2 className="w-3.5 h-3.5" />,
        color: 'from-blue-500 to-indigo-600',
      });
    } else if (lowercase.includes('twitter.com') || lowercase.includes('x.com')) {
      setDetectedPlatform({
        name: 'Twitter / X',
        icon: <Globe className="w-3.5 h-3.5" />,
        color: 'from-slate-600 to-slate-800',
      });
    } else if (lowercase.endsWith('.pdf') || lowercase.includes('arxiv.org')) {
      setDetectedPlatform({
        name: 'PDF Document',
        icon: <FileText className="w-3.5 h-3.5" />,
        color: 'from-rose-500 to-red-600',
      });
    } else {
      setDetectedPlatform({
        name: 'Web Link',
        icon: <Globe className="w-3.5 h-3.5" />,
        color: 'from-cyan-500 to-blue-600',
      });
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        const finalUrl = urlMatch ? urlMatch[0] : text.trim();
        setUrl(finalUrl);
        handleUrlChange(finalUrl);
        setIsClipboardSuccess(true);
        setTimeout(() => setIsClipboardSuccess(false), 2000);
      }
    } catch (e) {
      console.warn('Clipboard read error:', e);
    }
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      const meta = data.metadata || {};

      await onSaveItem({
        title: meta.title || url.trim(),
        source_url: meta.source_url || url.trim(),
        platform: meta.platform || 'Web',
        media_type: meta.media_type || 'ARTICLE',
        aspect_ratio: meta.aspect_ratio || 'LANDSCAPE_16_9',
        thumbnail_url: meta.thumbnail_url || null,
        priority: meta.autoPriority || 'MUST_LEARN',
        description: meta.description || '',
        tags: meta.autoTags || [],
      });

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.75 },
      });

      setUrl('');
      setDetectedPlatform(null);
    } catch (err) {
      console.error('Quick ingestion error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        await onSaveItem({
          title: file.name.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_]/g, ' '),
          source_url: data.fileUrl,
          doc_file_url: data.fileUrl,
          platform: data.platform || 'PDF',
          media_type: data.mediaType || 'DOCUMENT',
          aspect_ratio: data.aspectRatio || 'STANDARD_DOCUMENT',
          priority: 'MUST_LEARN',
          description: `Uploaded Document (${(file.size / (1024 * 1024)).toFixed(2)} MB)`,
          thumbnail_url:
            data.mediaType === 'DOCUMENT'
              ? 'https://images.unsplash.com/photo-1618042164219-62c820f10723?q=80&w=1200&auto=format&fit=crop'
              : null,
        });

        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.75 },
        });
      }
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full mb-4 sm:mb-6">
      <div className="p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900/90 border border-slate-800/90 shadow-xl backdrop-blur-xl">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-xs sm:text-sm font-bold text-white truncate">
              Smart 1-Click Ingestion
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
              title="Paste from Clipboard"
            >
              {isClipboardSuccess ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Clipboard className="w-3 h-3 text-cyan-400" />
              )}
              <span>{isClipboardSuccess ? 'Pasted!' : 'Paste'}</span>
            </button>

            <label className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer">
              <Upload className="w-3 h-3" />
              <span>File</span>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.csv,.mp4,.mov,.webm"
              />
            </label>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleQuickSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 w-full">
            <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="url"
              required
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="Paste Instagram, YouTube, LinkedIn, or PDF link..."
              className="w-full bg-slate-950/90 border border-slate-800/90 rounded-xl sm:rounded-2xl pl-9 pr-24 sm:pr-28 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            {detectedPlatform && (
              <div
                className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold text-white bg-gradient-to-r ${detectedPlatform.color} shadow-sm`}
              >
                {detectedPlatform.icon}
                <span className="truncate max-w-[80px] sm:max-w-none">{detectedPlatform.name}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!url || isLoading}
            className="w-full sm:w-auto px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all shrink-0 cursor-pointer active:scale-95"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Auto-Ingesting...</span>
              </>
            ) : (
              <>
                <span>Save to Vault</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
