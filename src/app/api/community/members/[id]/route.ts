import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthorMap } from '@/lib/authorProfiles';
import { membersFromAuthorMap } from '@/lib/communityNotifications';
import { fetchCommunityLikeRows } from '@/lib/reactions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Returns the caller's id, or null when signed out / token rejected. The page
// stays public either way — this only decides followed_by_me and my_reaction.
async function resolveViewerId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('Authorization');
  if (!header) return null;
  const token = header.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return error || !data?.user ? null : data.user.id;
  } catch {
    return null;
  }
}

// ── GET: one member's profile + their public posts ───────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Member id is required' }, { status: 400 });
    }

    const viewerId = await resolveViewerId(request);
    const authorMap = await getAuthorMap().catch(() => null);
    const author = authorMap?.[id];
    if (!author) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // No exclusion here: the second argument of membersFromAuthorMap hides
    // the viewer from the mention composer, and passing the profile id would
    // filter out exactly the member being viewed.
    const memberEntry = membersFromAuthorMap(authorMap!).find((m) => m.id === id);
    const name = memberEntry?.name || 'Keeva Member';
    const handle = memberEntry?.handle || 'member';

    // Follow counts in two exact-count queries, and the viewer's own follow
    // state when signed in. All through admin except the viewer check, which
    // needs no RLS — follows are publicly readable by policy.
    const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
      admin.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', id),
      admin.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', id),
    ]);

    let followedByMe = false;
    if (viewerId && viewerId !== id) {
      const { data } = await admin
        .from('follows')
        .select('follower_id')
        .eq('follower_id', viewerId)
        .eq('following_id', id)
        .maybeSingle();
      followedByMe = !!data;
    }

    // The member's public posts, enriched exactly like the feed so CommunityCard
    // draws them unchanged: comment counts, like breakdown, viewer reaction.
    const { data: itemsData, error: itemsError } = await admin
      .from('content_items')
      .select(`*, category:categories(*)`)
      .eq('user_id', id)
      .eq('is_public', true)
      .order('created_at', { ascending: false });
    if (itemsError) throw itemsError;

    const items = itemsData || [];
    const visibleIds = items.map((item) => item.id as string);

    const commentCounts: Record<string, number> = {};
    if (visibleIds.length) {
      const { data: commentRows } = await admin
        .from('community_comments')
        .select('item_id')
        .in('item_id', visibleIds);
      for (const row of commentRows || []) {
        const key = row.item_id as string;
        commentCounts[key] = (commentCounts[key] || 0) + 1;
      }
    }

    const likeCounts: Record<string, number> = {};
    const reactionCounts: Record<string, Record<string, number>> = {};
    const myReactions: Record<string, string> = {};
    for (const row of await fetchCommunityLikeRows(admin, visibleIds)) {
      const key = row.item_id as string;
      const reaction = typeof row.reaction === 'string' && row.reaction ? row.reaction : 'like';
      likeCounts[key] = (likeCounts[key] || 0) + 1;
      reactionCounts[key] = reactionCounts[key] || {};
      reactionCounts[key][reaction] = (reactionCounts[key][reaction] || 0) + 1;
      if (viewerId && row.user_id === viewerId) myReactions[key] = reaction;
    }

    const sharedBy = {
      id: author.id,
      email: author.email,
      first_name: author.first_name,
      last_name: author.last_name,
    };

    return NextResponse.json({
      member: {
        id: author.id,
        handle,
        name,
        bio: author.bio ?? null,
        headline: author.headline ?? null,
        avatar_url: author.avatar_url ?? null,
        follower_count: followerCount ?? 0,
        following_count: followingCount ?? 0,
        post_count: items.length,
        followed_by_me: followedByMe,
        is_self: viewerId === id,
      },
      posts: items.map((item) => ({
        ...item,
        comment_count: commentCounts[item.id as string] || 0,
        like_count: likeCounts[item.id as string] || 0,
        liked_by_me: (item.id as string) in myReactions,
        reaction_counts: reactionCounts[item.id as string] || {},
        my_reaction: myReactions[item.id as string] ?? null,
        shared_by: sharedBy,
      })),
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error loading member profile:', error);
    return NextResponse.json({ error: error.message || 'Failed to load profile' }, { status: 500 });
  }
}
