'use client';

import { useId } from 'react';

/**
 * The Keeva brand mark: the neon gradient "K", drawn as vector.
 *
 * This used to be an <img> of keeva-logo.png (a raster diamond), which meant
 * the app showed two different marks — the SVG K on the loading screen and
 * the raster diamond everywhere else. The loading-screen K is the mark now,
 * so every surface (header, footer, community header, loading spinners, auth
 * pages) renders this one component. Vector also means no 789KB JPEG download
 * and no opaque corners to clip.
 *
 * Gradient ids are per-instance (useId): several marks share one page, and
 * duplicate SVG ids would all resolve to the first definition.
 */
export function KeevaMark({
  className = 'w-10 h-10',
  alt = 'Keeva',
}: {
  /** Tailwind sizing for the outer badge, e.g. "w-11 h-11". */
  className?: string;
  alt?: string;
}) {
  const grad = `keeva-mark-grad-${useId().replace(/:/g, '')}`;

  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-600 p-[1.5px] shadow-lg shadow-cyan-500/25 overflow-hidden ${className}`}
      {...(alt
        ? { role: 'img' as const, 'aria-label': alt }
        : { 'aria-hidden': true as const })}
    >
      <div className="w-full h-full rounded-full overflow-hidden bg-[#06070B] flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-[72%] h-[72%]" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id={grad} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00E5FF" />
              <stop offset="50%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#D946EF" />
            </linearGradient>
          </defs>
          <rect x="26" y="22" width="11" height="56" rx="3" fill={`url(#${grad})`} />
          <path d="M37 50 L68 22 L78 22 L47 50Z" fill={`url(#${grad})`} opacity="0.95" />
          <path d="M37 50 L68 78 L78 78 L47 50Z" fill={`url(#${grad})`} opacity="0.95" />
          <circle cx="44" cy="50" r="4" fill="#00E5FF" opacity="0.9" />
        </svg>
      </div>
    </div>
  );
}
