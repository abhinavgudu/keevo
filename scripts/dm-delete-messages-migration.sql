-- ─────────────────────────────────────────────────────────────────────────────
-- Delete a direct message for everyone, inside a time limit
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
-- Run AFTER community-messages-migration.sql (it ALTERs dm_messages).
--
-- Why the row is not deleted
-- --------------------------
-- A hard delete is the obvious implementation and it is the wrong one. Two
-- things break:
--
--   - A reply quotes the message it answers. reply_to_id is ON DELETE SET NULL, so
--     hard-deleting the parent silently strips the quote from a reply that is
--     still perfectly readable — the reply now floats with no context, and
--     nothing explains why.
--   - "This message was deleted" is itself information the conversation needs. A
--     vanished message reads as a message that was never sent, which is a
--     different (and wrong) account of what happened between two people.
--
-- So the row survives with deleted_at set and the body emptied. The tombstone is
-- what both of those need, and it costs one column.
--
-- Why the empty body is allowed only when deleted
-- -----------------------------------------------
-- The original table has `CHECK (length(btrim(body)) > 0)`, which exists so a
-- blank send is rejected. That check would reject the tombstone too, so it is
-- relaxed to exempt deleted rows rather than removed: a live message must still
-- have text, which is the invariant actually worth keeping.
--
-- Why there is deliberately still NO update policy for clients
-- -------------------------------------------------------------
-- Soft-deleting needs an UPDATE, and adding one for the client's own rows would
-- also let a client rewrite the body of its own messages at will. Instead the
-- whole rule — sender only, inside the window — lives in the API route, which
-- writes with the service role, and the client keeps no UPDATE or DELETE grant
-- on this table at all. That is the same posture the rest of this schema takes:
-- clients read their own rows, and every write goes through a route that
-- validates it.
--
-- Why the window is a constant here as well as in the API
-- ---------------------------------------------------
-- The API enforces it, which is what actually decides. It is repeated as a
-- column comment because the limit is otherwise invisible to anyone reading the
-- table, and "how long do I have to unsend something" is exactly the question
-- somebody will ask of this schema.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.dm_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.dm_messages.deleted_at IS
  'Set instead of deleting the row, within 15 minutes of created_at. A NULL means a live message; the tombstone is what keeps replies pointing at something meaningful.';

-- A live message must still have text; a deleted one is empty by design.
ALTER TABLE public.dm_messages DROP CONSTRAINT IF EXISTS dm_messages_body_not_blank;
ALTER TABLE public.dm_messages
  ADD CONSTRAINT dm_messages_body_not_blank
  CHECK (deleted_at IS NOT NULL OR length(btrim(body)) > 0);

-- ── Verify ───────────────────────────────────────────────────────────────────
-- deleted_at present; the body check now exempts tombstones.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'dm_messages' AND column_name = 'deleted_at';

SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conname = 'dm_messages_body_not_blank';