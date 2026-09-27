import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  CommunityNotification,
  commentExcerpt,
  visibleToUserFilter,
} from '@/lib/communityNotifications';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FEED_LIMIT = 50;

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
  return user;
}

// ── GET: the signed-in member's notification feed ────────────────────────────
//
// This is the "all community activity" feed. It is intentionally NOT what the
// Community tab badge counts — that badge stays unread posts only.
export async function GET(request: NextRequest) {
  try {
    const token = getBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Sign in to see notifications' }, { status: 401 });
    }

    const user = await resolveUser(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data, error } = await admin
      .from('community_notifications')
      .select('*')
      .or(visibleToUserFilter(user.id))
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT);

    if (error) throw error;

    const rows = data || [];

    // Resolve the post titles and comment excerpts in two batched lookups rather
    // than a nested PostgREST embed, so this does not depend on FK relationship
    // detection resolving the way we expect on a fresh database.
    const itemIds = Array.from(new Set(rows.map((r) => r.item_id).filter((v): v is string => !!v)));
    const commentIds = Array.from(
      new Set(rows.map((r) => r.comment_id).filter((v): v is string => !!v))
    );

    const [itemsRes, commentsRes] = await Promise.all([
      itemIds.length
        ? admin.from('content_items').select('id, title').in('id', itemIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      commentIds.length
        ? admin.from('community_comments').select('id, body').in('id', commentIds)
        : Promise.resolve({ data: [] as { id: string; body: string }[] }),
    ]);

    const titleByItem = new Map((itemsRes.data || []).map((i) => [i.id, i.title]));
    const bodyByComment = new Map((commentsRes.data || []).map((c) => [c.id, c.body]));

    const notifications: CommunityNotification[] = rows.map((row) => ({
      ...row,
      item_title: row.item_id ? titleByItem.get(row.item_id) ?? null : null,
      comment_excerpt: row.comment_id
        ? commentExcerpt(bodyByComment.get(row.comment_id))
        : null,
    }));

    const unreadCount = notifications.filter((n) => !n.read_at).length;

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    const error = err as Error;
    console.error('Error listing community notifications:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── PATCH: mark notifications read ───────────────────────────────────────────
//
// Body: { ids: string[] } to mark specific rows, or { all: true } for everything
// currently unread. Read state lives in the database, not localStorage, so it
// follows the member across devices and does not fight the Community tab badge's
// own browser-side marker.
export async function PATCH(request: NextRequest) {
  try {
    const token = getBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Sign in to update notifications' }, { status: 401 });
    }

    const user = await resolveUser(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      ids?: string[];
      all?: boolean;
    };

    const all = body.all === true;
    const ids = Array.isArray(body.ids) ? body.ids.filter((v) => typeof v === 'string' && v) : [];

    if (!all && !ids.length) {
      return NextResponse.json({ error: 'ids or all is required' }, { status: 400 });
    }

    // The service role bypasses RLS, so the visibility rule has to be repeated
    // here. Without it this endpoint could mark, or expose, anyone's rows.
    let query = admin
      .from('community_notifications')
      .update({ read_at: new Date().toISOString() })
      .or(visibleToUserFilter(user.id))
      .is('read_at', null);

    if (!all) query = query.in('id', ids);

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    console.error('Error marking community notifications read:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
