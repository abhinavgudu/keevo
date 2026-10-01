/**
 * LinkedIn-style post reactions.
 *
 * One reaction per member per post — the same (item_id, user_id) UNIQUE pair
 * the old heart toggle relied on. Switching reactions is an UPDATE, reacting
 * is an INSERT, un-reacting is a DELETE. Icon components stay in the UI layer
 * so server routes can import this without pulling lucide into the bundle.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type PostReaction =
  | 'like'
  | 'celebrate'
  | 'support'
  | 'love'
  | 'insightful'
  | 'funny';

export const POST_REACTIONS: PostReaction[] = [
  'like',
  'celebrate',
  'support',
  'love',
  'insightful',
  'funny',
];

export const REACTION_LABEL: Record<PostReaction, string> = {
  like: 'Like',
  celebrate: 'Celebrate',
  support: 'Support',
  love: 'Love',
  insightful: 'Insightful',
  funny: 'Funny',
};

/** Text/fill color per reaction, used for the button and the stacked icons. */
export const REACTION_COLOR: Record<PostReaction, string> = {
  like: 'text-sky-400',
  celebrate: 'text-emerald-400',
  support: 'text-violet-400',
  love: 'text-rose-500',
  insightful: 'text-amber-400',
  funny: 'text-teal-400',
};

export function isPostReaction(value: unknown): value is PostReaction {
  return (
    typeof value === 'string' &&
    (POST_REACTIONS as string[]).includes(value)
  );
}

/** Empty breakdown so the card never has to special-case a missing row. */
export function emptyReactionCounts(): Record<PostReaction, number> {
  return { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 };
}

export interface CommunityLikeRow {
  item_id: string;
  user_id: string;
  reaction?: string | null;
}

/**
 * Batched like rows for a set of posts. The reaction column only exists after
 * its migration, so on an older database the select falls back to the
 * pre-reactions shape instead of blanking every count. Callers treat a
 * missing reaction as 'like', which is also what the migration backfills.
 */
export async function fetchCommunityLikeRows(
  admin: SupabaseClient,
  itemIds: string[]
): Promise<CommunityLikeRow[]> {
  if (!itemIds.length) return [];

  try {
    const res = await admin
      .from('community_likes')
      .select('item_id, user_id, reaction')
      .in('item_id', itemIds);
    if (res.error) throw res.error;
    return (res.data || []) as CommunityLikeRow[];
  } catch {
    const res = await admin
      .from('community_likes')
      .select('item_id, user_id')
      .in('item_id', itemIds);
    if (res.error) throw res.error;
    return (res.data || []) as CommunityLikeRow[];
  }
}
