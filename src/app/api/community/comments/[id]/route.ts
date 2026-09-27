import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
