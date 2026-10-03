import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthorMapFast, type CommunityAuthor } from '@/lib/authorProfiles';
import { fetchCommunityLikeRows } from '@/lib/reactions';

/**
 * Community search.
 *
 * Searches everything public in one pass — post content, comments, and member
 * names — and returns enough context for each hit that the UI can render full
 * results without any follow-up requests:
 *
 *  - a post hit comes back with the same enriched shape as /api/community/items
 *    (like_count, comment_count, liked_by_me, shared_by), so the card can be
 *    drawn directly.
 *  - a comment hit carries its parent post, also enriched, so tapping it opens
 *    the post in the normal preview.
 *  - a person hit carries their display name and how many posts they have here.
 *
 * Matching is deliberately token-based with per-field weighting instead of one
 * big `ilike`. The community is small, so this runs fine in process after one
 * fetch, and weighting lets "the" rank below a hit in the title.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Scope = 'all' | 'posts' | 'comments' | 'people';

const SCOPES: Scope[] = ['all', 'posts', 'comments', 'people'];

function isScope(value: unknown): value is Scope {
  return typeof value === 'string' && (SCOPES as string[]).includes(value);
}

// Returns the caller's id, or null when signed out / token rejected.
async function resolveViewerId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('Authorization');
  if (!header) return null;
  const token = header.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const client = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return error || !data?.user ? null : data.user.id;
  } catch {
    return null;
  }
}

function normalize(text: unknown): string {
  return String(text ?? '').toLowerCase();
}

function tokensOf(query: string): string[] {
  return query.split(/\s+/).filter((t) => t.length > 0);
}

interface MatchField {
  key: string;
  label: string;
  snippet: string;
}

/** A window around the first occurrence of a token, with ellipses at the cut. */
function snippetAround(text: string, firstIndex: number): string {
  const start = Math.max(0, firstIndex - 45);
  const end = Math.min(text.length, firstIndex + 55);
  const slice = text.slice(start, end);
  return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`;
}

// Weighted fields searched on every public post. Order matters: earlier fields
// win the snippet when several match, so the title/caption come first.
const POST_FIELDS: { key: string; label: string; weight: number; get: (item: Record<string, unknown>) => string }[] = [
  { key: 'title', label: 'Title', weight: 8, get: (i) => i.title as string },
  { key: 'caption', label: 'Caption', weight: 8, get: (i) => i.community_caption as string },
  { key: 'description', label: 'Description', weight: 6, get: (i) => i.description as string },
  { key: 'author', label: 'Author', weight: 5, get: (i) => {
      const s = i.shared_by as { first_name?: string; last_name?: string; email?: string } | undefined;
      return `${s?.first_name || ''} ${s?.last_name || ''} ${s?.email || ''}`;
    } },
  { key: 'tags', label: 'Tags', weight: 5, get: (i) => Array.isArray(i.tags) ? (i.tags as string[]).join(' ') : '' },
  { key: 'platform', label: 'Platform', weight: 4, get: (i) => i.platform as string },
  { key: 'category', label: 'Category', weight: 4, get: (i) => (i.category as { name?: string } | null)?.name || '' },
  { key: 'transcript', label: 'Transcript', weight: 3, get: (i) => i.transcript_text as string },
  { key: 'notes', label: 'Notes', weight: 3, get: (i) => i.notes as string },
];

function matchFields(texts: { key: string; label: string; weight: number; text: string }[], tokens: string[]) {
  let score = 0;
  const matched: MatchField[] = [];
  const seen = new Map<string, number>(); // key -> earliest occurrence

  for (const token of tokens) {
    for (const { key, weight, text } of texts) {
      const hay = normalize(text);
      if (!hay) continue;
      const idx = hay.indexOf(token);
      if (idx < 0) continue;
      score += weight;
      const current = seen.get(key);
      if (current === undefined || idx < current) seen.set(key, idx);
    }
  }

  for (const { key, label } of texts) {
    const idx = seen.get(key);
    if (idx === undefined) continue;
    const text = normalize(texts.find((t) => t.key === key)!.text);
    matched.push({ key, label, snippet: snippetAround(text, idx) });
  }

  return { score, matched };
}

function displayNameOf(author: { first_name?: string; last_name?: string; email: string }): string {
  const joined = `${author.first_name || ''} ${author.last_name || ''}`.trim();
  if (joined) return joined;
  return author.email.split('@')[0] || 'Keeva Member';
}

// Same enrichment as /api/community/items: comment counts, like counts, per
// viewer like state, and display names — all batched so the results render with
// zero follow-up requests.
async function fetchEnrichedPublicItems(viewerId: string | null): Promise<Record<string, unknown>[]> {
  const { data: itemsData, error: itemsError } = await supabaseAdmin
    .from('content_items')
    .select(`*, category:categories(*)`)
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  if (itemsError) throw itemsError;
  if (!itemsData || !itemsData.length) return [];

  const visibleIds = itemsData.map((item) => item.id as string);

  const commentCounts: Record<string, number> = {};
  const { data: commentRows } = await supabaseAdmin
    .from('community_comments')
    .select('item_id')
    .in('item_id', visibleIds);
  for (const row of commentRows || []) {
    const key = row.item_id as string;
    commentCounts[key] = (commentCounts[key] || 0) + 1;
  }

  const userProfiles = await getAuthorMapFast();
  const likeCounts: Record<string, number> = {};
  const reactionCounts: Record<string, Record<string, number>> = {};
  const myReactions: Record<string, string> = {};
  const likeRows = await fetchCommunityLikeRows(supabaseAdmin, visibleIds);
  for (const row of likeRows) {
    const key = row.item_id as string;
    const reaction =
      typeof row.reaction === 'string' && row.reaction ? row.reaction : 'like';
    likeCounts[key] = (likeCounts[key] || 0) + 1;
    reactionCounts[key] = reactionCounts[key] || {};
    reactionCounts[key][reaction] = (reactionCounts[key][reaction] || 0) + 1;
    if (viewerId && row.user_id === viewerId) myReactions[key] = reaction;
  }

  return itemsData.map((item) => ({
    ...item,
    comment_count: commentCounts[item.id as string] || 0,
    like_count: likeCounts[item.id as string] || 0,
    liked_by_me: (item.id as string) in myReactions,
    reaction_counts: reactionCounts[item.id as string] || {},
    my_reaction: myReactions[item.id as string] ?? null,
    shared_by: item.user_id && userProfiles[item.user_id]
      ? userProfiles[item.user_id]
      : {
          id: item.user_id || 'community-user',
          email: 'community@keeva.app',
          first_name: 'Keeva',
          last_name: 'Member',
        },
  }));
}

export async function GET(request: NextRequest) {
  try {
    const viewerId = await resolveViewerId(request);
    const query = (request.nextUrl.searchParams.get('q') || '').trim();
    const scope = isScope(request.nextUrl.searchParams.get('scope')) ? request.nextUrl.searchParams.get('scope')! : 'all';
    const tokens = tokensOf(query);

    if (!tokens.length) {
      return NextResponse.json({ query, scope, posts: [], comments: [], people: [] });
    }

    const enriched = await fetchEnrichedPublicItems(viewerId);
    const postsById = new Map<string, Record<string, unknown>>();

    // ── Posts ────────────────────────────────────────────────────────────────
    // Every public post is indexed so a comment hit can resolve its parent even
    // when the post's own text does not contain the query.
    for (const item of enriched) {
      postsById.set(item.id as string, item);
    }

    const postHits: Array<{ item: Record<string, unknown>; score: number; matched: MatchField[] }> = [];
    for (const item of enriched) {
      const texts = POST_FIELDS.map((f) => ({ key: f.key, label: f.label, weight: f.weight, text: f.get(item) }));
      const { score, matched } = matchFields(texts, tokens);
      if (score <= 0) continue;
      postHits.push({ item, score, matched });
    }
    postHits.sort((a, b) => b.score - a.score || String(b.item.created_at).localeCompare(String(a.item.created_at)));

    const posts = (scope === 'all' || scope === 'posts')
      ? postHits.slice(0, 50).map(({ item, matched }) => ({ ...item, matched }))
      : [];

    // ── Comments ─────────────────────────────────────────────────────────────
    let comments: Array<{ matched: MatchField[]; post: Record<string, unknown> }> = [];
    if (scope === 'all' || scope === 'comments') {
      const { data: commentData, error: commentError } = await supabaseAdmin
        .from('community_comments')
        .select('*')
        .order('created_at', { ascending: false });

      if (commentError) {
        console.error('Community search: failed to read comments:', commentError);
      } else if (commentData) {
        const commentHits: Array<Record<string, unknown> & { matched: MatchField[] }> = [];
        for (const c of commentData) {
          const post = postsById.get(c.item_id as string);
          // A comment whose post is gone or private is not searchable.
          if (!post) continue;
          const { score, matched } = matchFields(
            [
              { key: 'body', label: 'Comment', weight: 6, text: c.body as string },
              { key: 'author', label: 'Author', weight: 4, text: (c.author_name as string) || '' },
            ],
            tokens
          );
          if (score <= 0) continue;
          commentHits.push({ ...c, matched });
        }
        commentHits.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        comments = commentHits.slice(0, 50).map((c) => ({ ...c, post: postsById.get(c.item_id as string)! }));
      }
    }

    // ── People ───────────────────────────────────────────────────────────────
    let people: Array<Record<string, unknown> & { matched: MatchField[] }> = [];
    if (scope === 'all' || scope === 'people') {
      const authors = await getAuthorMapFast();
      const postCounts: Record<string, number> = {};
      for (const item of enriched) {
        const uid = item.user_id as string | undefined;
        if (uid) postCounts[uid] = (postCounts[uid] || 0) + 1;
      }
      const personHits: Array<Record<string, unknown> & { matched: MatchField[] }> = [];
      for (const author of Object.values(authors)) {
        const displayName = displayNameOf(author as CommunityAuthor);
        const hay = normalize(`${displayName} ${author.email}`);
        const match = matchFields([{ key: 'name', label: 'Name', weight: 10, text: hay }], tokens);
        if (match.score <= 0) continue;
        personHits.push({
          id: author.id,
          email: author.email,
          first_name: author.first_name,
          last_name: author.last_name,
          display_name: displayName,
          post_count: postCounts[author.id] || 0,
          matched: match.matched,
        });
      }
      personHits.sort((a, b) => (b.post_count as number) - (a.post_count as number));
      people = personHits.slice(0, 20);
    }

    return NextResponse.json({ query, scope, posts, comments, people });
  } catch (err) {
    const error = err as Error;
    console.error('Community search failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
