'use client';

import React, { useState } from 'react';
import { Category, ContentItem, MediaType, AspectRatioType, PriorityLevel } from '@/types/vault';
import { X, Sparkles, Link as LinkIcon, FileText, Upload, Check, AlertCircle, Loader2, Clipboard, ChevronDown, ChevronUp } from 'lucide-react';
import confetti from 'canvas-confetti';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onSave: (item: Partial<ContentItem> & { title: string; source_url: string }) => Promise<void>;
}

export function AddItemModal({ isOpen, onClose, categories, onSave }: AddItemModalProps) {
  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Extracted preview state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [platform, setPlatform] = useState('Web');
  const [mediaType, setMediaType] = useState<MediaType>('ARTICLE');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('LANDSCAPE_16_9');
  const [categoryId, setCategoryId] = useState<string>('');
  const [priority, setPriority] = useState<PriorityLevel>('MUST_LEARN');
  const [tags, setTags] = useState<string[]>([]);
  const [docFileUrl, setDocFileUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleScrapeAndFill = async (urlToScrape: string) => {
    if (!urlToScrape.trim()) return;
    setIsScraping(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToScrape.trim() }),
      });

      const data = await res.json();
      const meta = data.metadata || {};

      setTitle(meta.title || urlToScrape.trim());
      setDescription(meta.description || '');
      setThumbnailUrl(meta.thumbnail_url || '');
      setPlatform(meta.platform || 'Web');
      setMediaType(meta.media_type || 'ARTICLE');
      setAspectRatio(meta.aspect_ratio || 'LANDSCAPE_16_9');
      setPriority(meta.autoPriority || 'MUST_LEARN');
      setTags(meta.autoTags || []);

      // Auto-match category
      if (meta.autoCategoryName && categories.length > 0) {
        const found = categories.find(
          (c) => c.name.toLowerCase() === meta.autoCategoryName.toLowerCase()
        );
        if (found) setCategoryId(found.id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Auto-detection failed. You can still save directly.');
    } finally {
      setIsScraping(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        const finalUrl = urlMatch ? urlMatch[0] : text.trim();
        setUrlInput(finalUrl);
        await handleScrapeAndFill(finalUrl);
      }
    } catch (e) {
      console.warn('Clipboard read error:', e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      setDocFileUrl(data.fileUrl);
      setUrlInput(data.fileUrl);
      setTitle(file.name.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_]/g, ' '));
      setPlatform(data.platform || 'PDF');
      setMediaType(data.mediaType || 'DOCUMENT');
      setAspectRatio(data.aspectRatio || 'STANDARD_DOCUMENT');
      setDescription(`Uploaded Document (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
      setPriority('MUST_LEARN');
      setThumbnailUrl('');  // no fake wallpaper
    } catch (err: any) {
      setErrorMsg(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title && !urlInput && !docFileUrl) {
      setErrorMsg('Please enter a link or upload a file.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title: title || urlInput,
        source_url: urlInput || docFileUrl || '',
        platform,
        media_type: mediaType,
        aspect_ratio: aspectRatio,
        thumbnail_url: thumbnailUrl || null,
        doc_file_url: docFileUrl,
        category_id: categoryId || null,
        priority,
        description,
        tags,
      });

      confetti({ particleCount: 50, spread: 60, origin: { y: 0.75 } });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-7 relative my-6 text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">Universal 1-Click Ingest</h2>
            <p className="text-xs text-slate-400">Paste any link or drop any document file</p>
          </div>
        </div>

        {/* Input Box with Auto-Paste Button */}
        <div className="space-y-3 mb-4">
          <div className="relative flex items-center">
            <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (e.target.value.startsWith('http')) {
                  handleScrapeAndFill(e.target.value);
                }
              }}
              placeholder="Paste Instagram Reel, YouTube, LinkedIn, or Web link..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-28 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="absolute right-2 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
            >
              <Clipboard className="w-3.5 h-3.5 text-cyan-400" />
              <span>Paste</span>
            </button>
          </div>

          {/* Or Drop File Box */}
          <div className="relative border-2 border-dashed border-slate-800 hover:border-cyan-500/50 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-slate-950/40">
            <input
              type="file"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
              accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.csv,.mp4,.mov,.webm"
            />
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-300">
              {isUploading ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 text-cyan-400" />
              )}
              <span>{isUploading ? 'Uploading & Extracting...' : 'Or Drop Any File (PDF, Video, Docs)'}</span>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Live Auto-Detected Intelligence Card */}
        {(title || isScraping) && (
          <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800/90 mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Auto-Detected Metadata
              </span>
              <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800">
                {platform} • {aspectRatio === 'PORTRAIT_9_16' ? '9:16 Reel' : '16:9'}
              </span>
            </div>

            {isScraping ? (
              <div className="flex items-center gap-2 py-2 text-xs text-slate-400 font-mono">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Extracting title, thumbnail, and aspect ratio...</span>
              </div>
            ) : (
              <>
                <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2">{title}</h4>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 px-1.5 py-0.5 rounded"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Category Picker — always visible once content is detected */}
        {title && !isScraping && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              📁 Choose Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    categoryId === c.id
                      ? 'border-cyan-500 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color_hex }} />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCategoryId('')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  !categoryId
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-600" />
                <span>Auto Assign</span>
              </button>
            </div>
          </div>
        )}

        {/* Advanced Accordion (Optional) */}
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-[11px] font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
          >
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{showAdvanced ? 'Hide Advanced Overrides' : 'Optional: Edit Details / Priority'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">Auto-Assign</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white"
                  >
                    <option value="MUST_LEARN">MUST_LEARN (100)</option>
                    <option value="HIGH">HIGH (75)</option>
                    <option value="MEDIUM">MEDIUM (50)</option>
                    <option value="LOW">LOW (25)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isScraping || isUploading || (!urlInput && !docFileUrl)}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 disabled:opacity-50 transition-all cursor-pointer active:scale-95"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving to Vault...</span>
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              <span>Instant Save to Vault</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
