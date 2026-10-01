import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthorMap } from '@/lib/authorProfiles';
import { fetchCommunityLikeRows } from '@/lib/reactions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Returns the caller's id, or null when signed out / token rejected.
async function resolveViewerId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('Authorization');
  if (!header) return null;
  const token = header.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const client = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return error || !data?.user ? null : data.user.id;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // The feed is public, so a missing or bad token is not an error here — it
    // just means liked_by_me stays false. Resolving it through the anon client
    // lets Supabase verify the JWT rather than trusting the header.
    const viewerId = await resolveViewerId(request);

    // Get all public items with categories
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from('content_items')
      .select(`
        *,
        category:categories(*)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (itemsError) throw itemsError;
    if (!itemsData) {
      return NextResponse.json({ items: [] });
    }

    // Comment counts for every visible post in one query. Without this each card
    // fired its own comments request on page load, which was six round trips the
    // user never asked for just to render a number in the action bar.
    const visibleIds = itemsData.map((item) => item.id as string);
    const commentCounts: Record<string, number> = {};
    if (visibleIds.length > 0) {
      const { data: commentRows } = await supabaseAdmin
        .from('community_comments')
        .select('item_id')
        .in('item_id', visibleIds);
      for (const row of commentRows || []) {
        const key = row.item_id as string;
        commentCounts[key] = (commentCounts[key] || 0) + 1;
      }
    }

    // Author display names are cached for a short TTL — this call used to cost
    // ~3s on every feed load and dominated the response time.
    const userProfiles = await getAuthorMap();

    // Like counts and "did I like this" for every visible post, in one query.
    // Same reasoning as the comment counts above: the card needs both numbers
    // to draw its reactions, and one request beats one request per card.
    const likeCounts: Record<string, number> = {};
    const reactionCounts: Record<string, Record<string, number>> = {};
    const myReactions: Record<string, string> = {};
    if (visibleIds.length > 0) {
      const likeRows = await fetchCommunityLikeRows(supabaseAdmin, visibleIds);
      for (const row of likeRows) {
        const key = row.item_id as string;
        const reaction =
          typeof row.reaction === 'string' && row.reaction ? row.reaction : 'like';
        likeCounts[key] = (likeCounts[key] || 0) + 1;
        reactionCounts[key] = reactionCounts[key] || {};
        reactionCounts[key][reaction] = (reactionCounts[key][reaction] || 0) + 1;
        // Optional auth: the feed stays public, but a signed-in viewer also gets
        // their own reaction so the button renders correctly on first paint.
        if (viewerId && row.user_id === viewerId) myReactions[key] = reaction;
      }
    }

    const itemsWithSharer = itemsData.map((item) => ({
      ...item,
      comment_count: commentCounts[item.id as string] || 0,
      like_count: likeCounts[item.id as string] || 0,
      liked_by_me: (item.id as string) in myReactions,
      reaction_counts: reactionCounts[item.id as string] || {},
      my_reaction: myReactions[item.id as string] ?? null,
      shared_by: item.user_id && userProfiles[item.user_id]
        ? userProfiles[item.user_id]
        : {
            id: item.user_id || 'community-user',
            email: 'community@keeva.app',
            first_name: 'Keeva',
            last_name: 'Member',
          },
    }));

    return NextResponse.json({ items: itemsWithSharer });
  } catch (err) {
    const error = err as Error;
    console.error('Error fetching community posts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}