import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface CommunityAuthor {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  /** Short tagline, edited by the member on their profile. */
  headline?: string;
  /** One-liner bio, edited by the member on their profile. */
  bio?: string;
  /** Public Storage URL of the profile photo, if set. */
  avatar_url?: string;
}

interface AuthorCache {
  at: number;
  map: Record<string, CommunityAuthor>;
}

const TTL_MS = 5 * 60 * 1000;

/**
 * Best available name for an auth user. Falls back to the email local-part,
 * which is also the mentionable handle, so what a member is called in a comment
 * and what they type after "@" are the same string.
 */
export function authDisplayName(user: {
  user_metadata?: Record<string, unknown> | null;
  email?: string | null;
}): string {
  const meta = (user.user_metadata || {}) as {
    full_name?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
  };
  const joined = `${meta.first_name || ''} ${meta.last_name || ''}`.trim();
  if (joined) return joined;

  const full = (meta.full_name || meta.name || '').trim();
  if (full) return full;

  return (user.email || 'Keeva Member').split('@')[0];
}

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
        headline?: string;
        bio?: string;
        avatar_url?: string;
      };
      const fullName = meta.full_name || meta.name || '';
      const firstName = meta.first_name || (fullName ? fullName.split(' ')[0] : '');
      const lastName = meta.last_name || (fullName ? fullName.split(' ').slice(1).join(' ') : '');
      // Profile text lives in auth metadata (see the profiles-phase plan), so
      // it flows through this same cached map with no extra table or query.
      // Trimmed and capped on read too, so a row written before the UI limits
      // existed can never blow up a layout.
      const headline = (meta.headline || '').trim().slice(0, 80);
      const bio = (meta.bio || '').trim().slice(0, 160);
      const avatarUrl = (meta.avatar_url || '').trim();

      map[u.id] = {
        id: u.id,
        email: u.email ?? '',
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        headline: headline || undefined,
        bio: bio || undefined,
        avatar_url: avatarUrl || undefined,
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
