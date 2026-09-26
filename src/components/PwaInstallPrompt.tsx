'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, Sparkles, Smartphone, Check, Share } from 'lucide-react';
import confetti from 'canvas-confetti';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker for PWA compliance
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('Keeva PWA SW registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('Keeva PWA SW registration notice:', err);
        });
    }

    // 2. Check if already running in standalone mode (already installed & opened as app)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    const installedFlag = localStorage.getItem('keeva_pwa_installed') === 'true';

    if (isStandalone || installedFlag) {
      setIsInstalled(true);
      return; // Do NOT show prompt if already installed
    }

    // 3. Check snooze time
    const snoozedUntil = localStorage.getItem('keeva_pwa_snoozed_until');
    if (snoozedUntil && Date.now() < Number(snoozedUntil)) {
      return; // Currently snoozed
    }

    // 4. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // If iOS and not standalone, show prompt after a short delay
    if (isIosDevice && !isStandalone) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 2500);
      return () => clearTimeout(timer);
    }

    // 5. Android / Chrome beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Wait 2.5 seconds before popping up so user sees dashboard first
      setTimeout(() => {
        setIsOpen(true);
      }, 2500);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsOpen(false);
      localStorage.setItem('keeva_pwa_installed', 'true');
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        localStorage.setItem('keeva_pwa_installed', 'true');
        setIsInstalled(true);
        setIsOpen(false);
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
      } else {
        // Snooze for 3 days if user dismissed Chrome prompt
        localStorage.setItem(
          'keeva_pwa_snoozed_until',
          (Date.now() + 3 * 24 * 60 * 60 * 1000).toString()
        );
        setIsOpen(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error('PWA install error:', err);
    }
  };

  const handleDismiss = () => {
    // Snooze for 4 days
    localStorage.setItem(
      'keeva_pwa_snoozed_until',
      (Date.now() + 4 * 24 * 60 * 60 * 1000).toString()
    );
    setIsOpen(false);
  };

  if (!isOpen || isInstalled) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-96 animate-in fade-in slide-in-from-bottom-6 duration-300">
      <div className="relative p-4 sm:p-5 rounded-3xl bg-slate-950/95 border border-cyan-500/40 shadow-2xl shadow-cyan-500/20 backdrop-blur-2xl overflow-hidden">
        {/* Ambient Top Glow Line */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-fuchsia-500" />

        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Header with App Logo */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-600 p-[1.5px] shadow-lg shadow-cyan-500/30 shrink-0">
            <div className="w-full h-full bg-[#06070B] rounded-[14px] flex items-center justify-center overflow-hidden p-1.5">
              <img
                src="/keeva-logo.png"
                alt="Keeva App"
                className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]"
              />
            </div>
          </div>
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

        {/* Perks list */}
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

        {/* iOS vs Android Actions */}
        {isIOS ? (
          <div className="space-y-2">
            <div className="p-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-white mb-1">
                <Share className="w-3.5 h-3.5 text-cyan-400" />
                <span>To install on iPhone:</span>
              </div>
              <span>Tap the <strong>Share</strong> button below in Safari, then select <strong>Add to Home Screen ➕</strong>.</span>
            </div>
            <button
              onClick={() => {
                localStorage.setItem('keeva_pwa_installed', 'true');
                setIsOpen(false);
              }}
              className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              I have installed it ✓
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
