-- ─────────────────────────────────────────────────────────────────────────────
-- Active-conversation presence, for notification suppression
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
-- Run AFTER community-messages-migration.sql (it ALTERs dm_threads).
--
-- What this is for
-- ----------------
-- When you are reading a conversation, a bell entry and a push for the message
-- arriving in that same conversation are noise: the message is on screen. So the
-- send path needs to know whether the recipient is currently looking at that
-- conversation, and the only place that truth exists is the recipient's browser.
--
-- Why a timestamp with an expiry, not a boolean
-- --------------------------------------------
-- A boolean `is_open` is a lie waiting to happen. The tab can be closed, the
-- laptop can sleep, the process can be killed — and the flag stays set forever,
-- so a message sent a week later would be silently swallowed. An expiry means
-- the signal heals itself: whatever the browser stops doing, the worst case is
-- that the flag is wrong for one short window.
--
-- Why two columns and not a separate presence table
-- -------------------------------------------------
-- Same reasoning as the read cursors. A 1:1 conversation has exactly two
-- participants, already stored as a sorted pair, so "who is looking at this and
-- until when" is two more columns on the row we are already updating when a
-- message is sent. No extra table, no join, no cleanup job.
--
-- Why the recipient is NOT marked read here
-- ------------------------------------------
-- Suppression is decided at send time by the API, which sets read_at on the
-- notification row when it is in fact active. Doing it in SQL would make a
-- database trigger responsible for a product decision, and the trigger could
-- not see the HTTP request that made the decision.
--
-- Scope note: this does not suppress a notification for the recipient's OTHER
-- devices. Push delivery has no per-device context — it goes to every
-- subscription the user owns — so a phone in a pocket still buzzes. That is
-- deliberate: knowing one browser is reading a thread is not evidence that the
-- phone in the other pocket should stay quiet.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.dm_threads
  ADD COLUMN IF NOT EXISTS participant_a_active_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS participant_b_active_until TIMESTAMPTZ;

COMMIT;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Both columns present and nullable. A non-null default would mean every
-- conversation counts as active.
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'dm_threads'
    AND column_name LIKE '%_active_until'
  ORDER BY column_name;