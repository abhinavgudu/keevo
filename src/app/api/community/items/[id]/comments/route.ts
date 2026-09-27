import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MAX_BODY = 1000;

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

function displayName(user: { user_metadata?: Record<string, unknown>; email?: string }) {
  const meta = user.user_metadata || {};
  const full = (meta.full_name || meta.name || '') as string;
  const first = (meta.first_name || '') as string;
  const last = (meta.last_name || '') as string;
  const joined = `${first} ${last}`.trim();
  if (joined) return joined;
  if (full.trim()) return full.trim();
  return (user.email || 'Keeva Member').split('@')[0];
}

// ── GET: list all comments for a public item, oldest first ───────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: item } = await admin
      .from('content_items')
      .select('id, is_public')
      .eq('id', id)
      .single();

    if (!item || !item.is_public) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('community_comments')
      .select('*')
      .eq('item_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ comments: data || [] });
  } catch (err) {
    const error = err as Error;
    console.error('Error listing comments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST: add a comment, or a reply when parent_id is set ───────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = getBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });
    }

    const resolved = await resolveUser(token);
    if (!resolved) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const { user, client } = resolved;

    const body = (await request.json().catch(() => ({}))) as { body?: string; parent_id?: string | null };
    const text = (body.body || '').trim();

    if (!text) {
      return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    }
    if (text.length > MAX_BODY) {
      return NextResponse.json({ error: `Comment cannot exceed ${MAX_BODY} characters` }, { status: 400 });
    }

    // A post that is not in the community has no comment thread, even if the id
    // is known. Without this, any signed-in user could comment on someone's
    // private vault item by guessing or leaking its id.
    const { data: item } = await admin
      .from('content_items')
      .select('id, is_public')
      .eq('id', id)
      .single();

    if (!item || !item.is_public) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    let parentId: string | null = null;
    if (body.parent_id) {
      const { data: parent } = await admin
        .from('community_comments')
        .select('id, item_id, parent_id')
        .eq('id', body.parent_id)
        .single();

      if (!parent || parent.item_id !== id) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      }
      // One level of replies only — replying to a reply attaches to the thread
      // root instead of nesting.
      parentId = parent.parent_id || parent.id;
    }

    const { data, error } = await client
      .from('community_comments')
      .insert({
        item_id: id,
        user_id: user.id,
        parent_id: parentId,
        body: text,
        author_name: displayName(user),
        author_email: user.email || '',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    console.error('Error adding comment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
