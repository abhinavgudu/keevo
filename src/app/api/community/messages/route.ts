import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthorMap } from '@/lib/authorProfiles';
import { isMissingTable } from '@/lib/schemaMissing';
import { pairKey, peerOf, unreadCountFor, type DmConversation } from '@/lib/messages';

/**
 * Conversation list, and the create-or-get entry point.
 *
 * GET  — every thread the caller is a participant in, most recent first, with
 *        the other person's profile attached so the inbox renders with no
 *        follow-up request.
 * POST — "open a chat with this person". Idempotent by construction: the thread
 *        is keyed on the sorted participant pair, which a unique index backs, so
 *        two devices opening the same chat land on the same row instead of
 *        forking a second conversation.
 *
 * The inbox has to include conversations that were never sent in (an empty
 * thread created by opening someone's profile) or those would vanish on the
 * next poll, so ordering falls back to created_at rather than last_message_at.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function resolveCaller(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('Authorization');
  if (!header) return null;
  const token = header.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return error || !data?.user ? null : data.user.id;
  } catch {
    return null;
  }
}

export { isMissingTable };

function handleOf(email: string): string {
  return (email || '').split('@')[0] || 'member';
}

/** Groups message timestamps by thread for the unread counts. */
function groupMessageTimes(
  rows: Array<{ thread_id: unknown; created_at: unknown }>
): Map<string, Array<string>> {
  const grouped = new Map<string, Array<string>>();
  for (const row of rows) {
    const threadId = row.thread_id as string;
    const createdAt = row.created_at as string;
    if (!threadId || !createdAt) continue;
    const list = grouped.get(threadId);
    if (list) list.push(createdAt);
    else grouped.set(threadId, [createdAt]);
  }
  return grouped;
}

function decorate(
  threads: Array<Record<string, unknown>>,
  viewerId: string,
  authors: Record<string, { email: string; first_name?: string; last_name?: string; avatar_url?: string }>,
  messageTimesByThread: Map<string, Array<string>>
): DmConversation[] {
  const out: DmConversation[] = [];

  for (const thread of threads) {
    const peerId = peerOf(
      {
        participant_a: thread.participant_a as string,
        participant_b: thread.participant_b as string,
      },
      viewerId
    );
    // A row the caller is not part of cannot reach here — the RLS policy
    // filters it — but skipping beats rendering a nameless row if it ever does.
    if (!peerId) continue;

    const peer = authors[peerId];
    const joined = `${peer?.first_name || ''} ${peer?.last_name || ''}`.trim();

    out.push({
      id: thread.id as string,
      participant_a: thread.participant_a as string,
      participant_b: thread.participant_b as string,
      last_message_at: (thread.last_message_at as string | null) ?? null,
      last_preview: (thread.last_preview as string | null) ?? null,
      created_at: thread.created_at as string,
      participant_a_read_at: (thread.participant_a_read_at as string | null) ?? null,
      participant_b_read_at: (thread.participant_b_read_at as string | null) ?? null,
      peer_id: peerId,
      peer_name: joined || handleOf(peer?.email || ''),
      peer_handle: handleOf(peer?.email || ''),
      peer_avatar_url: peer?.avatar_url || null,
      unread_count: unreadCountFor(
        thread as never,
        viewerId,
        messageTimesByThread.get(thread.id as string) ?? []
      ),
    });
  }

  return out;
}

export async function GET(request: NextRequest) {
  try {
    const viewerId = await resolveCaller(request);
    if (!viewerId) {
      return NextResponse.json({ error: 'Sign in to see your messages' }, { status: 401 });
    }

    const { data, error } = await admin
      .from('dm_threads')
      .select('*')
      .or(`participant_a.eq.${viewerId},participant_b.eq.${viewerId}`)
      // last_message_at is NULL for a conversation that has no message yet, and
      // NULLS LAST puts those at the end instead of the top.
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTable(error, 'dm_threads')) {
        return NextResponse.json(
          { error: 'Messages are not set up yet — run the DM migration.' },
          { status: 503 }
        );
      }
      console.error('Failed to list DM threads:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const authors = await getAuthorMap();

    // Unread counts need every message timestamp in the reader's conversations,
    // fetched once and grouped in process rather than a count query per
    // conversation. Only ids this caller's own RLS policy already returned are
    // requested, so this cannot widen what the caller can see.
    const threadIds = (data ?? []).map((t) => t.id as string);
    let messageTimesByThread = new Map<string, Array<string>>();
    if (threadIds.length) {
      const { data: messageRows, error: messagesError } = await admin
        .from('dm_messages')
        .select('thread_id, created_at')
        .in('thread_id', threadIds);

      if (messagesError) {
        // A conversation whose messages cannot be read is shown without a count
        // rather than failing the whole inbox.
        console.error('Failed to count DM messages for unread badges:', messagesError);
      } else {
        messageTimesByThread = groupMessageTimes(messageRows ?? []);
      }
    }

    const conversations = decorate(data ?? [], viewerId, authors, messageTimesByThread);

    return NextResponse.json({
      conversations,
      // Sent as its own number so a header badge does not have to add up the
      // list the client already has.
      total_unread: conversations.reduce((sum, c) => sum + c.unread_count, 0),
    });
  } catch (err) {
    const error = err as Error;
    console.error('DM inbox failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewerId = await resolveCaller(request);
    if (!viewerId) {
      return NextResponse.json({ error: 'Sign in to send a message' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { user_id?: string };
    const targetId = (body.user_id || '').trim();

    const pair = pairKey(viewerId, targetId);
    if (!pair) {
      return NextResponse.json(
        { error: targetId === viewerId ? 'You cannot message yourself' : 'user_id is required' },
        { status: 400 }
      );
    }

    // Look first: the common case is an existing conversation, and returning it
    // avoids a needless write attempt that the unique index would reject.
    const { data: existing, error: existingError } = await admin
      .from('dm_threads')
      .select('*')
      .eq('participant_a', pair.participant_a)
      .eq('participant_b', pair.participant_b)
      .maybeSingle();

    if (existingError) {
      if (isMissingTable(existingError, 'dm_threads')) {
        return NextResponse.json(
          { error: 'Messages are not set up yet — run the DM migration.' },
          { status: 503 }
        );
      }
      console.error('Failed to look up DM thread:', existingError);
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ thread: existing });
    }

    // The target has to be a real member, or the FK insert fails with an error
    // the caller cannot act on. Checked against the cached author map for the
    // same reason follows does: no extra round trip.
    const authors = await getAuthorMap();
    if (!authors[targetId]) {
      return NextResponse.json({ error: 'That member no longer exists' }, { status: 404 });
    }

    const { data: created, error: createError } = await admin
      .from('dm_threads')
      .insert(pair)
      .select()
      .single();

    if (createError) {
      // Two devices opening the same chat at once both insert. The unique index
      // rejects the loser; re-reading turns that into the same success the
      // winner already got, instead of an error the user did nothing wrong to.
      const conflict = createError.code === '23505' || /duplicate key/i.test(createError.message || '');
      if (conflict) {
        const { data: raced } = await admin
          .from('dm_threads')
          .select('*')
          .eq('participant_a', pair.participant_a)
          .eq('participant_b', pair.participant_b)
          .maybeSingle();
        if (raced) return NextResponse.json({ thread: raced });
      }
      if (isMissingTable(createError, 'dm_threads')) {
        return NextResponse.json(
          { error: 'Messages are not set up yet — run the DM migration.' },
          { status: 503 }
        );
      }
      console.error('Failed to create DM thread:', createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({ thread: created }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    console.error('Failed to open DM thread:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}