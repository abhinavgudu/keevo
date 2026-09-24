'use client';

import React, { useState, useEffect } from 'react';
import { Upload, FileText, Film, Sparkles, Loader2, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { ContentItem } from '@/types/vault';

interface GlobalDropzoneProps {
  onSaveItem: (item: Partial<ContentItem> & { title: string; source_url: string }) => Promise<void>;
  showToast: (msg: string) => void;
}

export function GlobalDropzone({ onSaveItem, showToast }: GlobalDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      setDragCounter((prev) => prev + 1);
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setDragCounter((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setIsDragging(false);
          return 0;
        }
        return next;
      });
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setDragCounter(0);

      const files = e.dataTransfer?.files;
      const text = e.dataTransfer?.getData('text');

      // 1. Text / URL Drop
      if (text && (!files || files.length === 0)) {
        const urlMatch = text.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          const url = urlMatch[0];
          setIsProcessing(true);
          try {
            const res = await fetch('/api/scrape', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url }),
            });
            const data = await res.json();
            if (data.metadata) {
              await onSaveItem({
                title: data.metadata.title || url,
                source_url: url,
                platform: data.metadata.platform || 'Web',
                media_type: data.metadata.media_type,
                aspect_ratio: data.metadata.aspect_ratio,
                thumbnail_url: data.metadata.thumbnail_url,
                priority: 'MUST_LEARN',
                description: data.metadata.description,
              });
              confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
              showToast('Dropped link saved into VaultX!');
            }
          } catch (err) {
            console.error('Drop link error:', err);
          } finally {
            setIsProcessing(false);
          }
          return;
        }
      }

      // 2. File Drop (PDF, Video MP4, etc.)
      if (files && files.length > 0) {
        const file = files[0];
        setIsProcessing(true);

        try {
          if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/upload-pdf', {
              method: 'POST',
              body: formData,
            });

            const data = await res.json();
            if (data.success) {
              await onSaveItem({
                title: file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
                source_url: data.fileUrl,
                doc_file_url: data.fileUrl,
                platform: 'PDF',
                media_type: 'DOCUMENT',
                aspect_ratio: 'STANDARD_DOCUMENT',
                priority: 'HIGH',
                description: `Uploaded PDF (${(file.size / (1024 * 1024)).toFixed(2)} MB)`,
                thumbnail_url: 'https://images.unsplash.com/photo-1618042164219-62c820f10723?q=80&w=1200&auto=format&fit=crop',
              });
              confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
              showToast(`PDF "${file.name}" uploaded to vault!`);
            }
          } else if (file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov')) {
            // Local video upload
            const reader = new FileReader();
            reader.onload = async (ev) => {
              const videoDataUrl = ev.target?.result as string;
              await onSaveItem({
                title: file.name.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_]/g, ' '),
                source_url: videoDataUrl,
                doc_file_url: videoDataUrl,
                platform: 'Video',
                media_type: 'REEL',
                aspect_ratio: 'PORTRAIT_9_16',
                priority: 'MUST_LEARN',
                description: `Local Video File (${(file.size / (1024 * 1024)).toFixed(2)} MB)`,
              });
              confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
              showToast(`Video "${file.name}" uploaded to vault!`);
              setIsProcessing(false);
            };
            reader.readAsDataURL(file);
            return;
          } else {
            showToast('Please drop a PDF document, video file, or valid link.');
          }
        } catch (err: any) {
          console.error('File drop error:', err);
          showToast(`Drop error: ${err.message}`);
        } finally {
          setIsProcessing(false);
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onSaveItem, showToast]);

  if (!isDragging && !isProcessing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-2xl border-4 border-dashed border-cyan-500/80 animate-in fade-in duration-200 pointer-events-none">
      <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-900/90 rounded-3xl border border-cyan-500/50 shadow-2xl max-w-lg">
        {isProcessing ? (
          <>
            <div className="w-20 h-20 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 mb-4 animate-spin">
              <Loader2 className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Processing Dropped Content...</h3>
            <p className="text-xs text-slate-400 font-mono">
              Extracting metadata, aspect ratio, and calculating priority...
            </p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white mb-4 shadow-xl shadow-cyan-500/30 animate-bounce">
              <Upload className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Drop Anywhere to Ingest</h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xs mb-4">
              Drop your PDF document, MP4 video, or web link to instantly save with automated priority scoring.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-300 bg-cyan-950/60 px-3 py-1.5 rounded-full border border-cyan-700/40">
              <Sparkles className="w-3.5 h-3.5" /> Auto-Categorization & 9:16 Preservation
            </div>
          </>
        )}
      </div>
    </div>
  );
}
