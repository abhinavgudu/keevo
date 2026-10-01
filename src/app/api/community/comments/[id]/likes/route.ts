import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  insertNotifications,
  removeCommentLikeNotification,
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

// ── POST: toggle your like on a comment or reply ──────────────────────────
//
// Same toggle contract as post likes: liking notifies the comment's author
// (never yourself), unliking takes that ping back. The response carries the
// new state and count so the caller never has to refetch the thread.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: commentId } = await params;
    const token = getBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Sign in to like comments' }, { status: 401 });
    }

    const resolved = await resolveUser(token);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const { user, client } = resolved;

    // A comment on a post that left the community has no thread, even if its
    // id is known. Without this, any signed-in user could like comments on
    // someone's private vault item by guessing or leaking ids.
    const { data: comment } = await admin
      .from('community_comments')
      .select('id, item_id, user_id')
      .eq('id', commentId)
      .single();

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const { data: item } = await admin
      .from('content_items')
      .select('id, is_public')
      .eq('id', comment.item_id)
      .single();

    if (!item || !item.is_public) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Read with the user's own client so RLS applies, rather than admin, so
    // this can only ever see a like that genuinely belongs to the caller.
    const { data: existing } = await client
      .from('community_comment_likes')
      .select('id')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .maybeSingle();

    let liked: boolean;
    if (existing) {
      const { error } = await client
        .from('community_comment_likes')
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
        .from('community_comment_likes')
        .insert({ comment_id: commentId, user_id: user.id });
      if (error && error.code !== '23505') {
        // The comment likes table only exists after its migration. A missing
        // table is a deployment gap, not a user error worth a bare 500.
        const missing =
          error.code === '42P01' ||
          (typeof error.message === 'string' && error.message.includes('community_comment_likes'));
        return NextResponse.json(
          { error: missing ? 'Comment likes are not set up yet' : error.message },
          { status: missing ? 503 : 500 }
        );
      }
      liked = true;
    }

    // The toggle has to be a toggle on the notification side too: liking pings
    // the comment's author, unliking takes that ping back. Both run through
    // helpers that never throw, so this can never fail a like that already
    // succeeded. Liking your own comment writes no row at all — a bell entry
    // saying you liked your own comment is noise.
    if (liked) {
      if (comment.user_id !== user.id) {
        await insertNotifications([
          {
            recipientUserId: comment.user_id,
            actorUserId: user.id,
            actorName: authDisplayName(user),
            kind: 'comment_like',
            itemId: comment.item_id,
            commentId,
          },
        ]);
      }
    } else {
      await removeCommentLikeNotification({ actorUserId: user.id, commentId });
    }

    // Counted through admin so a comment with zero likes still returns 0
    // instead of a missing field, which the row would otherwise have to
    // special-case.
    const { count } = await admin
      .from('community_comment_likes')
      .select('id', { count: 'exact', head: true })
      .eq('comment_id', commentId);

    return NextResponse.json({ comment_id: commentId, liked, like_count: count ?? 0 });
  } catch (err) {
    const error = err as Error;
    console.error('Error toggling comment like:', error);
    return NextResponse.json({ error: error.message || 'Failed to toggle comment like' }, { status: 500 });
  }
}
