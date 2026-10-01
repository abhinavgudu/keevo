import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  insertNotifications,
  removeFollowNotification,
} from '@/lib/communityNotifications';
import { authDisplayName, getAuthorMap } from '@/lib/authorProfiles';

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

// ── POST: toggle your follow on another member ───────────────────────────
//
// One-way follow: no request, no accept — following is a flag, unfollowing is
// a delete. The response carries the new state and follower count so the
// caller never has to refetch the profile to draw the button.
export async function POST(request: NextRequest) {
  try {
    const token = getBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Sign in to follow people' }, { status: 401 });
    }

    const resolved = await resolveUser(token);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const { user, client } = resolved;

    const body = (await request.json().catch(() => ({}))) as { target_user_id?: string };
    const targetId = (body.target_user_id || '').trim();
    if (!targetId) {
      return NextResponse.json({ error: 'target_user_id is required' }, { status: 400 });
    }
    if (targetId === user.id) {
      return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 });
    }

    // The target must be a real member. Checked against the cached author map
    // rather than a per-request admin lookup, so a follow costs no extra round
    // trip beyond the toggle itself.
    const authorMap = await getAuthorMap().catch(() => null);
    if (!authorMap || !authorMap[targetId]) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Read with the user's own client so RLS applies, rather than admin, so
    // this can only ever see a follow that genuinely belongs to the caller.
    const { data: existing } = await client
      .from('follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('following_id', targetId)
      .maybeSingle();

    let following: boolean;
    if (existing) {
      const { error } = await client
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      following = false;
    } else {
      // A duplicate submit can race past the check above. The PRIMARY KEY
      // turns that into a harmless no-op instead of a 500 for the user.
      const { error } = await client
        .from('follows')
        .insert({ follower_id: user.id, following_id: targetId });
      if (error && error.code !== '23505') {
        // The follows table only exists after its migration. A missing table
        // is a deployment gap, not a user error worth a bare 500.
        const missing =
          error.code === '42P01' ||
          (typeof error.message === 'string' && error.message.includes('follows'));
        return NextResponse.json(
          { error: missing ? 'Follows are not set up yet' : error.message },
          { status: missing ? 503 : 500 }
        );
      }
      following = true;
    }

    // The follow is a toggle, so the notification has to be a toggle too:
    // following pings the target, unfollowing takes that ping back. Both run
    // through helpers that never throw, so this can never fail a follow that
    // already succeeded.
    if (following) {
      await insertNotifications([
        {
          recipientUserId: targetId,
          actorUserId: user.id,
          actorName: authDisplayName(user),
          kind: 'new_follower',
          itemId: null,
          commentId: null,
        },
      ]);
    } else {
      await removeFollowNotification({ actorUserId: user.id, targetUserId: targetId });
    }

    // Counted through admin so a member with zero followers still returns 0
    // instead of a missing field, which the button would otherwise have to
    // special-case.
    const { count } = await admin
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', targetId);

    return NextResponse.json({
      target_user_id: targetId,
      following,
      follower_count: count ?? 0,
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error toggling follow:', error);
    return NextResponse.json({ error: error.message || 'Failed to toggle follow' }, { status: 500 });
  }
}
