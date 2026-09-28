'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Sparkles,
  Link as LinkIcon,
  Upload,
  ArrowRight,
  Clipboard,
  Camera,
  Video,
  Share2,
  FileText,
  Globe,
  Check,
  X,
  Zap,
  BookmarkPlus,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { LoadingCircle } from '@/components/LoadingCircle';
import { Category, SaveItemInput } from '@/types/vault';
import { LEGACY_CATEGORY_ALIASES } from '@/lib/categories';

interface QuickAddBarProps {
  onSaveItem: (item: SaveItemInput) => Promise<void>;
  onOpenPdfModal: () => void;
  categories: Category[];
}

function matchCategoryByName(name: string, cats: Category[]): Category | undefined {
  const wanted = LEGACY_CATEGORY_ALIASES[name.toLowerCase()] ?? name;
  return cats.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
}

interface ScrapedPreview {
  title: string;
  description: string;
  thumbnail_url: string | null;
  platform: string;
  media_type: string;
  aspect_ratio: string;
  source_url: string;
  autoPriority: string;
  autoTags: string[];
  autoCategoryName?: string;
  autoCategoryConfidence?: 'high' | 'medium' | 'low';
}

function getPlatformBadge(platform: string) {
  const map: Record<string, { label: string; color: string; textColor: string }> = {
    instagram: { label: 'Instagram', color: 'from-pink-500 to-purple-600', textColor: 'text-white' },
    youtube: { label: 'YouTube', color: 'from-red-500 to-rose-600', textColor: 'text-white' },
    tiktok: { label: 'TikTok', color: 'from-cyan-400 to-pink-500', textColor: 'text-white' },
    linkedin: { label: 'LinkedIn', color: 'from-blue-500 to-indigo-600', textColor: 'text-white' },
    pdf: { label: 'PDF', color: 'from-rose-500 to-red-600', textColor: 'text-white' },
  };
  const key = platform.toLowerCase();
  return map[key] || { label: platform, color: 'from-cyan-500 to-blue-600', textColor: 'text-white' };
}

export function QuickAddBar({ onSaveItem, onOpenPdfModal, categories }: QuickAddBarProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClipboardSuccess, setIsClipboardSuccess] = useState(false);
  const [preview, setPreview] = useState<ScrapedPreview | null>(null);
  const [scrapeError, setScrapeError] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detectedPlatform, setDetectedPlatform] = useState<{
    name: string;
    icon: React.ReactNode;
    color: string;
  } | null>(null);

  const detectPlatformFromUrl = (val: string) => {
    const lowercase = val.toLowerCase().trim();
    if (!val.trim()) { setDetectedPlatform(null); return; }

    if (lowercase.includes('instagram.com') || lowercase.includes('instagr.am')) {
      setDetectedPlatform({ name: 'Instagram (9:16)', icon: <Camera className="w-3.5 h-3.5" />, color: 'from-pink-500 to-purple-600' });
    } else if (lowercase.includes('youtube.com/shorts') || (lowercase.includes('youtu.be') && lowercase.includes('shorts'))) {
      setDetectedPlatform({ name: 'Shorts (9:16)', icon: <Video className="w-3.5 h-3.5" />, color: 'from-red-500 to-rose-600' });
    } else if (lowercase.includes('youtube.com') || lowercase.includes('youtu.be')) {
      setDetectedPlatform({ name: 'YouTube (16:9)', icon: <Video className="w-3.5 h-3.5" />, color: 'from-red-600 to-amber-600' });
    } else if (lowercase.includes('tiktok.com')) {
      setDetectedPlatform({ name: 'TikTok (9:16)', icon: <span className="text-[10px] font-black">TT</span>, color: 'from-cyan-400 to-pink-500' });
    } else if (lowercase.includes('linkedin.com')) {
      setDetectedPlatform({ name: 'LinkedIn (16:9)', icon: <Share2 className="w-3.5 h-3.5" />, color: 'from-blue-500 to-indigo-600' });
    } else if (lowercase.includes('twitter.com') || lowercase.includes('x.com')) {
      setDetectedPlatform({ name: 'Twitter / X', icon: <Globe className="w-3.5 h-3.5" />, color: 'from-slate-600 to-slate-800' });
    } else if (lowercase.endsWith('.pdf') || lowercase.includes('arxiv.org')) {
      setDetectedPlatform({ name: 'PDF Document', icon: <FileText className="w-3.5 h-3.5" />, color: 'from-rose-500 to-red-600' });
    } else if (lowercase.startsWith('http')) {
      setDetectedPlatform({ name: 'Web Link', icon: <Globe className="w-3.5 h-3.5" />, color: 'from-cyan-500 to-blue-600' });
    } else {
      setDetectedPlatform(null);
    }
  };

  // Auto-scrape after user stops typing for 800ms
  const handleUrlChange = useCallback((val: string) => {
    setUrl(val);
    setPreview(null);
    setScrapeError('');
    setCategoryId('');
    detectPlatformFromUrl(val);

    if (scrapeTimeoutRef.current) clearTimeout(scrapeTimeoutRef.current);

    const trimmed = val.trim();
    if (!trimmed || !trimmed.startsWith('http')) return;

    scrapeTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        });
        const data = await res.json();
        if (data.metadata) {
          const m = data.metadata as ScrapedPreview;
          setPreview(m);
          // A confident detection pre-selects its category so the chip row
          // below shows where this will land; anything else leaves the row
          // empty for the user to file in one tap (Instagram, e.g., serves a
          // login wall to us, so its captions never reach the classifier).
          const found = m.autoCategoryName && m.autoCategoryConfidence !== 'low'
            ? matchCategoryByName(m.autoCategoryName, categories)
            : undefined;
          setCategoryId(found ? found.id : '');
        } else {
          setScrapeError('Could not fetch metadata. You can still save directly.');
        }
      } catch {
        setScrapeError('Auto-detection failed. You can still save.');
      } finally {
        setIsLoading(false);
      }
    }, 800);
  }, [categories]);

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

  const handleSavePreview = async () => {
    if (!preview || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveItem({
        title: preview.title || url.trim(),
        source_url: preview.source_url || url.trim(),
        platform: preview.platform || 'Web',
        media_type: preview.media_type as any || 'ARTICLE',
        aspect_ratio: preview.aspect_ratio as any || 'LANDSCAPE_16_9',
        thumbnail_url: preview.thumbnail_url || null,
        priority: preview.autoPriority as any || 'MUST_LEARN',
        description: preview.description || '',
        tags: preview.autoTags || [],
        category_id: categoryId || undefined,
        auto_category_name: preview.autoCategoryName,
        auto_category_confidence: preview.autoCategoryConfidence,
      });
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.75 }, colors: ['#00E5FF', '#6366F1', '#D946EF'] });
      setUrl('');
      setPreview(null);
      setDetectedPlatform(null);
      setCategoryId('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || isLoading || isSaving) return;

    // If we already have a preview, just save it
    if (preview) {
      await handleSavePreview();
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      const meta = data.metadata || {};

      await onSaveItem({
        title: meta.title || trimmed,
        source_url: meta.source_url || trimmed,
        platform: meta.platform || 'Web',
        media_type: meta.media_type || 'ARTICLE',
        aspect_ratio: meta.aspect_ratio || 'LANDSCAPE_16_9',
        thumbnail_url: meta.thumbnail_url || null,
        priority: meta.autoPriority || 'MUST_LEARN',
        description: meta.description || '',
        tags: meta.autoTags || [],
        category_id: categoryId || undefined,
        auto_category_name: meta.autoCategoryName,
        auto_category_confidence: meta.autoCategoryConfidence,
      });
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.75 }, colors: ['#00E5FF', '#6366F1', '#D946EF'] });
      setUrl('');
      setPreview(null);
      setDetectedPlatform(null);
      setCategoryId('');
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
      const res = await fetch('/api/upload-pdf', { method: 'POST', body: formData });
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
          thumbnail_url: data.mediaType === 'DOCUMENT' ? 'https://images.unsplash.com/photo-1618042164219-62c820f10723?q=80&w=1200&auto=format&fit=crop' : null,
        });
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.75 } });
      }
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const platformBadge = preview ? getPlatformBadge(preview.platform) : null;

  return (
    <div className="w-full mb-4 sm:mb-6">
      <div className="rounded-2xl sm:rounded-3xl bg-slate-900/90 border border-slate-800/90 shadow-xl backdrop-blur-xl overflow-hidden">
        <div className="p-3.5 sm:p-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 border border-cyan-400/40 flex items-center justify-center text-white shrink-0 shadow-md shadow-cyan-500/30 animate-pulse">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <span>Smart AI Capture</span>
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold hidden sm:inline-block">
                    Auto-Preview
                  </span>
                </h2>
                <p className="text-[10px] text-slate-500 hidden sm:block">Paste a link — AI extracts title, thumbnail & category automatically</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                title="Paste from Clipboard"
              >
                {isClipboardSuccess ? <Check className="w-3 h-3 text-emerald-400" /> : <Clipboard className="w-3 h-3 text-cyan-400" />}
                <span>{isClipboardSuccess ? 'Pasted!' : 'Paste'}</span>
              </button>
              <label className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>File</span>
                <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.csv,.mp4,.mov,.webm" />
              </label>
            </div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleQuickSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 w-full">
              {isLoading ? (
                <LoadingCircle className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              ) : (
                <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              )}
              <input
                type="url"
                required
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="Paste Instagram, YouTube, LinkedIn, or PDF link..."
                className="w-full bg-slate-950/90 border border-slate-800/90 rounded-xl sm:rounded-2xl pl-9 pr-28 sm:pr-32 py-2.5 sm:py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
              {detectedPlatform && (
                <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-bold text-white bg-gradient-to-r ${detectedPlatform.color} shadow-sm`}>
                  {detectedPlatform.icon}
                  <span className="truncate max-w-[80px] sm:max-w-none">{detectedPlatform.name}</span>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={!url || isLoading || isSaving}
              className="w-full sm:w-auto px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all shrink-0 cursor-pointer active:scale-95"
            >
              {isLoading || isSaving ? (
                <><LoadingCircle className="w-3.5 h-3.5" /><span>{isLoading ? 'Fetching...' : 'Saving...'}</span></>
              ) : preview ? (
                <><BookmarkPlus className="w-3.5 h-3.5" /><span>Save to Vault</span></>
              ) : (
                <><span>Save to Vault</span><ArrowRight className="w-3.5 h-3.5" /></>
              )}
            </button>
          </form>
        </div>

        {/* Auto-Preview Panel */}
        {preview && (
          <div className="border-t border-slate-800/80 bg-slate-950/60 px-3.5 sm:px-5 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-3 duration-300">
            {/* Thumbnail */}
            {preview.thumbnail_url ? (
              <div className={`shrink-0 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900 ${preview.aspect_ratio === 'PORTRAIT_9_16' ? 'w-10 h-[72px]' : 'w-16 h-10'}`}>
                <img src={preview.thumbnail_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="shrink-0 w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Globe className="w-5 h-5 text-slate-500" />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {platformBadge && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${platformBadge.color} text-white`}>
                    {platformBadge.label}
                  </span>
                )}
                {preview.autoCategoryName && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                    {preview.autoCategoryName}
                  </span>
                )}
                <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                  {preview.autoPriority}
                </span>
              </div>
              <p className="text-xs font-semibold text-white line-clamp-2 leading-snug mb-1">{preview.title}</p>
              {preview.description && (
                <p className="text-[10px] text-slate-400 line-clamp-1">{preview.description}</p>
              )}
              {preview.autoTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {preview.autoTags.slice(0, 4).map((tag, i) => (
                    <span key={i} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">#{tag}</span>
                  ))}
                </div>
              )}

              {/* File into — always visible so every save lands somewhere the
                  user can see, even when the platform blocked our scrape. */}
              <div className="mt-2">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="text-[9px] uppercase tracking-wide text-slate-500 font-mono">File into</span>
                  {!preview.autoCategoryName && ['Instagram', 'TikTok', 'YouTube'].includes(preview.platform) && (
                    <span className="text-[9px] text-amber-400/90">
                      {preview.platform} hides its captions from servers — tap one below or save uncategorised.
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setCategoryId('')}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors cursor-pointer ${
                      !categoryId
                        ? 'bg-slate-700 border-slate-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {preview.autoCategoryName && !categoryId ? `Detected: ${preview.autoCategoryName}` : 'None'}
                  </button>
                  {categories.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors cursor-pointer flex items-center gap-1 ${
                        categoryId === c.id
                          ? 'bg-indigo-500/20 border-indigo-400 text-indigo-200'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {categoryId === c.id && <Check className="w-2.5 h-2.5" />}
                      <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: c.color_hex }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => { setPreview(null); setUrl(''); setDetectedPlatform(null); setScrapeError(''); setCategoryId(''); }}
              className="shrink-0 p-1 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {scrapeError && !preview && (
          <div className="border-t border-slate-800/50 bg-slate-950/40 px-4 py-2 text-[11px] text-amber-400/80">
            {scrapeError}
          </div>
        )}
      </div>
    </div>
  );
}
