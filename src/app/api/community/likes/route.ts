import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  insertNotifications,
  removeLikeNotification,
} from '@/lib/communityNotifications';
import { authDisplayName } from '@/lib/authorProfiles';
import { emptyReactionCounts, isPostReaction, type PostReaction } from '@/lib/reactions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getBearer(req: NextRequest) {
  const header = req.headers.get('Authorization');
  if (!header) return null;
  return header.replace('Bearer ', '');
}

async function resolveUser(token: string) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return { user, client };
}

// ── POST: toggle your like on a public post ──────────────────────────────────
//
// Toggle rather than separate like/unlike endpoints so the client has one call
// and no way to get the two out of sync. The response carries the new state and
// count so the caller never has to refetch the feed to draw the button.
export async function POST(request: NextRequest) {
  try {
    const token = getBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Sign in to like posts' }, { status: 401 });
    }

    const resolved = await resolveUser(token);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const { user, client } = resolved;

    const body = (await request.json().catch(() => ({}))) as { item_id?: string; reaction?: string };
    const itemId = (body.item_id || '').trim();
    if (!itemId) {
      return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
    }
    // Unknown reactions fall back to a plain Like rather than failing the tap.
    const reaction: PostReaction = isPostReaction(body.reaction) ? body.reaction : 'like';

    // A post that is not in the community cannot be liked, even if its id is
    // known. Without this, any signed-in user could like someone's private
    // vault item by guessing or leaking the id.
    const { data: item } = await admin
      .from('content_items')
      .select('id, is_public, user_id')
      .eq('id', itemId)
      .single();

    if (!item || !item.is_public) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Read with the user's own client so RLS applies, rather than admin, so this
    // can only ever see a like that genuinely belongs to the caller.
    const { data: existing } = await client
      .from('community_likes')
      .select('id, reaction')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle();

    // One reaction per member per post. Tapping the active reaction removes it;
    // picking another one switches the row in place. A switch keeps the
    // existing 'like' notification — the owner was already pinged that this
    // person reacted, and a second ping for Love-after-Like would be noise.
    let liked: boolean;
    let myReaction: PostReaction | null;
    if (existing && (existing.reaction as string) === reaction) {
      const { error } = await client
        .from('community_likes')
        .delete()
        .eq('id', existing.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      liked = false;
      myReaction = null;
    } else if (existing) {
      const { error } = await client
        .from('community_likes')
        .update({ reaction })
        .eq('id', existing.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      liked = true;
      myReaction = reaction;
    } else {
      // A duplicate submit can race past the check above. The UNIQUE constraint
      // turns that into a harmless no-op instead of a 500 for the user.
      const { error } = await client
        .from('community_likes')
        .insert({ item_id: itemId, user_id: user.id, reaction });
      if (error && error.code !== '23505') {
        // The reactions column only exists after its migration. A missing
        // column is a deployment gap, not a user error worth a bare 500.
        const missing =
          error.code === '42703' ||
          (typeof error.message === 'string' && error.message.includes('reaction'));
        return NextResponse.json(
          { error: missing ? 'Reactions are not set up yet' : error.message },
          { status: missing ? 503 : 500 }
        );
      }
      liked = true;
      myReaction = reaction;
    }

    // The like is a toggle, so the notification has to be a toggle too: liking
    // pings the post's owner, unliking takes that ping back. Both run through
    // helpers that never throw, so this can never fail a like that already
    // succeeded. The response below stays exactly as it was. Liking your own
    // post writes no row at all — a bell entry saying you liked your own post
    // is noise, and the push layer would drop it anyway.
    if (liked) {
      if (item.user_id !== user.id) {
        await insertNotifications([
          {
            recipientUserId: item.user_id,
            actorUserId: user.id,
            actorName: authDisplayName(user),
            kind: 'like',
            itemId,
            commentId: null,
          },
        ]);
      }
    } else {
      await removeLikeNotification({ actorUserId: user.id, itemId });
    }

    // Counted through admin so a post with zero likes still returns 0 instead of
    // a missing field, which the card would otherwise have to special-case.
    // The per-reaction breakdown rides along in the same query so the card can
    // draw its stacked icons without a second request.
    const { data: rows } = await admin
      .from('community_likes')
      .select('reaction')
      .eq('item_id', itemId);

    const reactionCounts = emptyReactionCounts();
    for (const row of rows || []) {
      const key = row.reaction as string;
      if (isPostReaction(key)) reactionCounts[key] += 1;
      else reactionCounts.like += 1;
    }
    const likeCount = Object.values(reactionCounts).reduce((n, v) => n + v, 0);

    return NextResponse.json({
      item_id: itemId,
      liked,
      like_count: likeCount,
      my_reaction: myReaction,
      reaction_counts: reactionCounts,
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error toggling like:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
