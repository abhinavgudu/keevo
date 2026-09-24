import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(customUrl?: string, customKey?: string): SupabaseClient | null {
  const url = customUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || (typeof window !== 'undefined' ? localStorage.getItem('vaultx_supabase_url') : null);
  const key = customKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || (typeof window !== 'undefined' ? localStorage.getItem('vaultx_supabase_key') : null);

  if (!url || !key) {
    return null;
  }

  try {
    if (!supabaseInstance || customUrl || customKey) {
      supabaseInstance = createClient(url, key);
    }
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  if (typeof window === 'undefined') {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasLocal = Boolean(localStorage.getItem('vaultx_supabase_url') && localStorage.getItem('vaultx_supabase_key'));
  return hasEnv || hasLocal;
}
