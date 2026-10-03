-- ─────────────────────────────────────────────────────────────────────────────
-- Reply quoting for direct messages
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
-- Run AFTER community-messages-migration.sql (it ALTERs dm_messages).
--
-- Why only an id, and not a copy of the quoted text
-- -----------------------------------------------
-- A reply shows "Replying to Abhinav: <text>". That text could be stored
-- alongside the reply, but it does not need to be: every message in a thread is
-- already loaded to render the conversation, so the quoted line is resolved at
-- render time by looking the id up in the list the client already holds.
--
-- Storing it would mean private message text exists in a second place, which
-- has to then be redacted, deleted and access-controlled in lockstep with the
-- original — for zero benefit. The id is the whole truth.
--
-- Why ON DELETE SET NULL rather than CASCADE
-- ------------------------------------------
-- dm_messages has no delete policy on purpose: a sent line cannot be erased. But
-- the FK still exists as a backstop. If a line ever does go away, the reply that
-- quoted it must survive with a plain "quoted a message" placeholder rather than
-- cascading away and taking a message the user actually sent with it.
--
-- Why no index on reply_to_id
-- --------------------------
-- Nothing queries by it. The client resolves the quote from the thread it has
-- already loaded, so an index here would only pay write cost.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.dm_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.dm_messages(id) ON DELETE SET NULL;

-- A message cannot quote itself. Backstop for a client that passes its own id
-- while an optimistic send is still resolving.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dm_messages_no_self_quote'
  ) THEN
    ALTER TABLE public.dm_messages
      ADD CONSTRAINT dm_messages_no_self_quote CHECK (reply_to_id IS DISTINCT FROM id);
  END IF;
END $$;

COMMIT;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- reply_to_id present, nullable, and pointing at dm_messages (SET NULL).
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'dm_messages' AND column_name = 'reply_to_id';

SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conname = 'dm_messages_no_self_quote';