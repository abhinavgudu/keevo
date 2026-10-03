'use client';

import { useEffect, useRef, useState } from 'react';
import { Share2, Check } from 'lucide-react';

/**
 * Share a link, using whatever the browser actually offers.
 *
 * `navigator.share` is the real path where it exists — it is the only route to
 * WhatsApp, Telegram or Mail without shipping a share target per app. It is
 * absent on most desktop browsers, so the clipboard is the fallback rather than
 * the alternative, and the button means the same thing either way.
 *
 * Two failure modes are handled deliberately:
 *
 *  - The user dismissing the sheet rejects with AbortError. That is a cancel,
 *    not a failure, so nothing is shown — claiming "Link copied" would be false.
 *  - Any other rejection (no share target, denied permission) falls through to
 *    the clipboard, which is what the user wanted anyway.
 *
 * A clipboard write that itself fails is silent on purpose: the URL is in the
 * address bar and selectable, and an error the user cannot act on is noise.
 */
export function ShareLinkButton({
  url,
  title,
  text,
  label = 'Share',
  className = '',
  iconClassName = 'w-3.5 h-3.5',
}: {
  /** Absolute URL. Resolve site-relative paths at the call site, or below. */
  url: string;
  /** Share sheet title, usually the thing's name. */
  title: string;
  /** The line that travels with the link. */
  text?: string;
  /** Button text. */
  label?: string;
  className?: string;
  iconClassName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        // Falls through to the clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* nothing actionable to say */
    }
  };

  return (
    <button
      onClick={share}
      title={copied ? 'Link copied' : label}
      aria-label={copied ? 'Link copied' : label}
      className={className}
    >
      {copied ? <Check className={`${iconClassName} text-emerald-400`} /> : <Share2 className={iconClassName} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

/**
 * Absolute URL for a site-relative path.
 *
 * Called only from click handlers and render bodies that already run on the
 * client — `location` does not exist during SSR, so resolving the origin inside
 * an effect would mean the button either flashes in or waits on a mount flag.
 */
export function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}