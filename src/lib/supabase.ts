import { createBrowserClient } from '@supabase/ssr';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient(): ReturnType<typeof createBrowserClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) return null;

  try {
    if (!browserClient) {
      browserClient = createBrowserClient(url, key);
    }
    return browserClient;
  } catch (err) {
    console.error('Failed to init Supabase', err);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return hasEnv;
}
