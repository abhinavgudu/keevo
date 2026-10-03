import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { peerOf, type DmThread } from '@/lib/messages';
import { isMissingTable, resolveCaller } from '../route';

/**
 * Reading one conversation.
 *
 * The membership check runs against the service-role client, so an id that is
 * not the caller's thread returns 404 rather than 403. A 403 would confirm that
 * a particular thread id exists, which for a private conversation is itself a
 * small leak of information.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function loadThread(
  viewerId: string,
  threadId: string
): Promise<{
  thread: DmThread | null;
  peerId: string;
  /** The caller's own read cursor — what separates read from unread. */
  myReadAt: string | null;
  /** The other person's cursor — what turns a tick blue. */
  peerReadAt: string | null;
  peerActiveUntil: string | null;
  peerTypingUntil: string | null;
} | null> {
  const { data, error } = await admin
    .from('dm_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();

  if (error) return null;

  const row = data as unknown as DmThread;
  const peerId = peerOf(row, viewerId);
  if (!peerId) return null;

  const iAmA = row.participant_a === viewerId;

  return {
    thread: row,
    peerId,
    myReadAt: (iAmA ? row.participant_a_read_at : row.participant_b_read_at) ?? null,
    peerReadAt: (iAmA ? row.participant_b_read_at : row.participant_a_read_at) ?? null,
    peerActiveUntil:
      (iAmA ? row.participant_b_active_until : row.participant_a_active_until) ?? null,
    peerTypingUntil:
      (iAmA ? row.participant_b_typing_until : row.participant_a_typing_until) ?? null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const viewerId = await resolveCaller(request);
    if (!viewerId) {
      return NextResponse.json({ error: 'Sign in to read messages' }, { status: 401 });
    }

    const { threadId } = await params;
    if (!threadId) {
      return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
    }

    const found = await loadThread(viewerId, threadId);
    if (!found?.thread) {
      // Covers both "no such thread" and "not yours" — see the note above.
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('dm_messages')
      .select('*')
      .eq('thread_id', found.thread.id)
      // Newest first so the page can take the last N without reversing, then
      // reversed below for reading order.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);

    if (error) {
      if (isMissingTable(error, 'dm_messages')) {
        return NextResponse.json(
          { error: 'Messages are not set up yet — run the DM migration.' },
          { status: 503 }
        );
      }
      console.error('Failed to read DM messages:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      thread: found.thread,
      peer_id: found.peerId,
      // Everything the transcript needs to draw ticks, the unread divider and
      // the typing indicator. Sent as one read so the UI makes a single call.
      my_read_at: found.myReadAt,
      peer_read_at: found.peerReadAt,
      peer_active_until: found.peerActiveUntil,
      peer_typing_until: found.peerTypingUntil,
      // Reading order. The limit above keeps the newest 200, which is what a
      // long-running conversation actually needs on open; older history would
      // need paging, and nothing reads that far back yet.
      messages: (data ?? []).reverse(),
    });
  } catch (err) {
    const error = err as Error;
    console.error('Failed to read DM thread:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}