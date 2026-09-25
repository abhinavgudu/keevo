import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Only the admin email can access this endpoint
  if (user.email !== 'miabhisu@gmail.com') {
    return NextResponse.json({ error: 'Unauthorized: Admins only' }, { status: 403 });
  }

  try {
    // Fetch all auth users
    const { data: authUsers, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    // Fetch ALL content items across all users with full details
    const { data: allItems, error: itemsError } = await supabaseAdmin
      .from('content_items')
      .select('id, user_id, title, platform, media_type, aspect_ratio, thumbnail_url, is_favorite, access_count, is_public, created_at')
      .order('created_at', { ascending: false });

    if (itemsError) throw itemsError;

    // Aggregate item counts per user
    const itemCounts: Record<string, number> = {};
    allItems?.forEach((item) => {
      if (item.user_id) {
        itemCounts[item.user_id] = (itemCounts[item.user_id] || 0) + 1;
      }
    });

    const formattedUsers = authUsers.users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.user_metadata?.first_name || '',
      lastName: u.user_metadata?.last_name || '',
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
      itemCount: itemCounts[u.id] || 0,
    }));

    return NextResponse.json({
      success: true,
      users: formattedUsers,
      totalItems: allItems?.length || 0,
      itemDetails: allItems || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
