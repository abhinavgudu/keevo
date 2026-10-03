/**
 * Client-side search and ranking for the vault list.
 *
 * Why this lives on the client instead of in the query: the previous filter
 * pushed `title.ilike.%q%` (and friends) to PostgREST on every keystroke. That
 * cost a network round trip per character, could not rank anything (rows came
 * back in `created_at` order, so an exact title hit could sit below an
 * incidental hit in the description), and a one-letter query was the worst case
 * — the widest possible scan over the whole table. A personal vault is a few
 * hundred to a few thousand rows, which fits in memory comfortably, so the list
 * is fetched once and every keystroke is scored in-process: instant, ranked, and
 * identical for a single letter as for a whole phrase.
 *
 * Pure and dependency-free on purpose so the ranking can be exercised directly.
 */

import type { ContentItem } from '@/types/vault';

/** Minimum query length before a search is treated as intentional. */
export const MIN_QUERY_LENGTH = 1;

interface Field {
  key: string;
  label: string;
  weight: number;
  get: (item: ContentItem) => string;
}

/**
 * Weighted fields, most significant first. Order also decides which field's
 * snippet is reported for a hit, so title/caption come before the long text
 * columns.
 */
const FIELDS: Field[] = [
  { key: 'title', label: 'Title', weight: 10, get: (i) => i.title || '' },
  { key: 'tags', label: 'Tags', weight: 8, get: (i) => (i.tags || []).join(' ') },
  { key: 'category', label: 'Category', weight: 6, get: (i) => i.category?.name || '' },
  {
    key: 'caption',
    label: 'Caption',
    weight: 5,
    get: (i) => (i.is_public ? i.community_caption || '' : ''),
  },
  { key: 'notes', label: 'Notes', weight: 4, get: (i) => i.notes || '' },
  { key: 'description', label: 'Description', weight: 3, get: (i) => i.description || '' },
  { key: 'platform', label: 'Platform', weight: 2, get: (i) => i.platform || '' },
  { key: 'transcript', label: 'Transcript', weight: 1, get: (i) => i.transcript_text || '' },
];

export interface MatchField {
  key: string;
  label: string;
  snippet: string;
}

/** A window around the first occurrence of a token, with ellipses at the cut. */
function snippetAround(text: string, index: number): string {
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + 55);
  const slice = text.slice(start, end);
  return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`;
}

function normalize(text: string): string {
  return text.toLowerCase();
}

/**
 * Position bonus: a hit at a word boundary outranks the same word buried
 * mid-sentence, and a prefix outranks both. This is what makes typing the first
 * few letters of a title surface that title first instead of an arbitrary row.
 */
function positionBonus(hay: string, at: number): number {
  const before = at === 0 ? ' ' : hay[at - 1];
  if (at === 0) return 4;
  if (before === ' ' || before === '-' || before === '_' || before === '.' || before === '/') return 3;
  return 0;
}

interface ScoredField {
  key: string;
  label: string;
  score: number;
  index: number;
}

/**
 * Scores one item against the whole query.
 *
 * Multi-token queries are AND-ed: every whitespace-separated token must appear
 * somewhere, which is what makes narrowing a search actually narrow it. Returns
 * `score: 0` when a token is missing entirely.
 */
export function scoreItem(item: ContentItem, query: string): { score: number; matched: MatchField[] } {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { score: 0, matched: [] };

  // Cache the normalized field text once per item instead of per token.
  const texts = FIELDS.map((f) => ({ ...f, hay: normalize(f.get(item)) })).filter((f) => f.hay);

  let total = 0;
  const hits: ScoredField[] = [];

  for (const token of tokens) {
    let tokenScore = 0;
    let best: ScoredField | null = null;

    for (const field of texts) {
      const at = field.hay.indexOf(token);
      if (at < 0) continue;
      // Tag and title matches are worth more the closer they sit to the start.
      const score = field.weight + positionBonus(field.hay, at);
      tokenScore += score;
      if (!best || score > best.score) best = { key: field.key, label: field.label, score, index: at };
    }

    // AND across tokens: one missing token means this item is not a result.
    if (tokenScore === 0) return { score: 0, matched: [] };
    total += tokenScore;
    if (best) hits.push(best);
  }

  // Short queries matching long titles are less likely to be what the user meant
  // than the same token matching a tight field, so prefer many distinct fields.
  total += hits.length;

  const matched: MatchField[] = hits.map(({ key, label, index }) => {
    const field = texts.find((t) => t.key === key)!;
    return { key, label, snippet: snippetAround(field.hay, index) };
  });

  return { score: total, matched };
}

/**
 * Filters and ranks `items` for `query`.
 *
 * An empty query returns the input untouched — no scoring, no reordering — so
 * the unfiltered list keeps whatever order its caller chose.
 */
export function searchItems(items: ContentItem[], query: string): ContentItem[] {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return items;

  const scored: Array<{ item: ContentItem; score: number }> = [];
  for (const item of items) {
    const { score } = scoreItem(item, trimmed);
    if (score > 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

/** Like searchItems, but keeps the matched fields so a card can show them. */
export function searchItemsWithMatches(
  items: ContentItem[],
  query: string
): Array<{ item: ContentItem; score: number; matched: MatchField[] }> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return items.map((item) => ({ item, score: 0, matched: [] }));

  const out: Array<{ item: ContentItem; score: number; matched: MatchField[] }> = [];
  for (const item of items) {
    const { score, matched } = scoreItem(item, trimmed);
    if (score > 0) out.push({ item, score, matched });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}