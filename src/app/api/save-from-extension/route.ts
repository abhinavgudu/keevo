import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { calculatePriorityScore } from '@/types/vault';
import { LEGACY_CATEGORY_ALIASES } from '@/lib/categories';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Set auth for this request
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      source_url,
      platform,
      media_type,
      aspect_ratio,
      thumbnail_url,
      priority,
      description,
      tags,
      category_name,
      doc_file_url
    } = body;

    if (!title || !source_url) {
      return NextResponse.json({ error: 'Title and source_url required' }, { status: 400 });
    }

    // Find or create category.
    // A global row (user_id IS NULL) is the shared taxonomy and is the right
    // match for a recognised name — creating a per-user duplicate of "AI & ML"
    // for every install is what left the vault full of one-off categories.
    let category_id = null;
    if (category_name) {
      const normalised = LEGACY_CATEGORY_ALIASES[category_name.trim().toLowerCase()] ?? category_name.trim();

      const { data: globalCat } = await supabase
        .from('categories')
        .select('id')
        .is('user_id', null)
        .ilike('name', normalised)
        .limit(1)
        .maybeSingle();

      if (globalCat) {
        category_id = globalCat.id;
      } else {
        const { data: ownCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', user.id)
          .ilike('name', normalised)
          .limit(1)
          .maybeSingle();

        if (ownCat) {
          category_id = ownCat.id;
        } else {
          // Only an unrecognised name earns a new personal category.
          const { data: newCat } = await supabase
            .from('categories')
            .insert({ name: normalised, color_hex: '#3B82F6', user_id: user.id })
            .select()
            .single();
          if (newCat) category_id = newCat.id;
        }
      }
    }

    const createdAt = new Date().toISOString();
    const accessCount = 0;
    const isFavorite = false;
    const priorityLevel = priority || 'HIGH';
    const priorityScore = calculatePriorityScore(priorityLevel, accessCount, isFavorite, createdAt);

    const { data, error } = await supabase
      .from('content_items')
      .insert({
        user_id: user.id,
        category_id,
        title,
        source_url,
        platform: platform || 'Web',
        media_type: media_type || 'ARTICLE',
        aspect_ratio: aspect_ratio || 'LANDSCAPE_16_9',
        thumbnail_url: thumbnail_url || null,
        doc_file_url: doc_file_url || null,
        priority: priorityLevel,
        priority_score: priorityScore,
        access_count: accessCount,
        is_favorite: isFavorite,
        is_public: false,
        created_at: createdAt,
        description: description || '',
        tags: tags || [],
        notes: ''
      })
      .select()
      .single();

    if (error) {
      console.error('Save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data });
  } catch (err) {
    const error = err as Error;
    console.error('Extension save error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save' }, { status: 500 });
  }
}