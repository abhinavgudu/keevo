import { Category, ContentItem, VaultStats, calculatePriorityScore, SaveItemInput } from '@/types/vault';
import { getSupabaseClient } from './supabase';
import {
  buildVaultFilter,
  UNCATEGORIZED_ID,
  type CategoryCounts,
  type ItemQueryOptions,
} from './vaultFilters';
import { autoCategoryColor, resolveCategoryName, taxonomyVisual } from './categories';
import { cacheItems, patchCachedNotes, readCachedItems } from './offlineStore';
import { noteOfflineSource, noteOnlineSource } from './connectivity';

export {
  buildVaultFilter,
  sanitizeSearchTerm,
  UNCATEGORIZED_ID,
  MEDIA_FILTER_GROUPS,
} from './vaultFilters';
export type {
  CategoryCounts,
  ItemQueryOptions,
  VaultMediaFilter,
  VaultSortOption,
} from './vaultFilters';


// Auth user context — set from AuthContext on login
let _currentUserId: string | null = null;

export function setVaultUserId(uid: string | null) {
  _currentUserId = uid;
}

/** The signed-in member, or '' when signed out. Used to key the offline cache. */
export function getVaultUserId(): string {
  return _currentUserId || '';
}

export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl.trim());
    u.searchParams.delete('igsh');
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('feature');
    u.searchParams.delete('si');
    // Instagram's share sheet appends a per-session token, so the same reel
    // arrives under a different URL every time it is shared. It identifies
    // nothing about the post. `img_index` is deliberately left alone: within a
    // carousel it selects a different image, which is different content.
    u.searchParams.delete('stkn');
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${u.hostname}${path}${u.search ? u.search : ''}`.toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/$/, '');
  }
}

export class VaultStorage {
  // --- CATEGORIES ---

  static async getCategories(): Promise<Category[]> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase client not initialized');
      return [];
    }

    // Global categories (user_id IS NULL) are the shared taxonomy and belong to
    // every account, so they must be included alongside the user's own. Filtering
    // on `user_id` alone excluded every seeded category, which is why auto-detected
    // names never resolved and posts saved uncategorised. It also used to return
    // other users' categories while signed out, since the filter is skipped.
    const globalQuery = supabase
      .from('categories')
      .select('*')
      .is('user_id', null)
      .order('created_at', { ascending: true });

    if (_currentUserId) {
      const { data, error } = await globalQuery;
      if (error) {
        console.error('Supabase categories fetch error:', error);
        return [];
      }

      const { data: own, error: ownError } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', _currentUserId)
        .order('created_at', { ascending: true });
      if (ownError) {
        console.error('Supabase categories fetch error:', ownError);
      }

      return [...(data || []), ...(own || [])];
    }

    const { data, error } = await globalQuery;
    if (error) {
      console.error('Supabase categories fetch error:', error);
      return [];
    }

    return data || [];
  }

  static async saveCategory(category: Omit<Category, 'id' | 'created_at'> & { id?: string }): Promise<Category> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');

    const newCat: Category = {
      id: category.id || `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: category.name,
      color_hex: category.color_hex || '#3B82F6',
      icon: category.icon || 'Folder',
      created_at: new Date().toISOString(),
    };

    const payload = _currentUserId ? { ...newCat, user_id: _currentUserId } : newCat;
    
    const { data, error } = await supabase.from('categories').upsert([payload]).select().single();
    if (error) {
      console.error('Supabase category upsert error:', error);
      throw error;
    }
    
    return data;
  }

  static async deleteCategory(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      console.error('Supabase delete category error:', error);
      return false;
    }
    
    return true;
  }

  // --- CONTENT ITEMS ---
  /**
   * Per-category post counts for the pill row.
   *
   * Deliberately selects two small columns rather than whole rows: the counts
   * must be known before deciding which pills to render, so this cannot depend on
   * the item list, which is itself filtered by the active category.
   *
   * `source_url` is included so the same normalized-URL dedupe that getItems
   * applies can be applied here. Without it the pills would advertise more posts
   * than the grid can show (a saved duplicate would count twice), and the
   * "N of M" counter would disagree with itself.
   */
  static async getCategoryCounts(): Promise<CategoryCounts> {
    const empty: CategoryCounts = { counts: {}, total: 0, uncategorized: 0 };
    const supabase = getSupabaseClient();
    if (!supabase) return empty;

    let q = supabase.from('content_items').select('category_id, source_url');
    if (_currentUserId) {
      q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('user_id', _currentUserId);
    }

    // Same ordering as getItems so both agree on which duplicate survives.
    const { data, error } = await (
      q as unknown as {
        order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: unknown; error: unknown }>;
      }
    ).order('created_at', { ascending: false });
    if (error) {
      console.error('Supabase category counts fetch error:', error);
      return empty;
    }

    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    let uncategorized = 0;
    let total = 0;

    for (const row of (data ?? []) as Array<{ category_id: string | null; source_url: string | null }>) {
      const key = row.source_url ? normalizeUrl(row.source_url) : null;
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      total += 1;
      if (row.category_id) {
        counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
      } else {
        uncategorized += 1;
      }
    }

    return { counts, total, uncategorized };
  }

  /** Single-row fetch for the mutations that used to pull the whole vault. */
  static async getItemById(id: string): Promise<ContentItem | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    let q = supabase.from('content_items').select('*').eq('id', id);
    if (_currentUserId) {
      q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('user_id', _currentUserId);
    }

    const { data, error } = await q.limit(1);
    if (error) {
      console.error('Supabase item fetch error:', error);
      return null;
    }
    if (!data || data.length === 0) return null;

    const row = data[0] as Record<string, unknown>;
    const categories = await this.getCategories();
    return {
      ...row,
      priority_score: calculatePriorityScore(
        row.priority as never,
        row.access_count as number,
        row.is_favorite as boolean,
        row.created_at as string
      ),
      category: row.category_id
        ? categories.find((c) => c.id === (row.category_id as string))
        : undefined,
    } as ContentItem;
  }

  /**
   * Narrows the query server-side so only the rows the UI is actually showing
   * cross the wire. Defaults to no filtering, which every internal caller
   * (saveItem dedupe, export, import) relies on.
   */
  static async getItems(options: ItemQueryOptions = {}): Promise<ContentItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase client not initialized');
      return [];
    }

    const categories = await this.getCategories();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const runQuery = async (filter: string | null) => {
      let q = supabase.from('content_items').select('*');

      if (_currentUserId) {
        q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('user_id', _currentUserId);
      }
      if (options.categoryId === UNCATEGORIZED_ID) {
        q = (q as unknown as { is: (c: string, v: null) => typeof q }).is('category_id', null);
      } else if (options.categoryId) {
        q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq(
          'category_id',
          options.categoryId
        );
      }
      if (filter) {
        q = (q as unknown as { or: (f: string) => typeof q }).or(filter);
      }
      if (options.limit) {
        q = (q as unknown as { limit: (n: number) => typeof q }).limit(options.limit);
      }

      // Sorting stays client-side on purpose: priority_score shown on the cards
      // is recalculated in JS (uncapped access bonus + time decay) and does not
      // match the stored column, so ordering by the column would disagree with
      // the number rendered on each card. Sorting the filtered set costs no
      // bandwidth, which is where the savings actually come from.
      return await (q as unknown as {
        order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: unknown[]; error: unknown }>;
      }).order('created_at', { ascending: false });
    };

    // Degrade rather than render an empty vault: if the combined filter is
    // rejected, retry with fewer conditions before giving up entirely.
    const attempts: Array<{ filter: string | null; label: string }> = [];
    const combined = buildVaultFilter(options);
    if (combined) {
      attempts.push({ filter: combined, label: 'search+media' });
      const searchOnly = buildVaultFilter({ ...options, mediaType: 'ALL' });
      if (searchOnly) attempts.push({ filter: searchOnly, label: 'search only' });
      const mediaOnly = buildVaultFilter({ ...options, search: '' });
      if (mediaOnly) attempts.push({ filter: mediaOnly, label: 'media only' });
    } else {
      attempts.push({ filter: null, label: 'unfiltered' });
    }

    let data: unknown[] | null = null;
    let lastError: unknown = null;

    for (const attempt of attempts) {
      const { data: rows, error } = await runQuery(attempt.filter);
      if (!error) {
        if (attempt.label !== attempts[0].label) {
          console.warn(`Vault filter fell back to "${attempt.label}"`);
        }
        data = rows ?? [];
        break;
      }
      lastError = error;
      console.error(`Supabase items fetch error (${attempt.label}):`, error);
    }

    if (data === null) {
      // Every variant failed. When the network is simply gone, the cache is a
      // far better answer than an empty vault — the user gets their content back
      // with a stale-data badge rather than a blank grid that looks like
      // deletion.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await readCachedItems(_currentUserId || '');
        if (cached.length) {
          noteOfflineSource();
          return cached;
        }
      }
      console.error('Supabase items fetch failed for every filter variant:', lastError);
      return [];
    }

    const mapped = (data as Array<Record<string, unknown>>).map((item) => {
      const recalculatedScore = calculatePriorityScore(
        item.priority as never,
        item.access_count as number,
        item.is_favorite as boolean,
        item.created_at as string
      );
      return {
        ...item,
        priority_score: recalculatedScore,
        category: item.category_id ? categoryMap.get(item.category_id as string) : undefined,
      } as unknown as ContentItem;
    });


// Deduplicate by normalized source_url & id
    const uniqueMap = new Map<string, ContentItem>();
    for (const item of mapped) {
      const key = item.source_url ? normalizeUrl(item.source_url) : item.id;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }

    const deduped = Array.from(uniqueMap.values()).sort(
      (a: ContentItem, b: ContentItem) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Mirror to the offline cache. Fire-and-forget on purpose: the user already
    // has the data in hand at this point, so a cache failure must not turn a
    // good fetch into an error.
    noteOnlineSource();
    void cacheItems(_currentUserId || '', deduped);

    return deduped;
  }

static async saveItem(item: SaveItemInput): Promise<ContentItem> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');

    // Resolve the detected category to a real row so every link lands filed. An
    // explicit category_id (the user picked one) always wins over the detection;
    // a low-confidence guess is never applied. If the detected name is missing
    // from the DB — a fresh account, a deleted category, or a name the seeder
    // has not run for — the category is created on the spot with the taxonomy's
    // colour, which is the whole "Keeva files it for you" promise.
    let categoryId: string | null | undefined = item.category_id;
    if (
      !categoryId &&
      item.auto_category_name &&
      item.auto_category_confidence !== 'low'
    ) {
      const wanted = resolveCategoryName(item.auto_category_name);
      const all = await this.getCategories();
      const existing = all.find(
        (c) => c.name.toLowerCase() === wanted.toLowerCase()
      );
      if (existing) {
        categoryId = existing.id;
      } else {
        const visual = taxonomyVisual(wanted) ?? {
          color_hex: autoCategoryColor(wanted),
          icon: 'Folder',
        };
        const created = await this.saveCategory({
          name: wanted,
          color_hex: visual.color_hex,
          icon: visual.icon,
        });
        categoryId = created.id;
      }
    }

    // Deduplication check: if no item.id provided, check if URL is already saved
    let targetId = item.id;
    if (!targetId && item.source_url) {
      const existingItems = await this.getItems();
      const normNew = normalizeUrl(item.source_url);
      const existingMatch = existingItems.find((i) => normalizeUrl(i.source_url) === normNew);
      if (existingMatch) {
        targetId = existingMatch.id;
      }
    }

    const createdAt = item.created_at || new Date().toISOString();
    const accessCount = item.access_count ?? 0;
    const isFavorite = item.is_favorite ?? false;
    const priority = item.priority || 'HIGH';

    const priorityScore = calculatePriorityScore(priority, accessCount, isFavorite, createdAt);

const fullItem: ContentItem = {
      id: targetId || `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      category_id: categoryId ?? null,
      title: item.title,
      source_url: item.source_url,
      platform: item.platform || 'Web',
      media_type: item.media_type || 'ARTICLE',
      aspect_ratio: item.aspect_ratio || 'LANDSCAPE_16_9',
      thumbnail_url: item.thumbnail_url || null,
      doc_file_url: item.doc_file_url || null,
      priority: priority,
      priority_score: priorityScore,
      access_count: accessCount,
      is_favorite: isFavorite,
      is_public: item.is_public ?? false,
      created_at: createdAt,
      description: item.description || '',
      tags: item.tags || [],
      notes: item.notes || '',
    };

    const payload: Record<string, unknown> = { ...fullItem };
    delete payload.category;
    if (_currentUserId) payload.user_id = _currentUserId;
    
    const { data, error } = await supabase.from('content_items').upsert([payload]).select().single();
    
    if (error) {
      console.error('Supabase item upsert error:', error);
      throw error;
    }
    
    const categories = await this.getCategories();
    return {
      ...data,
      category: data.category_id ? categories.find((c) => c.id === data.category_id) : undefined,
    };
  }

  /**
   * Writes just the notes column.
   *
   * Deliberately not saveItem(): that upserts the entire row from whatever the
   * caller is holding, which offline means a stale snapshot — replaying it after
   * reconnecting would silently undo any change made on another device in the
   * meantime. A single-column update cannot touch anything it does not own.
   */
  static async saveNotes(id: string, notes: string): Promise<ContentItem | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('content_items')
      .update({ notes })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase notes update error:', error);
      return null;
    }

    // Patch the cached copy too, or the next offline load would serve the
    // pre-edit note and the user would think their edit had vanished.
    void patchCachedNotes(_currentUserId || '', id, notes);

    return data as unknown as ContentItem;
  }

  static async incrementAccess(id: string): Promise<ContentItem | null> {
    const item = await this.getItemById(id);
    if (!item) return null;

    const newCount = (item.access_count || 0) + 1;
    return this.saveItem({
      ...item,
      access_count: newCount,
    });
  }

  static async toggleFavorite(id: string): Promise<ContentItem | null> {
    const item = await this.getItemById(id);
    if (!item) return null;

    return this.saveItem({
      ...item,
      is_favorite: !item.is_favorite,
    });
  }


  static async deleteItem(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase.from('content_items').delete().eq('id', id);
    if (error) {
      console.error('Supabase delete item error:', error);
      return false;
    }
    return true;
  }

  static async clearAllItems(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');

    if (!_currentUserId) throw new Error('Cannot clear all items without an authenticated user');
    
    try {
      await supabase.from('content_items').delete().eq('user_id', _currentUserId);
    } catch (err) {
      console.warn('Supabase clear items error:', err);
    }
  }

  // --- STATS ---
  /**
   * Aggregates from the six columns the metrics actually need instead of
   * hydrating every item. The old version called getItems(), which pulled whole
   * rows for the entire vault on every load and on every favourite/access
   * update — that alone defeated selecting a single category.
   *
   * MUST_LEARN is still resolved against the JS-recalculated score, not the
   * stored column, so the banner keeps matching the priority numbers on the cards.
   */
  static async getStats(): Promise<VaultStats> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        totalItems: 0,
        mustLearnCount: 0,
        reelsCount: 0,
        landscapeCount: 0,
        documentsCount: 0,
        favoritesCount: 0,
        totalAccesses: 0,
      };
    }

    let q = supabase
      .from('content_items')
      .select('priority, access_count, is_favorite, created_at, aspect_ratio, media_type, source_url');
    if (_currentUserId) {
      q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq('user_id', _currentUserId);
    }

    const { data, error } = await (
      q as unknown as {
        order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: unknown; error: unknown }>;
      }
    ).order('created_at', { ascending: false });
    if (error) {
      console.error('Supabase stats fetch error:', error);
      return {
        totalItems: 0,
        mustLearnCount: 0,
        reelsCount: 0,
        landscapeCount: 0,
        documentsCount: 0,
        favoritesCount: 0,
        totalAccesses: 0,
      };
    }

    const rows = (data ?? []) as Array<{
      priority: string;
      access_count: number | null;
      is_favorite: boolean | null;
      created_at: string;
      aspect_ratio: string | null;
      media_type: string | null;
      source_url: string | null;
    }>;

    let mustLearnCount = 0;
    let reelsCount = 0;
    let landscapeCount = 0;
    let documentsCount = 0;
    let favoritesCount = 0;
    let totalAccesses = 0;
    let totalItems = 0;
    // Same normalized-URL dedupe as getItems, so the banner counts the posts the
    // grid can actually show rather than raw rows.
    const seen = new Set<string>();

    for (const row of rows) {
      if (row.source_url) {
        const key = normalizeUrl(row.source_url);
        if (seen.has(key)) continue;
        seen.add(key);
      }

      totalItems += 1;
      const accessCount = row.access_count ?? 0;
      const isFavorite = row.is_favorite ?? false;
      totalAccesses += accessCount;

      const score = calculatePriorityScore(
        row.priority as never,
        accessCount,
        isFavorite,
        row.created_at
      );
      if (row.priority === 'MUST_LEARN' || score >= 100) mustLearnCount += 1;
      if (row.aspect_ratio === 'PORTRAIT_9_16' || row.media_type === 'REEL') reelsCount += 1;
      if (row.aspect_ratio === 'LANDSCAPE_16_9') landscapeCount += 1;
      if (row.media_type === 'DOCUMENT' || row.aspect_ratio === 'STANDARD_DOCUMENT') {
        documentsCount += 1;
      }
      if (isFavorite) favoritesCount += 1;
    }

    return {
      totalItems,
      mustLearnCount,
      reelsCount,
      landscapeCount,
      documentsCount,
      favoritesCount,
      totalAccesses,
    };
  }


  // --- EXPORT & IMPORT ---
  static async exportData(): Promise<string> {
    const items = await this.getItems();
    const categories = await this.getCategories();
    return JSON.stringify({ version: '2.0', exportDate: new Date().toISOString(), categories, items }, null, 2);
  }

  static async importData(jsonData: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const parsed = JSON.parse(jsonData);
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid JSON schema: "items" array missing');
      }

      if (parsed.categories && Array.isArray(parsed.categories)) {
        for (const cat of parsed.categories) {
          await this.saveCategory(cat);
        }
      }

      for (const item of parsed.items) {
        await this.saveItem(item);
      }

      return { success: true, count: parsed.items.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message };
    }
  }
}
