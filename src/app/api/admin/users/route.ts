import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize a Supabase client with the SERVICE ROLE key to bypass RLS
// DO NOT expose this key to the client side.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function GET(request: Request) {
  // 1. Authenticate the caller (must be logged in)
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // 2. Removed strict admin check for now

  try {
    // Fetch all users from Supabase Auth
    const { data: authUsers, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) throw usersError;

    // Fetch all items to get counts per user
    const { data: allItems, error: itemsError } = await supabaseAdmin
      .from('content_items')
      .select('user_id');

    if (itemsError) throw itemsError;

    // Aggregate item counts by user_id
    const itemCounts: Record<string, number> = {};
    allItems?.forEach((item) => {
      if (item.user_id) {
        itemCounts[item.user_id] = (itemCounts[item.user_id] || 0) + 1;
      }
    });

    // Format the response
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
