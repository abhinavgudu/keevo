-- ─────────────────────────────────────────────────────────────────────────────
-- DM notifications: the 'dm_message' kind + thread_id column
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Requires community-messages-migration.sql to have been run first: thread_id
-- is a real foreign key, so this file cannot create it before dm_threads exists.
--
-- Scope note: a DM joins the SAME bell as comments and likes. It is not a second
-- feed and does not touch the Community tab badge — that badge counts unread
-- posts only, and this file must never be wired into it.
--
-- Why the message body is not stored here
-- --------------------------------------
-- The bell line is "Abhinav sent you a message", and the excerpt it shows comes
-- from dm_messages at read time. A private message is not copied into the
-- notification table, so the notification feed can never become a second, less
-- protected copy of somebody's correspondence — this table already has to be
-- readable by the service role for every admin query, and duplicating message
-- text into it would widen that surface for no benefit.
--
-- Why ON DELETE CASCADE matters most here
-- ---------------------------------------
-- A conversation that is deleted must not leave a bell entry pointing at a
-- thread that no longer opens. The cascade makes that automatic.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Section 1: the thread reference ──────────────────────────────────────────

ALTER TABLE public.community_notifications
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.dm_threads(id) ON DELETE CASCADE;

-- Which message this row is about, so a retried send is a no-op. NULL for every
-- other kind: comment_id and item_id already carry that job for them.
ALTER TABLE public.community_notifications
  ADD COLUMN IF NOT EXISTS dm_message_id UUID REFERENCES public.dm_messages(id) ON DELETE CASCADE;

-- ── Section 2: the new kind ──────────────────────────────────────────────────
--
-- Re-point the kind CHECK at the full list of kinds. Written drop-then-add so
-- re-running this file also upgrades a database that already ran an earlier
-- version of the constraint. The list must stay complete: dropping the
-- constraint and re-adding a partial list would reject every existing row of the
-- missing kinds.

DO $$
DECLARE
  kind_check TEXT;
BEGIN
  SELECT con.conname INTO kind_check
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'community_notifications'
    AND con.contype = 'c'
    AND att.attname = 'kind';

  IF kind_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.community_notifications DROP CONSTRAINT %I', kind_check);
  END IF;
END $$;

ALTER TABLE public.community_notifications
  ADD CONSTRAINT community_notifications_kind_check
  CHECK (kind IN ('new_post', 'comment', 'reply', 'mention', 'like', 'comment_like',
                  'post_edited', 'new_follower', 'dm_message'));

-- ── Section 3: one notification per message ──────────────────────────────────
--
-- Sends are retried by design — the client reuses its client_id on a timeout —
-- and the same insert must not produce two bell entries. Keyed on the message
-- id rather than the thread, because every message deserves its own bell line
-- while every *send attempt* deserves only one.

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_notifications_dm_uniq
  ON public.community_notifications (dm_message_id)
  WHERE kind = 'dm_message' AND dm_message_id IS NOT NULL;

-- ── Section 4: reading the DM feed ───────────────────────────────────────────
--
-- The bell is opened far more often than it is written to, and the DM rows are
-- the ones that get marked read in bulk. Without this the read-state sweep
-- scans the whole table.

CREATE INDEX IF NOT EXISTS idx_community_notifications_unread
  ON public.community_notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

COMMIT;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- kind must include dm_message; both new columns must exist and be nullable.
SELECT con.conname, pg_get_constraintdef(con.oid)
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'community_notifications' AND con.contype = 'c'
    AND con.conname = 'community_notifications_kind_check';

SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'community_notifications'
    AND column_name IN ('thread_id', 'dm_message_id')
  ORDER BY column_name;