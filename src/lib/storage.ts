import { Category, ContentItem, VaultStats, calculatePriorityScore } from '@/types/vault';
import { INITIAL_CATEGORIES, INITIAL_ITEMS } from './seed-data';
import { getSupabaseClient } from './supabase';

const STORAGE_KEYS = {
  ITEMS: 'vaultx_content_items_v2',
  CATEGORIES: 'vaultx_categories_v2',
  SETTINGS: 'vaultx_settings',
};

// Auth user context — set from AuthContext on login
let _currentUserId: string | null = null;

export function setVaultUserId(uid: string | null) {
  _currentUserId = uid;
}


export class VaultStorage {
  // --- CATEGORIES ---
  static async getCategories(): Promise<Category[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (err) {
        console.warn('Supabase categories fetch failed, falling back to local storage:', err);
      }
    }

    if (typeof window === 'undefined') return INITIAL_CATEGORIES;

    const localData = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
    if (!localData) {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(INITIAL_CATEGORIES));
      return INITIAL_CATEGORIES;
    }

    try {
      const parsed = JSON.parse(localData);
      return parsed.length > 0 ? parsed : INITIAL_CATEGORIES;
    } catch {
      return INITIAL_CATEGORIES;
    }
  }

  static async saveCategory(category: Omit<Category, 'id' | 'created_at'> & { id?: string }): Promise<Category> {
    const supabase = getSupabaseClient();
    const newCat: Category = {
      id: category.id || `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: category.name,
      color_hex: category.color_hex || '#3B82F6',
      icon: category.icon || 'Folder',
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      try {
        const payload = _currentUserId ? { ...newCat, user_id: _currentUserId } : newCat;
        const { data, error } = await supabase.from('categories').upsert([payload]).select().single();
        if (!error && data) return data;
      } catch (err) {
        console.warn('Supabase category upsert error:', err);
      }
    }

    const categories = await this.getCategories();
    const existingIndex = categories.findIndex((c) => c.id === newCat.id);
    let updated: Category[];
    if (existingIndex >= 0) {
      updated = [...categories];
      updated[existingIndex] = { ...updated[existingIndex], ...newCat };
    } else {
      updated = [...categories, newCat];
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(updated));
    }
    return newCat;
  }

  static async deleteCategory(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('categories').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase delete category error:', err);
      }
    }

    const categories = await this.getCategories();
    const filtered = categories.filter((c) => c.id !== id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(filtered));
    }
    return true;
  }

  // --- CONTENT ITEMS ---
  static async getItems(): Promise<ContentItem[]> {
    const categories = await this.getCategories();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('content_items')
          .select('*')
          .order('priority_score', { ascending: false });
        if (!error && data) {
          return data.map((item: any) => ({
            ...item,
            category: item.category_id ? categoryMap.get(item.category_id) : undefined,
          }));
        }
      } catch (err) {
        console.warn('Supabase items fetch failed, using local storage:', err);
      }
    }

    if (typeof window === 'undefined') {
      return INITIAL_ITEMS;
    }

    const localData = localStorage.getItem(STORAGE_KEYS.ITEMS);
    let items: ContentItem[] = [];

    if (!localData) {
      items = [];
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify([]));
    } else {
      try {
        items = JSON.parse(localData);
      } catch {
        items = [];
      }
    }

    return items
      .map((item) => {
        const recalculatedScore = calculatePriorityScore(
          item.priority,
          item.access_count,
          item.is_favorite,
          item.created_at
        );
        return {
          ...item,
          priority_score: recalculatedScore,
          category: item.category_id ? categoryMap.get(item.category_id) : undefined,
        };
      })
      .sort((a, b) => b.priority_score - a.priority_score);
  }

  static async saveItem(item: Partial<ContentItem> & { title: string; source_url: string }): Promise<ContentItem> {
    const isNew = !item.id;
    const createdAt = item.created_at || new Date().toISOString();
    const accessCount = item.access_count ?? 0;
    const isFavorite = item.is_favorite ?? false;
    const priority = item.priority || 'HIGH';

    const priorityScore = calculatePriorityScore(priority, accessCount, isFavorite, createdAt);

    const fullItem: ContentItem = {
      id: item.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      category_id: item.category_id || null,
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
      created_at: createdAt,
      description: item.description || '',
      tags: item.tags || [],
      notes: item.notes || '',
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const payload: Record<string, unknown> = { ...fullItem };
        delete payload.category;
        if (_currentUserId) payload.user_id = _currentUserId;
        const { data, error } = await supabase.from('content_items').upsert([payload]).select().single();
        if (!error && data) {
          const categories = await this.getCategories();
          return {
            ...data,
            category: data.category_id ? categories.find((c) => c.id === data.category_id) : undefined,
          };
        }
      } catch (err) {
        console.warn('Supabase item upsert error:', err);
      }
    }

    const items = await this.getItems();
    const existingIndex = items.findIndex((i) => i.id === fullItem.id);
    let updated: ContentItem[];

    if (existingIndex >= 0) {
      updated = [...items];
      updated[existingIndex] = { ...updated[existingIndex], ...fullItem };
    } else {
      updated = [fullItem, ...items];
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(updated));
    }

    const categories = await this.getCategories();
    return {
      ...fullItem,
      category: fullItem.category_id ? categories.find((c) => c.id === fullItem.category_id) : undefined,
    };
  }

  static async incrementAccess(id: string): Promise<ContentItem | null> {
    const items = await this.getItems();
    const item = items.find((i) => i.id === id);
    if (!item) return null;

    const newCount = (item.access_count || 0) + 1;
    return this.saveItem({
      ...item,
      access_count: newCount,
    });
  }

  static async toggleFavorite(id: string): Promise<ContentItem | null> {
    const items = await this.getItems();
    const item = items.find((i) => i.id === id);
    if (!item) return null;

    return this.saveItem({
      ...item,
      is_favorite: !item.is_favorite,
    });
  }

  static async deleteItem(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('content_items').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase delete item error:', err);
      }
    }

    const items = await this.getItems();
    const filtered = items.filter((i) => i.id !== id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(filtered));
    }
    return true;
  }

  static async clearAllItems(): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('content_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (err) {
        console.warn('Supabase clear items error:', err);
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify([]));
      localStorage.removeItem('vaultx_content_items'); // remove old key
    }
  }

  // --- STATS ---
  static async getStats(): Promise<VaultStats> {
    const items = await this.getItems();
    return {
      totalItems: items.length,
      mustLearnCount: items.filter((i) => i.priority === 'MUST_LEARN' || i.priority_score >= 100).length,
      reelsCount: items.filter((i) => i.aspect_ratio === 'PORTRAIT_9_16' || i.media_type === 'REEL').length,
      landscapeCount: items.filter((i) => i.aspect_ratio === 'LANDSCAPE_16_9').length,
      documentsCount: items.filter((i) => i.media_type === 'DOCUMENT' || i.aspect_ratio === 'STANDARD_DOCUMENT').length,
      favoritesCount: items.filter((i) => i.is_favorite).length,
      totalAccesses: items.reduce((acc, curr) => acc + (curr.access_count || 0), 0),
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
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(parsed.categories));
        }
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(parsed.items));
      }

      return { success: true, count: parsed.items.length };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message };
    }
  }
}
