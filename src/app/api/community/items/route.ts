import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET(request: NextRequest) {
  try {
    // Get all public items with categories
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from('content_items')
      .select(`
        *,
        category:categories(*)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (itemsError) throw itemsError;
    if (!itemsData) {
      return NextResponse.json({ items: [] });
    }

    // Get unique user_ids
    const userIds = [...new Set(itemsData.map(item => item.user_id).filter(Boolean))];
    
    // Fetch user profiles using admin API
    let userProfiles: Record<string, { id: string; email: string; first_name?: string; last_name?: string }> = {} as Record<string, { id: string; email: string; first_name?: string; last_name?: string }>;
    if (userIds.length > 0) {
      const { data: profilesData } = await supabaseAdmin.auth.admin.listUsers();
      if (profilesData?.users) {
        userProfiles = profilesData.users
          .filter(u => userIds.includes(u.id))
          .reduce((acc: Record<string, { id: string; email: string; first_name?: string; last_name?: string }>, u) => {
            acc[u.id] = {
              id: u.id,
              email: u.email ?? '',
              first_name: u.user_metadata?.first_name ?? undefined,
              last_name: u.user_metadata?.last_name ?? undefined,
            };
            return acc;
          }, {});
      }
    }

    const itemsWithSharer = itemsData.map(item => ({
      ...item,
      shared_by: item.user_id ? userProfiles[item.user_id] : undefined,
    }));
    
    return NextResponse.json({ items: itemsWithSharer });
  } catch (err) {
    const error = err as Error;
    console.error('Error fetching community posts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}