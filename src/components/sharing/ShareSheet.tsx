'use client';

import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { LinkQrCode } from '@/components/sharing/LinkQrCode';
import { ShareLinkButton, absoluteUrl } from '@/components/sharing/ShareLinkButton';

/**
 * Share sheet: a QR code, plus the native share and copy actions.
 *
 * Both actions sit above the code on purpose. Scanning is for the person standing
 * in front of you; sending is for the person who is not. Leading with the QR
 * would make the button people actually reach for the slowest to find.
 *
 * The PNG export renders the code offscreen through a canvas rather than saving
 * the SVG, because "Save as image" on an iPhone offers no SVG option and a file
 * that cannot be saved on the platform people share from is not really an export.
 */
export function ShareSheet({
  open,
  onClose,
  path,
  title,
  subtitle,
  fileName,
}: {
  open: boolean;
  onClose: () => void;
  /** Site-relative path, resolved to an absolute URL on the client. */
  path: string;
  title: string;
  /** One line under the title, e.g. a headline or handle. */
  subtitle?: string | null;
  /** Base name for the downloaded PNG, without an extension. */
  fileName: string;
}) {
  // Derived, not stored: the sheet only ever renders after the user opened it,
  // which is necessarily after mount, so `location` is available here and never
  // during SSR. Deriving also means a changed `path` cannot leave a stale URL on
  // screen.
  const url = open && typeof window !== 'undefined' ? absoluteUrl(path) : '';

  // Escape closes the sheet, matching every other dialog in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !url) return null;

  const download = () => {
    // The wrapper is a div; the code itself is the svg inside it. Serializing the
    // wrapper would hand the Image a div, which renders as nothing.
    const holder = document.getElementById('keeva-share-qr');
    const svg = holder?.querySelector('svg');
    if (!svg) return;

    const source = new XMLSerializer().serializeToString(svg);

    // A serialized inline svg has no intrinsic size once drawn to a canvas, so
    // the export size is forced here.
    //
    // The existing width/height are REPLACED, never prepended to. SVG is XML, and
    // a duplicate attribute is a fatal parse error — the browser rejects the
    // whole image rather than picking one, which surfaces as an export that
    // silently downloads nothing. The viewBox is left exactly as generated for
    // the same reason: rewriting it to a guessed value would rescale the code
    // into something unscannable.
    const sized = source
      .replace(/\swidth="[^"]*"/, ' width="512"')
      .replace(/\sheight="[^"]*"/, ' height="512"');

    const blob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Explicit white: the page background is near-black, and a transparent QR
      // saved to disk would be unreadable in most image viewers.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      URL.revokeObjectURL(blobUrl);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${fileName}.png`;
      a.click();
    };
    img.onerror = () => URL.revokeObjectURL(blobUrl);
    img.src = blobUrl;
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop closes it, so
        // a drag that ends outside the sheet does not dismiss it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${title}`}
        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-5 relative"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-black text-white truncate pr-8">{title}</h2>
        {subtitle && <p className="text-[13px] text-slate-400 truncate mt-0.5">{subtitle}</p>}

        <div className="mt-4 flex justify-center">
          <div id="keeva-share-qr" className="inline-flex">
            <LinkQrCode value={url} size={176} />
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-500 font-mono break-all">
          {url}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <ShareLinkButton
            url={url}
            title={title}
            text={subtitle ?? undefined}
            label="Share"
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold hover:from-cyan-400 hover:to-indigo-500 transition-all active:scale-95"
          />
          <button
            onClick={download}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5" /> Save PNG
          </button>
        </div>

        <p className="mt-3 text-[11px] text-slate-500 text-center">
          Scan the code, or share the link directly.
        </p>
      </div>
    </div>
  );
}