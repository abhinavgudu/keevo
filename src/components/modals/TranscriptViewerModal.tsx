'use client';

import React, { useState, useEffect } from 'react';
import { ContentItem, TranscriptSegment } from '@/types/vault';
import { X, Search, Download, Copy, Volume2, VolumeX, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface TranscriptViewerModalProps {
  item: ContentItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TranscriptViewerModal({ item, isOpen, onClose }: TranscriptViewerModalProps) {
  const [segments, setSegments] = useState<TranscriptSegment[]>(item?.transcript_json || []);
  const [fullText, setFullText] = useState(item?.transcript_text || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSegment, setCurrentSegment] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (item) {
      setSegments(item.transcript_json || []);
      setFullText(item.transcript_text || '');
      setCurrentSegment(-1);
    }
  }, [item]);

  const filteredSegments = segments.filter(seg =>
    seg.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSegmentClick = (index: number, segment: TranscriptSegment) => {
    setCurrentSegment(index);
    // Would seek video if embedded
  };

  const copyFullText = async () => {
    await navigator.clipboard.writeText(fullText);
  };

  const copySegment = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-xl">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-white truncate max-w-sm sm:max-w-md">{item.title}</h3>
              <p className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                <span>{item.transcript_language?.toUpperCase() || 'EN'}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {item.transcript_duration ? formatTime(item.transcript_duration) : '--:--'}</span>
                <span>•</span>
                <span>{segments.length} segments</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={copyFullText} className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-colors" title="Copy full transcript">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Stats */}
        <div className="px-4 py-3 bg-slate-950/50 border-b border-slate-800/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search transcript..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <span className="text-[10px] text-slate-500 font-mono">{filteredSegments.length} / {segments.length} segments</span>
          </div>

          {item.transcript_duration && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span>Duration: {formatTime(item.transcript_duration)}</span>
              {item.transcript_language && <span>Language: {item.transcript_language.toUpperCase()}</span>}
            </div>
          )}
        </div>

        {/* Transcript Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {segments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              <p className="text-sm">No transcript available</p>
              <p className="text-xs mt-1">Generate transcript from video preview</p>
            </div>
          ) : (
            filteredSegments.map((segment, idx) => {
              const originalIndex = segments.indexOf(segment);
              const isActive = originalIndex === currentSegment;
              const isMatch = searchQuery && segment.text.toLowerCase().includes(searchQuery.toLowerCase());

              return (
                <div
                  key={originalIndex}
                  onClick={() => handleSegmentClick(originalIndex, segment)}
                  className={`p-3 rounded-xl transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-cyan-500/10 border-cyan-500/30 shadow-md shadow-cyan-500/10'
                      : 'bg-slate-950/50 border-slate-800/50 hover:bg-slate-900/50'
                  } ${isMatch ? 'ring-1 ring-amber-500/30' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 shrink-0 w-20">
                      <span className="text-[10px] font-mono text-cyan-400 font-medium">{formatTime(segment.start)}</span>
                      <span className="text-[10px] font-mono text-slate-500">→</span>
                      <span className="text-[10px] font-mono text-slate-500">{formatTime(segment.end)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-100 leading-relaxed">
                        {searchQuery && isMatch
                          ? segment.text.replace(
                              new RegExp(`(${searchQuery})`, 'gi'),
                              '<mark class="bg-amber-500/30 text-amber-200 px-0.5 rounded">$1</mark>'
                            )
                          : segment.text}
                      </p>
                      {segment.speaker && (
                        <span className="inline-block mt-1 text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                          Speaker {segment.speaker}
                        </span>
                      )}
                      {segment.confidence !== undefined && (
                        <span className="inline-block mt-1 ml-2 text-[10px] font-mono text-slate-500">
                          Confidence: {Math.round(segment.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); copySegment(segment.text); }}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors shrink-0"
                      title="Copy segment"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* Full text fallback */}
          {segments.length === 0 && fullText && (
            <div className="p-4 bg-slate-950/50 border border-slate-800/50 rounded-xl">
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{fullText}</p>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentSegment >= 0 && (
              <>
                <button onClick={() => setCurrentSegment(p => Math.max(0, p - 1))} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Previous segment"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-[10px] font-mono text-cyan-400 px-2">Segment {currentSegment + 1}</span>
                <button onClick={() => setCurrentSegment(p => Math.min(segments.length - 1, p + 1))} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Next segment"><ChevronRight className="w-4 h-4" /></button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyFullText} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors">
              <Copy className="w-3.5 h-3.5" /> Copy All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}