import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'Missing auth' }, { status: 401 });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (user.email !== 'miabhisu@gmail.com') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { itemId, is_public } = await request.json();
  if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('content_items')
    .update({ is_public })
    .eq('id', itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, itemId, is_public });
}
