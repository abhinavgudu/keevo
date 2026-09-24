'use client';

import React, { useState } from 'react';
import { ContentItem } from '@/types/vault';
import { X, ZoomIn, ZoomOut, Download, Maximize2, ExternalLink, FileText, Heart, Eye, Sparkles } from 'lucide-react';

interface PdfViewerModalProps {
  item: ContentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
}

export function PdfViewerModal({ item, isOpen, onClose, onToggleFavorite }: PdfViewerModalProps) {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!isOpen || !item) return null;

  const pdfUrl = item.doc_file_url || item.source_url;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 25, 50));
  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-xl">
      <div
        className={`w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 transition-all duration-300 ${
          isFullscreen ? 'h-full max-w-full rounded-none' : 'max-w-6xl h-[90vh]'
        }`}
      >
        {/* PDF Top Control Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 gap-3">
          {/* Left info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-white truncate max-w-sm sm:max-w-md">
                {item.title}
              </h3>
              <p className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                <span>Priority: {item.priority_score}</span>
                <span>•</span>
                <span className="text-cyan-400">Reads: {item.access_count}</span>
              </p>
            </div>
          </div>

          {/* Center Zoom & Action Controls */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-300 px-1.5">{zoomLevel}%</span>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleFavorite(item.id)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors"
              title="Favorite"
            >
              <Heart
                className={`w-4 h-4 ${
                  item.is_favorite ? 'text-rose-500 fill-rose-500' : 'text-slate-400'
                }`}
              />
            </button>

            <a
              href={pdfUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold transition-all"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Embedded PDF Canvas / Viewer */}
        <div className="flex-1 bg-slate-950/90 relative overflow-auto flex items-center justify-center p-2 sm:p-4">
          <div
            className="w-full h-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }}
          >
            <iframe
              src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
              title={item.title}
              className="w-full h-full flex-1 border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
