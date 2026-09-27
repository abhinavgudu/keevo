import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  insertNotifications,
  removeLikeNotification,
} from '@/lib/communityNotifications';
import { authDisplayName } from '@/lib/authorProfiles';

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

    const body = (await request.json().catch(() => ({}))) as { item_id?: string };
    const itemId = (body.item_id || '').trim();
    if (!itemId) {
      return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
    }

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
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle();

    let liked: boolean;
    if (existing) {
      const { error } = await client
        .from('community_likes')
        .delete()
        .eq('id', existing.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      liked = false;
    } else {
      // A duplicate submit can race past the check above. The UNIQUE constraint
      // turns that into a harmless no-op instead of a 500 for the user.
      const { error } = await client
        .from('community_likes')
        .insert({ item_id: itemId, user_id: user.id });
      if (error && error.code !== '23505') {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      liked = true;
    }

    // The like is a toggle, so the notification has to be a toggle too: liking
    // pings the post's owner, unliking takes that ping back. Both run through
    // helpers that never throw, so this can never fail a like that already
    // succeeded. The response below stays exactly as it was.
    if (liked) {
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
    } else {
      await removeLikeNotification({ actorUserId: user.id, itemId });
    }

    // Counted through admin so a post with zero likes still returns 0 instead of
    // a missing field, which the card would otherwise have to special-case.
    const { count } = await admin
      .from('community_likes')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId);

    return NextResponse.json({ item_id: itemId, liked, like_count: count ?? 0 });
  } catch (err) {
    const error = err as Error;
    console.error('Error toggling like:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
