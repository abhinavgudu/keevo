import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Client-side Supabase auth client (browser only) */
export function createAuthClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export type { User, Session } from '@supabase/supabase-js';
