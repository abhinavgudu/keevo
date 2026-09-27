'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, X, Sparkles, Smartphone, Check, Share, MoreVertical, Plus, Monitor } from 'lucide-react';
import confetti from 'canvas-confetti';
import { KeevaMark } from '@/components/KeevaMark';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const LS_INSTALLED = 'keeva_pwa_installed';
const LS_MANUAL_UNTIL = 'keeva_pwa_confirmed_until';

/** First ask waits long enough for the dashboard to paint first. */
const FIRST_SHOW_DELAY = 2500;

/**
 * Re-ask cadence after a dismissal, in ms. The old code snoozed for three to
 * four days, which is why the prompt never came back. This escalates and then
 * holds at five minutes: it keeps returning until the app is installed without
 * turning a corner card into a modal hostage situation. The index resets on
 * every fresh page load, so a new visit asks again straight away.
 */
const REASK_DELAYS = [45_000, 90_000, 180_000, 300_000];

/**
 * iOS has no install API: Safari never fires beforeinstallprompt, so the only
 * signal is navigator.standalone, which is only true while the app is actually
 * running from the home screen. A visitor who installs and then browses in a
 * normal tab is indistinguishable from one who never installed, so their
 * confirmation is honoured for a week rather than forever - a permanent flag
 * would be a silent dead end if they tapped it by mistake.
 */
const CONFIRM_SUPPRESS_MS = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia.bind(window);
  return (
    mm('(display-mode: standalone)').matches ||
    mm('(display-mode: fullscreen)').matches ||
    mm('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type Platform = 'ios' | 'android' | 'safari' | 'desktop' | 'firefox';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop';
  const ua = window.navigator.userAgent;
  const low = ua.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(low) && !(low.includes('msstream'));
  // iPadOS 13+ reports itself as a desktop Mac; touch points are the tell.
  const isIpadOs = !isIos && /macintosh/.test(low) && (window.navigator.maxTouchPoints || 0) > 1;
  if (isIos || isIpadOs) return 'ios';
  if (/android/.test(low)) return 'android';
  if (/firefox|fxios/.test(low)) return 'firefox';
  if (/crios|chrome/.test(low)) return 'desktop';
  if (/safari/.test(low)) return 'safari';
  return 'desktop';
}

/** Manual steps, shown whenever the native prompt is not available. */
function installHint(platform: Platform): { label: string; steps: string } {
  switch (platform) {
    case 'ios':
      return {
        label: 'On iPhone/iPad',
        steps: 'Tap Share in Safari, then Add to Home Screen.',
      };
    case 'android':
      return {
        label: 'On Android',
        steps: 'Open the browser menu, then choose Install app.',
      };
    case 'safari':
      return {
        label: 'On Safari',
        steps: 'Use File > Add to Dock, or Share > Add to Home Screen.',
      };
    case 'firefox':
      return {
        label: 'On Firefox',
        steps: 'Firefox desktop cannot install web apps. Open this page on your phone to install it.',
      };
    default:
      return {
        label: 'On this browser',
        steps: 'Use the install icon in the address bar, or the browser menu > Install app.',
      };
  }
}

export function PwaInstallPrompt() {
  // Lazy initialisers keep the first detection out of an effect, so nothing
  // sets state synchronously on mount.
  const [platform] = useState<Platform>(() => detectPlatform());
  const [installed, setInstalled] = useState<boolean>(() => isStandaloneMode());
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const askIndex = useRef(0);
  const reaskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const hint = useMemo(() => installHint(platform), [platform]);

  // once the native prompt has been spent it can never fire again this session
  const [promptSpent, setPromptSpent] = useState(false);
  const canPrompt = deferred !== null && !promptSpent;

  const clearReask = useCallback(() => {
    if (reaskTimer.current) {
      clearTimeout(reaskTimer.current);
      reaskTimer.current = null;
    }
  }, []);

  /** Suppressed because the user says they already installed (iOS only). */
  const confirmedUntil = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const until = Number(localStorage.getItem(LS_MANUAL_UNTIL) || 0);
    return Number.isFinite(until) && until > 0 && Date.now() < until;
  }, []);

  const show = useCallback(() => {
    if (!mounted.current) return;
    if (isStandaloneMode()) {
      setInstalled(true);
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
  }, []);

  const scheduleReask = useCallback(() => {
    clearReask();
    const delay = REASK_DELAYS[Math.min(askIndex.current, REASK_DELAYS.length - 1)];
    askIndex.current += 1;
    reaskTimer.current = setTimeout(show, delay);
  }, [clearReask, show]);

  // Register the service worker once.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.warn('Keeva PWA SW registration notice:', err));
    }
  }, []);

  // Install detection + prompt plumbing.
  useEffect(() => {
    mounted.current = true;

    // A stale flag from a previous visit must not silence the prompt: the app
    // can have been uninstalled, so isStandaloneMode is the only source of
    // truth. `installed` already reflects it via the lazy initialiser.
    if (isStandaloneMode()) {
      return () => { mounted.current = false; };
    }

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayMode = () => {
      // Fired when the user installs from another tab, or launches the app.
      if (isStandaloneMode()) {
        setInstalled(true);
        setIsOpen(false);
        clearReask();
      }
    };
    media.addEventListener?.('change', onDisplayMode);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setPromptSpent(false);
      // If we were waiting out a dismissal, ask now that we can act.
      if (mounted.current && !isStandaloneMode()) {
        clearReask();
        setIsOpen(true);
      }
    };

    const onInstalled = () => {
      setInstalled(true);
      setIsOpen(false);
      clearReask();
      try { localStorage.setItem(LS_INSTALLED, 'true'); localStorage.removeItem(LS_MANUAL_UNTIL); } catch {}
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS has no event, so ask on our own schedule.
    if (platform === 'ios' && !confirmedUntil()) {
      const first = setTimeout(show, FIRST_SHOW_DELAY);
      reaskTimer.current = first;
    }

    const onVisibility = () => {
      // Coming back to the tab is a natural moment to ask again.
      if (document.visibilityState === 'visible' && !reaskTimer.current && !isStandaloneMode()) {
        scheduleReask();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted.current = false;
      media.removeEventListener?.('change', onDisplayMode);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      document.removeEventListener('visibilitychange', onVisibility);
      clearReask();
    };
    // Intentionally mount-only: re-running would re-arm a spent prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android / desktop: the native event may never arrive (already dismissed in
  // a past session, or the browser does not support it). Keep asking anyway.
  useEffect(() => {
    if (installed) return;
    if (platform === 'ios') return; // handled above
    if (confirmedUntil()) return;
    if (reaskTimer.current) return; // already counting down
    reaskTimer.current = setTimeout(show, FIRST_SHOW_DELAY);
    return clearReask;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, installed]);

  const handleInstallClick = useCallback(async () => {
    if (!deferred) {
      scheduleReask();
      return;
    }
    // A prompt() can only be called once; mark it spent first so a double
    // click cannot throw, and fall back to the manual steps afterwards.
    setPromptSpent(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setIsOpen(false);
        try { localStorage.setItem(LS_INSTALLED, 'true'); localStorage.removeItem(LS_MANUAL_UNTIL); } catch {}
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
      } else {
        scheduleReask();
      }
    } catch (err) {
      console.error('PWA install error:', err);
      scheduleReask();
    }
  }, [deferred, scheduleReask]);

  /** Dismiss: come back shortly, do not hide for days. */
  const handleDismiss = useCallback(() => {
    setIsOpen(false);
    scheduleReask();
  }, [scheduleReask]);

  /** iOS: the visitor says they installed it. */
  const handleConfirmInstalled = useCallback(() => {
    try {
      localStorage.setItem(LS_INSTALLED, 'true');
      localStorage.setItem(LS_MANUAL_UNTIL, (Date.now() + CONFIRM_SUPPRESS_MS).toString());
    } catch {}
    setIsOpen(false);
    clearReask();
  }, [clearReask]);

  // Hidden: already installed, dismissed for now, or the visitor confirmed.
  const suppressed = useMemo(() => {
    if (installed || isStandaloneMode()) return true;
    if (platform === 'ios' && confirmedUntil()) return true;
    return false;
  }, [installed, platform, confirmedUntil]);

  if (suppressed || !isOpen) return null;

  const showNativeButton = canPrompt;
  const Icon = platform === 'ios' ? Share : platform === 'firefox' ? Monitor : platform === 'android' ? MoreVertical : Download;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-96 animate-in fade-in slide-in-from-bottom-6 duration-300">
      <div className="relative p-4 sm:p-5 rounded-3xl bg-slate-950/95 border border-cyan-500/40 shadow-2xl shadow-cyan-500/20 backdrop-blur-2xl overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-fuchsia-500" />

        <button
          onClick={handleDismiss}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Not now"
          aria-label="Not now"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <KeevaMark className="w-12 h-12 shrink-0" alt="Keeva App" />
          <div className="min-w-0 pr-6">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-black text-white tracking-tight">Install Keeva App</h4>
              <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                PWA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">Fast 1-click mobile access & full-screen reels</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-800/80 font-mono">
            <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">Full 9:16 Reels</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-800/80 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
            <span className="truncate">Offline Access</span>
          </div>
        </div>

        {platform === 'ios' ? (
          <div className="space-y-2">
            <div className="p-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-white mb-1">
                <Share className="w-3.5 h-3.5 text-cyan-400" />
                <span>To install on iPhone/iPad:</span>
              </div>
              <span>Tap the <strong>Share</strong> button in Safari, then select <strong>Add to Home Screen</strong>.</span>
            </div>
            <button
              onClick={handleConfirmInstalled}
              className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 inline mr-1.5" />
              I have installed it
            </button>
          </div>
        ) : showNativeButton ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Later
            </button>
            <button
              onClick={handleInstallClick}
              className="flex-[2] py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-1.5 active:scale-95 transition-all border border-white/20 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Install Now</span>
            </button>
          </div>
        ) : (
          /* No native prompt left to call. This used to be a dead end: the card
             said "Install Now" and did nothing, because beforeinstallprompt can
             only fire once per session. Give real steps instead. */
          <div className="space-y-2">
            <div className="p-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-white mb-1">
                <Icon className="w-3.5 h-3.5 text-cyan-400" />
                <span>{hint.label}</span>
              </div>
              <span>{hint.steps}</span>
            </div>
            <button
              onClick={handleDismiss}
              className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 inline mr-1.5" />
              Got it, remind me later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
