import { Category, ContentItem, VaultStats, calculatePriorityScore } from '@/types/vault';
import { getSupabaseClient } from './supabase';

// Auth user context — set from AuthContext on login
let _currentUserId: string | null = null;

export function setVaultUserId(uid: string | null) {
  _currentUserId = uid;
}

export class VaultStorage {
  // --- CATEGORIES ---
  static async getCategories(): Promise<Category[]> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase client not initialized');
      return [];
    }

    let query = supabase.from('categories').select('*').order('created_at', { ascending: true });
    if (_currentUserId) { 
      query = (query as any).eq('user_id', _currentUserId); 
    }
    
    const { data, error } = await query;
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
  static async getItems(): Promise<ContentItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase client not initialized');
      return [];
    }

    const categories = await this.getCategories();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    let query = supabase
      .from('content_items')
      .select('*')
      .order('priority_score', { ascending: false });
      
    if (_currentUserId) { 
      query = (query as any).eq('user_id', _currentUserId); 
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Supabase items fetch error:', error);
      return [];
    }
    
    if (!data) return [];

    return data.map((item: any) => {
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
    }).sort((a, b) => b.priority_score - a.priority_score);
  }

  static async saveItem(item: Partial<ContentItem> & { title: string; source_url: string }): Promise<ContentItem> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client not initialized');

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
