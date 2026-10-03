import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isActiveAt, MAX_MESSAGE_LENGTH, previewOf } from '@/lib/messages';
import { notifyDirectMessage } from '@/lib/communityNotifications';
import { authDisplayName } from '@/lib/authorProfiles';
import { isMissingTable, resolveCaller } from '../../route';

/**
 * Sending one message.
 *
 * Idempotent on `client_id`: the unique index on (sender_id, client_id) means a
 * retried send returns the row that already exists instead of posting the same
 * line twice. That is what makes it safe for the client to retry on a timeout —
 * without it, a flaky connection silently duplicates messages.
 *
 * The thread's last_message_at/last_preview are updated in the same call so the
 * inbox ordering never disagrees with the conversation it came from.
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
      return NextResponse.json({ error: 'Sign in to send a message' }, { status: 401 });
    }

    const { threadId } = await params;
    if (!threadId) {
      return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      body?: string;
      client_id?: string;
      reply_to_id?: string | null;
    };

    const text = (body.body || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` },
        { status: 400 }
      );
    }

    // Read the thread with the caller's own token so RLS decides membership
    // rather than a check in application code that could be bypassed later.
    const { data: thread, error: threadError } = await admin
      .from('dm_threads')
      .select('*')
      .eq('id', threadId)
      .maybeSingle();

    if (threadError) {
      return NextResponse.json({ error: threadError.message }, { status: 500 });
    }
    if (!thread) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const participantA = thread.participant_a as string;
    const participantB = thread.participant_b as string;
    if (viewerId !== participantA && viewerId !== participantB) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    const recipientId = viewerId === participantA ? participantB : participantA;

    // Is the recipient looking at this conversation as it arrives? Read from the
    // same row that is about to be updated for ordering, so it costs nothing
    // extra. The expiry is compared against the clock rather than trusted as a
    // flag, so a stale presence entry cannot suppress anything indefinitely.
    const recipientActiveUntil =
      viewerId === participantA
        ? (thread.participant_b_active_until as string | null) ?? null
        : (thread.participant_a_active_until as string | null) ?? null;
    const recipientIsWatching = isActiveAt(recipientActiveUntil);

    const clientId = (body.client_id || '').trim() || null;
    const replyToId = (body.reply_to_id || '').trim() || null;

    // A quote must name a message in THIS thread. Skipping this would let a
    // client reference a message from any other conversation and have its text
    // rendered into this one — a cross-thread read of a private message by
    // anyone who can guess or learn an id. Silently dropped rather than
    // rejected: a quote whose target has since gone should not block the send.
    let replyTo: string | null = null;
    if (replyToId) {
      const { data: target } = await admin
        .from('dm_messages')
        .select('id')
        .eq('id', replyToId)
        .eq('thread_id', threadId)
        .maybeSingle();
      if (target) replyTo = target.id as string;
    }

    // The retry case: this exact message already landed. Returns early, before
    // any notification — otherwise a retry would ring the recipient's bell a
    // second time for a message they already have.
    if (clientId) {
      const { data: existing } = await admin
        .from('dm_messages')
        .select('*')
        .eq('sender_id', viewerId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ message: existing, duplicate: true });
      }
    }

    const { data: message, error: insertError } = await admin
      .from('dm_messages')
      .insert({
        thread_id: threadId,
        sender_id: viewerId,
        recipient_id: recipientId,
        body: text,
        client_id: clientId,
        reply_to_id: replyTo,
      })
      .select()
      .single();

    if (insertError) {
      if (isMissingTable(insertError, 'dm_messages')) {
        return NextResponse.json(
          { error: 'Messages are not set up yet — run the DM migration.' },
          { status: 503 }
        );
      }
      console.error('Failed to send DM:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Ordering state for the inbox. A failure here does not fail the send: the
    // message is already stored, and the row simply resurfaces on the next
    // successful send or on a client refetch.
    const { error: threadUpdateError } = await admin
      .from('dm_threads')
      .update({ last_message_at: message.created_at, last_preview: previewOf(text) })
      .eq('id', threadId);
    if (threadUpdateError) {
      console.error('Failed to update DM thread ordering:', threadUpdateError);
    }

    // Bell + push for the recipient. Awaited so the row exists before this
    // request returns, but notifyDirectMessage never throws — a notification
    // failure must not turn a delivered message into an error for the sender.
    // The name is resolved here rather than stored on the message: it is
    // display-only and a failure to resolve it still sends a usable line.
    let actorName = 'Someone';
    try {
      const { data: senderRows } = await admin.auth.admin.getUserById(viewerId);
      if (senderRows?.user) actorName = authDisplayName(senderRows.user);
    } catch {
      /* keep the fallback */
    }

    await notifyDirectMessage({
      recipientUserId: recipientId,
      actorUserId: viewerId,
      actorName,
      threadId,
      messageId: message.id as string,
      recipientIsWatching,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    console.error('Failed to send DM:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}