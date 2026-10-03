'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { VaultStorage } from '@/lib/storage';
import { LEGACY_CATEGORY_ALIASES } from '@/lib/categories';
import { Category, MediaType, AspectRatioType } from '@/types/vault';
import { CheckCircle, AlertTriangle, ArrowLeft, Sparkles, Check, X } from 'lucide-react';
import Link from 'next/link';
import { KeevaMark } from '@/components/KeevaMark';
import { LoadingCircle } from '@/components/LoadingCircle';

type Status = 'extracting' | 'review' | 'saving' | 'success' | 'error';

/** What the scrape route handed back, held until the user confirms a category. */
interface PendingItem {
  title: string;
  source_url: string;
  platform: string;
  media_type: MediaType;
  aspect_ratio: AspectRatioType;
  thumbnail_url: string | null;
  description: string;
  detected: { name: string; confidence: 'high' | 'medium' | 'low' } | null;
}

function errorMessageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function ShareTargetContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('extracting');
  const [statusText, setStatusText] = useState('Extracting incoming shared link...');
  const [errorMessage, setErrorMessage] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [pending, setPending] = useState<PendingItem | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');

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

        // Categories come back in parallel with the scrape so the picker can be
        // ready the moment the review step appears.
        const [scrapeRes, cats] = await Promise.all([
          fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl }),
          }),
          VaultStorage.getCategories(),
        ]);
        setCategories(cats);

        let metadata: {
          title: string;
          description: string;
          thumbnail_url: string | null;
          platform: string;
          media_type: MediaType;
          aspect_ratio: AspectRatioType;
        } = {
          title: rawTitle || 'Saved Social Content',
          description: rawText || '',
          thumbnail_url: null,
          platform: 'Web',
          media_type: 'ARTICLE',
          aspect_ratio: 'LANDSCAPE_16_9',
        };
        let detected: PendingItem['detected'] = null;

        if (scrapeRes.ok) {
          const json = await scrapeRes.json();
          if (json.metadata) {
            metadata = json.metadata;
          }
          const name: string | null = json.metadata?.autoCategoryName || null;
          if (name) {
            detected = {
              name,
              confidence: json.metadata?.autoCategoryConfidence || 'low',
            };
          }
        }

        // The scrape route computes a verdict and used to be discarded here, so
        // every share-sheet save landed in Uncategorized no matter how obvious
        // the content was. Carry it through and preselect it, but only when it is
        // not a low-confidence guess — a wrong one is worse than no one.
        if (detected && cats.length > 0) {
          const wanted = LEGACY_CATEGORY_ALIASES[detected.name.toLowerCase()] ?? detected.name;
          const found = cats.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
          if (found && detected.confidence !== 'low') setCategoryId(found.id);
        }

        setPending({
          title: metadata.title || rawTitle || targetUrl,
          source_url: targetUrl,
          platform: metadata.platform || 'Web',
          media_type: metadata.media_type,
          aspect_ratio: metadata.aspect_ratio,
          thumbnail_url: metadata.thumbnail_url,
          description: metadata.description,
          detected,
        });
        setStatus('review');
        setStatusText('Where does this belong?');
      } catch (err) {
        console.error('Share processing error:', err);
        setStatus('error');
        setErrorMessage(errorMessageOf(err, 'Failed to process shared content'));
      }
    }

    processSharedUrl();
  }, [searchParams]);

  const commitSave = useCallback(async () => {
    if (!pending) return;
    setStatus('saving');
    setStatusText('Persisting to your vault...');

    try {
      const savedItem = await VaultStorage.saveItem({
        title: pending.title,
        source_url: pending.source_url,
        platform: pending.platform,
        media_type: pending.media_type,
        aspect_ratio: pending.aspect_ratio,
        thumbnail_url: pending.thumbnail_url,
        priority: 'HIGH', // Mobile shares default to HIGH priority for quick capture
        description: pending.description,
        category_id: categoryId || null,
        auto_category_name: pending.detected?.name,
        auto_category_confidence: pending.detected?.confidence,
      });

      setSavedTitle(savedItem.title);
      setStatus('success');
      setStatusText('Saved to Keeva successfully!');

      setTimeout(() => {
        router.push('/?saved=true');
      }, 1800);
    } catch (err) {
      console.error('Share save error:', err);
      setStatus('error');
      setErrorMessage(errorMessageOf(err, 'Failed to save this item'));
    }
  }, [pending, categoryId, router]);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Glow Background */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 md:p-8 shadow-2xl relative z-10 text-center">
        {/* Header Branding */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <KeevaMark className="w-10 h-10" alt="Keeva" />
          <span className="text-xl font-black tracking-tight text-white">
            Keeva<span className="text-cyan-400"> Auto-Capture</span>
          </span>
        </div>

        {/* Status Indicator */}
        {status !== 'review' && (
          <div className="my-8 flex flex-col items-center justify-center">
            {status === 'extracting' || status === 'saving' ? (
              <LoadingCircle className="w-20 h-20" />
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
        )}

        {/* Status Text */}
        <h2 className="text-lg font-semibold text-white mb-2">{statusText}</h2>
        {savedTitle && (
          <p className="text-xs text-cyan-300/80 font-mono bg-cyan-950/40 border border-cyan-800/40 rounded-lg p-2.5 mb-4 line-clamp-2">
            &quot;{savedTitle}&quot;
          </p>
        )}
        {errorMessage && (
          <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 rounded-lg p-3 mb-4">
            {errorMessage}
          </p>
        )}

        {/* Category picker. Instagram serves a login wall to logged-out fetches, so
            there is no caption to classify and no guess to offer; the choice has to
            come from the user. Every other source arrives here with a verdict
            already preselected, so this is normally a single tap on Save. */}
        {status === 'review' && pending && (
          <div className="mt-5 text-left">
            <p className="text-xs font-mono text-slate-400 bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 mb-4 line-clamp-2">
              &quot;{pending.title}&quot;
            </p>

            {pending.detected && (
              <div className="flex items-start gap-2 mb-3 text-[11px] text-slate-400">
                <Sparkles className="w-3.5 h-3.5 mt-px shrink-0 text-cyan-400" />
                <span>
                  Matched <span className="text-cyan-300 font-semibold">{pending.detected.name}</span>{' '}
                  from the link
                  {pending.detected.confidence === 'low' && ' — a weak guess, so change it below if it looks wrong.'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    categoryId === c.id
                      ? 'border-cyan-500 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: c.color_hex || '#64748B' }}
                  />
                  <span className="truncate">{c.name}</span>
                  {categoryId === c.id && <Check className="w-3 h-3 ml-auto shrink-0" />}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCategoryId('')}
              className={`mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                !categoryId
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              Save without a category
            </button>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                type="button"
                onClick={commitSave}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-white text-sm font-black shadow-lg shadow-cyan-500/25 transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer"
              >
                <Check className="w-4 h-4" /> Save to Keeva
              </button>
            </div>
          </div>
        )}

        {status !== 'review' && (
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-center">
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07090E] flex items-center justify-center text-slate-400">
          <LoadingCircle className="w-8 h-8" />
        </div>
      }
    >
      <ShareTargetContent />
    </Suspense>
  );
}
