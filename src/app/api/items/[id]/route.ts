import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authDisplayName } from '@/lib/authorProfiles';
import { notifyNewPost } from '@/lib/communityNotifications';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { is_public, community_caption } = body;

    if (typeof is_public !== 'boolean') {
      return NextResponse.json({ error: 'is_public must be a boolean' }, { status: 400 });
    }

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

    // Read the current visibility before writing, so "entered the community" can
    // be told apart from "is already in the community". The transition is what
    // deserves a notification; a second click on an already-shared post, or an
    // edit to its caption, must not announce it again.
    const { data: before } = await supabase
      .from('content_items')
      .select('is_public')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    const updatePayload: Record<string, unknown> = { is_public };
    if (typeof community_caption === 'string') {
      updatePayload.community_caption = community_caption;
      // Stamp the edit so the feed can mark the post as edited. Cleared when the
      // post leaves the community, since a private post has no visible caption.
      updatePayload.community_edited_at = is_public && community_caption.trim()
        ? new Date().toISOString()
        : null;
    }

    const { data, error } = await supabase
      .from('content_items')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Item not found or unauthorized' }, { status: 404 });
    }

    // A post that just became visible is the one community event every member
    // hears about, so it is recorded as a single broadcast notification rather
    // than one row per member. Never throws, so a shared post is still shared if
    // this fails.
    if (is_public && before && before.is_public === false) {
      await notifyNewPost({
        actorUserId: user.id,
        actorName: authDisplayName(user),
        itemId: id,
      });
    }

    return NextResponse.json({ success: true, item: data });
  } catch (err) {
    const error = err as Error;
    console.error('Error toggling public status:', error);
    return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
  }
}

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

    const { error } = await supabase
      .from('content_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    console.error('Error deleting item:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete' }, { status: 500 });
  }
}