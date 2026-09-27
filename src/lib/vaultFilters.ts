/**
 * Query-shaping helpers for the vault list.
 *
 * Kept free of any `@/` import and of the Supabase client so the filter grammar
 * can be exercised directly in a test. The important detail here is that
 * PostgREST accepts only a single `or` parameter — see buildVaultFilter.
 */

export type VaultMediaFilter = 'ALL' | 'REEL' | 'LANDSCAPE' | 'PDF' | 'MUST_LEARN' | 'FAVORITES';
export type VaultSortOption = 'PRIORITY_DESC' | 'NEWEST' | 'ACCESS_COUNT' | 'TITLE_ASC';

export interface ItemQueryOptions {
  /** null/undefined means "all categories" — deliberately not a filter. */
  categoryId?: string | null;
  search?: string;
  mediaType?: VaultMediaFilter;
  limit?: number;
}

export interface CategoryCounts {
  counts: Record<string, number>;
  total: number;
  uncategorized: number;
}

/**
 * Sentinel id for the "Uncategorized" pill. It is not a real category id — most
 * saved posts land here before classification, so without it those posts would be
 * invisible in the pill row even though the counts are on screen.
 */
export const UNCATEGORIZED_ID = '__uncategorized__';

// Each entry is one OR-group. The REEL/PDF/MUST_LEARN tabs are genuinely
// disjunctions across two columns, so they cannot be expressed as chained
// equality filters.
export const MEDIA_FILTER_GROUPS: Record<Exclude<VaultMediaFilter, 'ALL'>, string[]> = {
  MUST_LEARN: ['priority.eq.MUST_LEARN', 'priority_score.gte.100'],
  REEL: ['aspect_ratio.eq.PORTRAIT_9_16', 'media_type.eq.REEL'],
  LANDSCAPE: ['aspect_ratio.eq.LANDSCAPE_16_9'],
  PDF: ['media_type.eq.DOCUMENT', 'aspect_ratio.eq.STANDARD_DOCUMENT'],
  FAVORITES: ['is_favorite.eq.true'],
};

/**
 * PostgREST parses the `or=` value as a comma/paren separated expression, so any
 * of these characters typed into the search box would corrupt the whole filter
 * and 400 the request. Stripping them is lossy for exotic queries but keeps
 * search from ever breaking the vault.
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()%'"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Returns the bare value for a PostgREST `or` parameter, or null when no
 * disjunctive condition is needed (the caller then omits `.or()` entirely).
 *
 * PostgREST supports a single `or` parameter — a second `.or()` call overwrites
 * the first, so a naive search + media-type combination would silently drop one
 * of the two. Nesting each condition as an `and(...)` group inside the one `or`
 * preserves the AND-of-ORs semantics: exactly one group can match, so
 * `and(search),and(media)` is equivalent to `search AND media`.
 */
export function buildVaultFilter(
  options: ItemQueryOptions,
  opts: { includeTags?: boolean } = {}
): string | null {
  const groups: string[][] = [];

  const term = sanitizeSearchTerm(options.search ?? '');
  if (term) {
    const like = `%${term}%`;
    // Scalar text columns support substring matching.
    const clauses = ['title', 'description', 'platform', 'notes'].map(
      (c) => `${c}.ilike.${like}`
    );
    // `tags` is TEXT[] and has no `~~*` operator — `tags.ilike.…` fails with
    // "operator does not exist: text[] ~~* unknown". `cs` (contains) is the
    // array operator PostgREST does support, and it covers the flow that
    // actually matters here: clicking a tag searches for that exact tag.
    // The value is double-quoted so a multi-word tag stays one array element.
    if (opts.includeTags !== false) clauses.push(`tags.cs.{"${term}"}`);
    groups.push(clauses);
  }

  const media =
    options.mediaType && options.mediaType !== 'ALL'
      ? MEDIA_FILTER_GROUPS[options.mediaType]
      : null;
  if (media) groups.push(media);

  if (groups.length === 0) return null;
  if (groups.length === 1) return groups[0].join(',');
  return groups.map((g) => `and(${g.join(',')})`).join(',');
}
