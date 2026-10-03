-- ─────────────────────────────────────────────────────────────────────────────
-- 1:1 direct messages + realtime delivery
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Why two tables
-- --------------
-- `dm_threads` is one row per conversation, `dm_messages` the lines inside it.
-- A conversation needs to exist before its first message can be sent (the
-- sender may never press "send" — opening the composer must already create the
-- thread), and it needs a row to hang `last_message_at` on so the inbox can be
-- ordered without scanning every message.
--
-- Why the pair columns, not just `thread_id`
-- ------------------------------------------
-- RLS cannot say "I am a participant" using the pair columns alone without
-- first proving membership, and the participants are two scalars. Keeping both
-- `sender_id` and `recipient_id` on the message row makes "can I read this
-- line?" a single-column comparison the database evaluates without a join —
-- which is what keeps the policy from depending on dm_threads being readable.
--
-- Why a unique index on the sorted pair
-- ------------------------------------
-- Two people must never end up with two parallel conversations. The pair is
-- stored with sender_id < recipient_id (see pair_key), so the unique index on
-- (a, b) makes a duplicate impossible no matter who opens the composer first.
-- Without it, opening the same chat on two devices would fork the thread.
--
-- Section 3 matters: Realtime respects RLS only for changes it can attribute to
-- a publication, so the messages table must be added to the publication or the
-- chat renders but never updates.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Section 1: threads ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dm_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Always stored in sorted order so one row exists per pair regardless of who
  -- started the conversation. See the unique index below.
  participant_a   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  last_preview    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Same backstop as follows_no_self: the API rejects this, but so does the
  -- database, so no future caller can write it.
  CONSTRAINT dm_threads_no_self CHECK (participant_a <> participant_b),
  CONSTRAINT dm_threads_one_pair CHECK (participant_a < participant_b)
);

-- One conversation per pair of people, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS dm_threads_pair_uniq
  ON public.dm_threads (participant_a, participant_b);

-- Inbox ordering: "my conversations, most recent first". Without this the
-- ordering would degrade to a scan over every thread the user is in.
CREATE INDEX IF NOT EXISTS idx_dm_threads_participant_a
  ON public.dm_threads (participant_a, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_dm_threads_participant_b
  ON public.dm_threads (participant_b, last_message_at DESC NULLS LAST);

ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;

-- A conversation is private to its two participants. There is no public read:
-- unlike follows and likes, a DM is not part of the community feed.
DROP POLICY IF EXISTS "Participants read own threads" ON public.dm_threads;
CREATE POLICY "Participants read own threads"
  ON public.dm_threads FOR SELECT
  TO authenticated
  USING (auth.uid() = participant_a OR auth.uid() = participant_b);

-- You may only open a conversation you are one half of.
DROP POLICY IF EXISTS "Participants insert own threads" ON public.dm_threads;
CREATE POLICY "Participants insert own threads"
  ON public.dm_threads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

-- Updating last_message_at is how a conversation resurfaces in the inbox. Only a
-- participant may do it, and there is no DELETE policy: leaving a conversation
-- is not part of the product.
DROP POLICY IF EXISTS "Participants update own threads" ON public.dm_threads;
CREATE POLICY "Participants update own threads"
  ON public.dm_threads FOR UPDATE
  TO authenticated
  USING (auth.uid() = participant_a OR auth.uid() = participant_b)
  WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

-- ── Section 2: messages ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Mirrors the thread's participants, denormalized on purpose: the read policy
  -- then needs no join and cannot be bypassed by a thread the caller cannot read.
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  -- Client-generated id. The unique index turns a double-submit (Enter twice,
  -- flaky connection retrying) into a no-op instead of a duplicated line.
  client_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- An empty message is not a message. Enforced here so a blank send is
  -- rejected even if the UI check is bypassed.
  CONSTRAINT dm_messages_body_not_blank CHECK (length(btrim(body)) > 0),
  -- The sender is always one of the two, so nobody can address a third party.
  CONSTRAINT dm_messages_no_self CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_created
  ON public.dm_messages (thread_id, created_at DESC);

-- Idempotency key for the sender. Partial so clients may omit it entirely.
CREATE UNIQUE INDEX IF NOT EXISTS dm_messages_client_uniq
  ON public.dm_messages (sender_id, client_id)
  WHERE client_id IS NOT NULL;

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

-- Both parties read. This is the hot path for opening a chat.
DROP POLICY IF EXISTS "Participants read own messages" ON public.dm_messages;
CREATE POLICY "Participants read own messages"
  ON public.dm_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Only the sender can write, and only a message addressed to somebody else.
DROP POLICY IF EXISTS "Users insert own messages" ON public.dm_messages;
CREATE POLICY "Users insert own messages"
  ON public.dm_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id AND auth.uid() <> recipient_id);

-- No UPDATE and no DELETE policy, deliberately. Once a line is sent it is part
-- of a two-person record and neither side may rewrite or erase it. If recall is
-- ever needed it has to be added as an explicit, audited feature rather than
-- falling out of a missing policy.

COMMIT;

-- ── Section 3: realtime ─────────────────────────────────────────────────────
--
-- Without the publication rows the chat loads but never updates, which reads as
-- "realtime is broken" rather than "realtime is off". Re-running this block is
-- harmless: adding a table already in the publication raises a notice, not an
-- error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
  END IF;
END $$;

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT count(*) AS threads FROM public.dm_threads;
SELECT count(*) AS messages FROM public.dm_messages;
SELECT pubname, tablename FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND tablename = 'dm_messages';
SELECT policyname, cmd FROM pg_policies
  WHERE tablename IN ('dm_threads', 'dm_messages')
  ORDER BY tablename, policyname;