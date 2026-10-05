import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const dynamic = 'force-dynamic';

/**
 * Lightweight endpoint to count unread community posts without fetching
 * post bodies, categories, comments, author profiles, or reactions.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sinceStr = searchParams.get('since');
    const userId = searchParams.get('userId');

    const sinceMs = sinceStr ? parseInt(sinceStr, 10) : 0;
    const sinceIso = sinceMs > 0 ? new Date(sinceMs).toISOString() : new Date(0).toISOString();

    let query = supabaseAdmin
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .eq('is_public', true)
      .gt('created_at', sinceIso);

    if (userId) {
      query = query.neq('user_id', userId);
    }

    const { count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ unreadCount: count ?? 0 });
  } catch (err) {
    const error = err as Error;
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
