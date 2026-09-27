import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface CommunityAuthor {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

interface AuthorCache {
  at: number;
  map: Record<string, CommunityAuthor>;
}

const TTL_MS = 5 * 60 * 1000;

// Kept on globalThis so the cache survives Next's dev-mode module re-evaluation;
// without this every hot reload drops it and the first request pays full cost.
const globalCache = globalThis as typeof globalThis & {
  __keevaAuthorCache?: AuthorCache;
};

async function fetchAllAuthors(): Promise<Record<string, CommunityAuthor>> {
  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const map: Record<string, CommunityAuthor> = {};
  let page = 1;

  // listUsers() defaults to 50 per page, so walk the pages rather than silently
  // dropping every author past the first page.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200, page });
    if (error) throw error;
    if (!data?.users?.length) break;

    for (const u of data.users) {
      const meta = (u.user_metadata || {}) as {
        full_name?: string;
        name?: string;
        first_name?: string;
        last_name?: string;
      };
      const fullName = meta.full_name || meta.name || '';
      const firstName = meta.first_name || (fullName ? fullName.split(' ')[0] : '');
      const lastName = meta.last_name || (fullName ? fullName.split(' ').slice(1).join(' ') : '');

      map[u.id] = {
        id: u.id,
        email: u.email ?? '',
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      };
    }

    if (data.users.length < 200) break;
    page += 1;
  }

  return map;
}

/**
 * Author display info for community posts.
 *
 * There is no `profiles` table, so display names live in auth metadata and the
 * only way to read them is `auth.admin.listUsers()`. That call costs ~3s and was
 * running on every community feed load, which is what made the tab feel slow.
 * Names change rarely, so the whole map is cached for a short TTL and a miss
 * costs one paginated sweep.
 */
export async function getAuthorMap(): Promise<Record<string, CommunityAuthor>> {
  const cached = globalCache.__keevaAuthorCache;
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.map;
  }

  try {
    const map = await fetchAllAuthors();
    globalCache.__keevaAuthorCache = { at: Date.now(), map };
    return map;
  } catch (err) {
    // A stale cache beats an empty feed, so fall back to it on any failure.
    if (cached) {
      console.error('Author refresh failed, serving stale cache:', err);
      return cached.map;
    }
    throw err;
  }
}
