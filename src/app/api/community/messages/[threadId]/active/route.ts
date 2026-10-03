import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ACTIVE_WINDOW_MS, activeColumnFor } from '@/lib/messages';
import { isMissingTable, resolveCaller } from '../../route';

/**
 * The presence heartbeat: "I am looking at this conversation right now".
 *
 * The browser refreshes this on a timer while the thread is open, visible and
 * focused. It writes an expiry a little way into the future rather than a
 * boolean, so a tab that is closed, a laptop that sleeps or a process that dies
 * simply stops being refreshed and drops out of the window on its own. Nothing
 * has to detect the end of a session, which is the part that would otherwise be
 * unreliable everywhere it matters.
 *
 * Only the caller's own column is writable, so this cannot mark somebody else as
 * present.
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
      return NextResponse.json({ error: 'Sign in to update presence' }, { status: 401 });
    }

    const { threadId } = await params;
    if (!threadId) {
      return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
    }

    const { data: thread, error } = await admin
      .from('dm_threads')
      .select('participant_a, participant_b')
      .eq('id', threadId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!thread) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const column = activeColumnFor(
      { participant_a: thread.participant_a as string, participant_b: thread.participant_b as string },
      viewerId
    );
    if (!column) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const activeUntil = new Date(Date.now() + ACTIVE_WINDOW_MS).toISOString();
    const { error: updateError } = await admin
      .from('dm_threads')
      .update({ [column]: activeUntil })
      .eq('id', threadId);

    if (updateError) {
      if (isMissingTable(updateError, 'dm_threads')) {
        return NextResponse.json(
          { error: 'Presence is not set up yet — run the presence migration.' },
          { status: 503 }
        );
      }
      console.error('Failed to record DM presence:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ active_until: activeUntil });
  } catch (err) {
    const error = err as Error;
    console.error('Failed to record DM presence:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}