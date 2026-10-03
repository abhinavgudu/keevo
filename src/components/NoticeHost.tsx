'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { dismissNotice, subscribeNotices, type Notice } from '@/lib/notices';

/**
 * Renders whatever any component has pushed into the notice store.
 *
 * Mounted once at the root, above the toast slot the dashboard already uses, so
 * a failure is visible from every screen rather than only where the action
 * happened. Announced politely because these carry information a screen reader
 * user would otherwise never receive — a silently reverted toggle is invisible
 * to everyone, but it is completely invisible to a non-sighted user.
 */
export function NoticeHost({ offsetClass = '' }: { offsetClass?: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => subscribeNotices(setNotices), []);

  if (!notices.length) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed z-[80] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[calc(100vw-2rem)] max-w-sm ${offsetClass || 'bottom-24 md:bottom-6'}`}
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl border backdrop-blur-xl shadow-lg animate-in fade-in slide-in-from-bottom-3 ${
            notice.kind === 'error'
              ? 'bg-rose-950/90 border-rose-500/40'
              : 'bg-emerald-950/90 border-emerald-500/40'
          }`}
        >
          {notice.kind === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-px" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-px" />
          )}
          <p
            className={`text-[12px] font-semibold leading-snug flex-1 ${
              notice.kind === 'error' ? 'text-rose-100' : 'text-emerald-100'
            }`}
          >
            {notice.message}
          </p>
          <button
            onClick={() => dismissNotice(notice.id)}
            aria-label="Dismiss"
            className="shrink-0 p-0.5 rounded-lg text-white/50 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}