import { CATEGORY_TAXONOMY } from './categories';
import type { PriorityLevel } from '@/types/vault';

export type { PriorityLevel };

export interface ClassificationInput {
  title?: string | null;
  description?: string | null;
  platform?: string | null;
  url?: string | null;
  tags?: string[] | null;
}

export interface ClassificationResult {
  /** Null when the evidence is too weak or too close to call. */
  categoryName: string | null;
  confidence: 'high' | 'medium' | 'low';
  /** 0-100, useful for telling the user how sure the guess is. */
  score: number;
  tags: string[];
  priority: PriorityLevel;
  /** Every category that scored, best first. Useful for a "did you mean" picker. */
  ranked: { name: string; score: number }[];
}

const STRONG_SCORE = 3;
const WEAK_SCORE = 1;
const DOMAIN_SCORE = 4;

// How much each source is trusted. A hashtag is a deliberate self-declaration by
// the author, so it outweighs a stray word in a scraped meta description.
const SOURCE_WEIGHT = {
  title: 3,
  hashtag: 4,
  description: 1,
  domain: 2,
} as const;

// Below this the classifier refuses to guess. Better to leave a post
// uncategorised and ask than to confidently mis-file it, which is what the old
// substring matcher did to almost everything.
const MIN_SCORE = 3;

// A single generic word is not evidence. "build", "review", "design" and "show"
// each sit in some category's weak list, so one weak hit has to be corroborated
// by another before it can decide anything. Any strong hit is decisive on its own.
const MIN_WEAK_HITS_WITHOUT_STRONG = 2;

// If the runner-up is this close, the evidence genuinely does not separate the
// two categories and guessing would be misleading.
const AMBIGUITY_RATIO = 0.85;

const keywordCache = new Map<string, RegExp>();

function keywordRegex(keyword: string): RegExp {
  const cached = keywordCache.get(keyword);
  if (cached) return cached;

  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \b boundaries only work for terms that start and end on a word character;
  // "c++" and "ui/ux" need lookarounds instead.
  const startsWord = /^\w/.test(keyword);
  const endsWord = /\w$/.test(keyword);
  const prefix = startsWord ? '\\b' : '(?<![\\w])';
  const suffix = endsWord ? '\\b' : '(?![\\w])';

  const re = new RegExp(`${prefix}${escaped}${suffix}`, 'i');
  keywordCache.set(keyword, re);
  return re;
}

function normalize(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/[#•·—–]/g, ' ')
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractHashtags(...sources: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const match of source.matchAll(/#([\p{L}\p{N}_]{2,30})/gu)) {
      out.add(match[1].toLowerCase());
    }
  }
  return [...out];
}

function extractDomain(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hostMatches(domain: string, knownHost: string): boolean {
  if (!domain) return false;
  return domain === knownHost || domain.endsWith(`.${knownHost}`);
}

export function classifyContent(input: ClassificationInput): ClassificationResult {
  const rawTitle = input.title || '';
  const rawDescription = input.description || '';
  const domain = extractDomain(input.url);
  const hashtags = [...new Set([...extractHashtags(rawTitle, rawDescription), ...(input.tags || []).map((t) => t.toLowerCase())])];

  const haystacks: { text: string; weight: number }[] = [
    { text: normalize(rawTitle), weight: SOURCE_WEIGHT.title },
    { text: normalize(hashtags.join(' ')), weight: SOURCE_WEIGHT.hashtag },
  ];
  // An empty description carries no signal and only dilutes the source weight.
  if (normalize(rawDescription)) {
    haystacks.push({ text: normalize(rawDescription), weight: SOURCE_WEIGHT.description });
  }

  const scores = new Map<string, number>();
  const strongHits = new Map<string, number>();
  const weakHits = new Map<string, number>();
  const anchorTier = new Map<string, number>();
  const matchedTags = new Set<string>();

  const addScore = (name: string, value: number) => {
    scores.set(name, (scores.get(name) || 0) + value);
  };
  const bump = (m: Map<string, number>, name: string) => {
    m.set(name, (m.get(name) || 0) + 1);
  };
  // How well-evidenced a category is, which is not the same as how high it
  // scored. A known domain is a deliberate signal; a keyword in the title is
  // strong; a keyword in a scraped meta description is weak, because that text
  // is often boilerplate that merely mentions the technology.
  const raiseTier = (name: string, tier: number) => {
    anchorTier.set(name, Math.max(anchorTier.get(name) || 0, tier));
  };

  for (const def of CATEGORY_TAXONOMY) {
    for (const { text, weight } of haystacks) {
      if (!text) continue;
      const keywordTier = weight >= SOURCE_WEIGHT.title ? 1 : 0;

      for (const keyword of def.strong) {
        if (keywordRegex(keyword).test(text)) {
          addScore(def.name, STRONG_SCORE * weight);
          bump(strongHits, def.name);
          raiseTier(def.name, keywordTier);
          matchedTags.add(keyword);
        }
      }
      for (const keyword of def.weak) {
        if (keywordRegex(keyword).test(text)) {
          addScore(def.name, WEAK_SCORE * weight);
          bump(weakHits, def.name);
        }
      }
    }

    if (def.domains.some((known) => hostMatches(domain, known))) {
      addScore(def.name, DOMAIN_SCORE * SOURCE_WEIGHT.domain);
      bump(strongHits, def.name);
      raiseTier(def.name, 2);
    }
  }

  const qualified = (name: string) => {
    if ((strongHits.get(name) || 0) > 0) return true;
    return (weakHits.get(name) || 0) >= MIN_WEAK_HITS_WITHOUT_STRONG;
  };

  const ranked = [...scores.entries()]
    .filter(([name]) => qualified(name))
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0 || ranked[0].score < MIN_SCORE) {
    return {
      categoryName: null,
      confidence: 'low',
      score: 0,
      tags: [],
      priority: 'MEDIUM',
      ranked: [],
    };
  }

  const best = ranked[0];
  const runnerUp = ranked[1];

  // Two candidates that are both well-evidenced and close together mean the
  // evidence genuinely does not separate them, so refuse to guess. But a weaker-
  // evidenced runner-up must not veto a stronger one: a domain like github.com
  // says "Dev & Software" outright, and four stray keywords in a scraped meta
  // description were previously enough to make it "needs a category" forever.
  const tooClose = runnerUp
    ? (anchorTier.get(runnerUp.name) || 0) >= (anchorTier.get(best.name) || 0) &&
      runnerUp.score >= best.score * AMBIGUITY_RATIO
    : false;

  if (tooClose) {
    return {
      categoryName: null,
      confidence: 'low',
      score: Math.round((best.score / (best.score + 2)) * 100),
      tags: [],
      priority: 'MEDIUM',
      ranked,
    };
  }

  const confidence: ClassificationResult['confidence'] =
    best.score >= 8 ? 'high' : best.score >= 5 ? 'medium' : 'low';

  return {
    categoryName: best.name,
    confidence,
    score: Math.min(100, Math.round((best.score / (best.score + 6)) * 100)),
    tags: [...matchedTags].slice(0, 6),
    priority: confidence === 'high' ? 'MUST_LEARN' : confidence === 'medium' ? 'HIGH' : 'MEDIUM',
    ranked,
  };
}
