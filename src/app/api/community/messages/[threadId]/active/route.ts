import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  TYPING_WINDOW_MS,
  ACTIVE_WINDOW_MS,
  activeColumnFor,
  typingColumnFor,
} from '@/lib/messages';
import { isMissingTable, resolveCaller } from '../../route';

/**
 * Presence and typing heartbeat.
 *
 * One endpoint for both because they are written on the same tick and read on the
 * same tick: splitting them would mean two round trips per heartbeat to record
 * one fact about one person.
 *
 * Body: { typing: boolean }. Presence is always refreshed; typing is only touched
 * when the flag is sent, so a client that never types does not keep clearing it.
 *
 * Both are expiries rather than booleans. A boolean survives a closed tab, a
 * crashed process and a sleeping laptop, and the other person is then left
 * looking at a typing indicator or an online dot that nothing will ever clear.
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
      .select('participant_a, participant_b, participant_a_active_until, participant_b_active_until')
      .eq('id', threadId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!thread) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const participants = {
      participant_a: thread.participant_a as string,
      participant_b: thread.participant_b as string,
    };

    const presenceColumn = activeColumnFor(participants, viewerId);
    const typingColumn = typingColumnFor(participants, viewerId);
    if (!presenceColumn || !typingColumn) {
      // Not a participant, so the thread's existence is not confirmed.
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { typing?: boolean };
    const isTypingUpdate = typeof body.typing === 'boolean';

    // Skip pure-presence heartbeat writes if the current window is already fresh
    // enough (still has > 20 s left). Writing every 45 s but skipping when not
    // needed means a 2-person chat that is open on both sides generates at most
    // one DB UPDATE per 45 s instead of one per second.
    if (!isTypingUpdate) {
      const currentUntil = (thread as Record<string, unknown>)[presenceColumn] as string | null;
      if (currentUntil) {
        const remaining = new Date(currentUntil).getTime() - Date.now();
        if (remaining > 20_000) {
          // Window still has plenty of time; skip the write entirely.
          return NextResponse.json({ ok: true, skipped: true });
        }
      }
    }

    const patch: Record<string, string | null> = {
      [presenceColumn]: new Date(Date.now() + ACTIVE_WINDOW_MS).toISOString(),
    };

    if (isTypingUpdate) {
      patch[typingColumn] = body.typing
        ? new Date(Date.now() + TYPING_WINDOW_MS).toISOString()
        : // Stopped typing: cleared now rather than left to expire, so the
          // indicator disappears the moment they stop instead of lingering.
          null;
    }

    const { error: updateError } = await admin
      .from('dm_threads')
      .update(patch)
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as Error;
    console.error('Failed to record DM presence:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}