import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DELETED_PLACEHOLDER, DELETE_WINDOW_MS } from '@/lib/messages';

/**
 * Delete a direct message for everyone, inside a short window.
 *
 * Soft-deletes: the row survives with `deleted_at` set and the body emptied, so
 * the transcript shows "This message was deleted" and replies pointing at it keep
 * a target. A hard delete would silently strip the quote from a reply that is
 * still readable, and would make a deleted message indistinguishable from one
 * that was never sent — two different accounts of what happened between two
 * people.
 *
 * The row is NOT removed from the database. It is marked.
 *
 * Three things are refused, all of them here rather than in the UI because the UI
 * is not the guard:
 *   - deleting somebody else's message, in either direction
 *   - deleting after the window has passed
 *   - deleting something already deleted
 *
 * The write uses the service role on purpose. Granting clients an UPDATE policy
 * on their own rows would also let them rewrite the body of any message they
 * sent, which is a far larger hole than the one being closed here.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const header = request.headers.get('Authorization');
    if (!header) {
      return NextResponse.json({ error: 'Sign in to delete a message' }, { status: 401 });
    }
    const token = header.replace('Bearer ', '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Sign in to delete a message' }, { status: 401 });
    }

    const { data: userData } = await createClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    ).auth.getUser();

    const viewerId = userData?.user?.id;
    if (!viewerId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { messageId } = await params;
    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    const { data: message, error: readError } = await admin
      .from('dm_messages')
      .select('id, thread_id, sender_id, created_at, deleted_at')
      .eq('id', messageId)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!message) {
      // Also covers "belongs to somebody else" — a message id that is not the
      // caller's must not be confirmed as existing.
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.sender_id !== viewerId) {
      return NextResponse.json(
        { error: 'You can only delete messages you sent.' },
        { status: 403 }
      );
    }

    if (message.deleted_at) {
      return NextResponse.json({ error: 'This message was already deleted.' }, { status: 409 });
    }

    // Measured against the server's clock. The client is told the same limit for
    // when to show the affordance, but it is not what decides.
    const age = Date.now() - new Date(message.created_at as string).getTime();
    if (Number.isNaN(age) || age > DELETE_WINDOW_MS) {
      const mins = Math.round(DELETE_WINDOW_MS / 60000);
      return NextResponse.json(
        { error: `You can only delete a message within ${mins} minutes of sending it.` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from('dm_messages')
      // The body is emptied as part of the same statement, so there is no window
      // in which a deleted message still shows its text.
      .update({ deleted_at: now, body: DELETED_PLACEHOLDER })
      .eq('id', messageId)
      .eq('sender_id', viewerId)
      .is('deleted_at', null);

    if (updateError) {
      if (/deleted_at/.test(updateError.message || '') && /does not exist/.test(updateError.message || '')) {
        return NextResponse.json(
          { error: 'Message deletion is not set up yet — run the delete migration.' },
          { status: 503 }
        );
      }
      console.error('Failed to delete DM:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ deleted_at: now });
  } catch (err) {
    const error = err as Error;
    console.error('Failed to delete DM:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}