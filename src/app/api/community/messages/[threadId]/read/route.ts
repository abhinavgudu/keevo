import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readCursorColumnFor } from '@/lib/messages';
import { isMissingTable, resolveCaller } from '../../route';

/**
 * Mark a conversation read by advancing the caller's own cursor.
 *
 * Only the reader's own column is written, so opening a conversation can never
 * mark it read for the other person — that is the whole reason the cursors are
 * per participant rather than one shared `read_at` on the thread.
 *
 * Setting the cursor to "now" rather than to the newest message's timestamp is
 * deliberate and slightly generous: a message that arrives between reading the
 * thread and this write will not reappear as unread, which is the failure mode
 * that makes an unread badge feel broken.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const viewerId = await resolveCaller(request);
    if (!viewerId) {
      return NextResponse.json({ error: 'Sign in to update read state' }, { status: 401 });
    }

    const { threadId } = await params;
    if (!threadId) {
      return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
    }

    const { data: thread, error } = await admin
      .from('dm_threads')
      .select('participant_a, participant_b, participant_a_read_at, participant_b_read_at')
      .eq('id', threadId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!thread) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const column = readCursorColumnFor(
      { participant_a: thread.participant_a as string, participant_b: thread.participant_b as string },
      viewerId
    );
    if (!column) {
      // 404 rather than 403: a thread id that is not the caller's must not be
      // confirmed as existing.
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Skip the write if the cursor was already advanced very recently.
    // Supabase Realtime fires an UPDATE event on every write to dm_threads;
    // without this guard the client receives the event, calls markRead, which
    // calls this endpoint again, which fires another event — an infinite loop
    // that is the primary source of 4 GB+ log ingestion.
    const existingCursor = thread[column as keyof typeof thread] as string | null;
    if (existingCursor) {
      const age = Date.now() - new Date(existingCursor).getTime();
      if (age < 10_000) {
        // Cursor is already fresh; return the stored value without writing.
        return NextResponse.json({ read_at: existingCursor, skipped: true });
      }
    }

    const readAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from('dm_threads')
      .update({ [column]: readAt })
      .eq('id', threadId);

    if (updateError) {
      if (isMissingTable(updateError, 'dm_threads')) {
        return NextResponse.json(
          { error: 'Messages are not set up yet — run the DM migration.' },
          { status: 503 }
        );
      }
      console.error('Failed to mark DM thread read:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ read_at: readAt });
  } catch (err) {
    const error = err as Error;
    console.error('Failed to mark DM thread read:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}