import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(customUrl?: string, customKey?: string): SupabaseClient | null {
  const url = customUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = customKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) return null;

  try {
    if (!supabaseInstance || customUrl || customKey) {
      supabaseInstance = createClient(url, key);
    }
    return supabaseInstance;
  } catch (err) {
    console.error('Failed to init Supabase', err);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return hasEnv;
}
