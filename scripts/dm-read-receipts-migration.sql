-- ─────────────────────────────────────────────────────────────────────────────
-- Per-participant read receipts for direct messages
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
-- Run AFTER community-messages-migration.sql (it ALTERs dm_threads).
--
-- Why read state lives on dm_threads and not in a separate table
-- ------------------------------------------------------------
-- A 1:1 conversation has exactly two participants and the row already stores
-- them as a sorted pair (participant_a < participant_b). So "how far has each
-- person read" is two more timestamps on that same row — no extra table, no
-- join, and no chance of the inbox and the read cursor disagreeing because they
-- were read at different moments.
--
-- A separate dm_thread_reads table would only pay off if a conversation could
-- have a variable number of participants. It cannot: the CHECK on dm_threads
-- pins it to exactly two. When group threads ever arrive, this is the thing to
-- replace, and it should be replaced then rather than paid for now.
--
-- Why NULL means "nothing read yet"
-- ---------------------------------
-- A brand new thread has both columns NULL, and every message in it is unread.
-- Defaulting them to NOW() instead would silently mark a conversation read the
-- moment it is created, which is exactly the bug this design avoids.
--
-- Why this does not touch the notification bell
-- ---------------------------------------------
-- community_notifications.read_at is a separate, coarser thing: "you have seen
-- the bell line". This is "you have read the messages in this conversation".
-- Opening a conversation marks these, which leaves the bell line unread on
-- purpose — otherwise the bell would clear itself the moment you read the chat
-- it was pointing at, and you would lose the record that it ever arrived.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.dm_threads
  ADD COLUMN IF NOT EXISTS participant_a_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS participant_b_read_at TIMESTAMPTZ;

-- The inbox counts "messages newer than my cursor" for every conversation at
-- once, so the cursor has to be reachable without reading each row's peers.
-- These are already covered by the participant indexes from the DM migration
-- (participant_a / participant_b lead those indexes), so no new index is needed
-- here — the columns ride along in the same index entries.

COMMIT;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Both columns present and nullable. A non-null default would mean unread
-- messages were being silently marked read.
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'dm_threads'
    AND column_name LIKE '%_read_at'
  ORDER BY column_name;