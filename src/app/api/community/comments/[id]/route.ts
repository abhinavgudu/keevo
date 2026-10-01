import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const MAX_BODY = 1000;

function authedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// ── PATCH: edit your own comment ─────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = authedClient(token);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { body?: string };
    const text = (body?.body || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    }
    if (text.length > MAX_BODY) {
      return NextResponse.json({ error: `Comment cannot exceed ${MAX_BODY} characters` }, { status: 400 });
    }

    // The .eq('user_id', user.id) plus the UPDATE policy restricts the edit to
    // the caller's own rows, so someone else's comment matches zero rows and
    // comes back as "not found". Mentions are deliberately left as they were:
    // re-resolving them here would fire mention notifications for an edit, and
    // an edit that removes a name must not silently keep pinging them either —
    // that needs its own pass and is out of scope for a text correction.
    const { data, error } = await supabase
      .from('community_comments')
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Comment not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ comment: data });
  } catch (err) {
    const error = err as Error;
    console.error('Error editing comment:', error);
    return NextResponse.json({ error: error.message || 'Failed to edit comment' }, { status: 500 });
  }
}

// ── DELETE: remove your own comment. Replies cascade at the DB level. ──────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // No .eq('user_id', user.id) filter is needed here — the RLS delete policy
    // restricts the delete to the caller's own rows, so someone else's comment
    // matches zero rows and comes back as "not found".
    const { data, error } = await supabase
      .from('community_comments')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Comment not found or unauthorized' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    console.error('Error deleting comment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
