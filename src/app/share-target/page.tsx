'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { VaultStorage } from '@/lib/storage';
import { CheckCircle, AlertTriangle, Loader2, Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function ShareTargetContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'extracting' | 'saving' | 'success' | 'error'>('extracting');
  const [statusText, setStatusText] = useState('Extracting incoming shared link...');
  const [errorMessage, setErrorMessage] = useState('');
  const [savedTitle, setSavedTitle] = useState('');

  useEffect(() => {
    async function processSharedUrl() {
      const rawUrl = searchParams.get('url');
      const rawText = searchParams.get('text');
      const rawTitle = searchParams.get('title');

      // Extract URL from url or text parameter (some mobile apps put URL inside text)
      let targetUrl = rawUrl || '';
      if (!targetUrl && rawText) {
        const urlMatch = rawText.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          targetUrl = urlMatch[0];
        } else if (rawText.startsWith('http')) {
          targetUrl = rawText;
        }
      }

      if (!targetUrl) {
        setStatus('error');
        setErrorMessage('No valid URL was detected from the mobile share sheet.');
        return;
      }

      try {
        setStatusText('Fetching OpenGraph metadata & computing aspect ratio...');
        
        const scrapeRes = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        });

        let metadata = {
          title: rawTitle || 'Saved Social Content',
          description: rawText || '',
          thumbnail_url: null,
          platform: 'Web',
          media_type: 'ARTICLE' as const,
          aspect_ratio: 'LANDSCAPE_16_9' as const,
          source_url: targetUrl,
        };

        if (scrapeRes.ok) {
          const json = await scrapeRes.json();
          if (json.metadata) {
            metadata = json.metadata;
          }
        }

        setStatus('saving');
        setStatusText('Calculating automated priority score & persisting...');

        const savedItem = await VaultStorage.saveItem({
          title: metadata.title || rawTitle || targetUrl,
          source_url: targetUrl,
          platform: metadata.platform || 'Web',
          media_type: metadata.media_type,
          aspect_ratio: metadata.aspect_ratio,
          thumbnail_url: metadata.thumbnail_url,
          priority: 'HIGH', // Mobile shares default to HIGH priority for quick capture
          description: metadata.description,
        });

        setSavedTitle(savedItem.title);
        setStatus('success');
        setStatusText('Saved to VaultX successfully!');

        // Redirect after 1.8 seconds
        setTimeout(() => {
          router.push('/?saved=true');
        }, 1800);
      } catch (err: any) {
        console.error('Share processing error:', err);
        setStatus('error');
        setErrorMessage(err.message || 'Failed to process shared content');
      }
    }

    processSharedUrl();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Glow Background */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 md:p-8 shadow-2xl relative z-10 text-center">
        {/* Header Branding */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Vault<span className="text-cyan-400">X</span> Auto-Capture
          </span>
        </div>

        {/* Status Indicator */}
        <div className="my-8 flex flex-col items-center justify-center">
          {status === 'extracting' || status === 'saving' ? (
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
              <Loader2 className="w-8 h-8 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
            </div>
          ) : status === 'success' ? (
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20 animate-bounce">
              <CheckCircle className="w-10 h-10" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/20">
              <AlertTriangle className="w-10 h-10" />
            </div>
          )}
        </div>

        {/* Status Text */}
        <h2 className="text-lg font-semibold text-white mb-2">{statusText}</h2>
        {savedTitle && (
          <p className="text-xs text-cyan-300/80 font-mono bg-cyan-950/40 border border-cyan-800/40 rounded-lg p-2.5 mb-4 line-clamp-2">
            "{savedTitle}"
          </p>
        )}
        {errorMessage && (
          <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 rounded-lg p-3 mb-4">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-center">
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07090E] flex items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <ShareTargetContent />
    </Suspense>
  );
}
