-- ─────────────────────────────────────────────────────────────────────────────
-- Chat presence: typing indicators and a last-seen signal
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
-- Run AFTER dm-active-presence-migration.sql (it ALTERs dm_threads).
--
-- Why this extends the existing presence columns instead of adding a table
-- -------------------------------------------------------------------------
-- There is already `participant_a_active_until` / `participant_b_active_until`,
-- which say "this person is looking at this conversation right now". A last-seen
-- indicator is the same fact read at a different moment, so it needs no new
-- state: the most recent value of that column is when they were last here.
-- Inventing a second mechanism for it would mean two answers to one question.
--
-- Why typing is an expiry and not a boolean
-- -----------------------------------------
-- The same reason presence is: a boolean set to true and never cleared survives a
-- closed tab, a crashed process and a sleeping laptop, and the other person then
-- stares at a typing indicator that will never stop. An expiry drains on its own.
--
-- Typing gets a much shorter window than presence. Presence can afford ~20s
-- because a stale "online" is harmless. A stale "typing…" is not: it is a claim
-- that someone is composing a message right now, so it must stop quickly after
-- they stop or stop looking. The heartbeat that writes it is throttled, so this
-- is written on a transition rather than on every keystroke.
--
-- Scope note: nothing here is a delivery receipt. "Delivered" cannot be derived
-- from any of this — that needs per-device acknowledgements, which this does not
-- claim. A message shows sent, or read, and never a middle state it cannot prove.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.dm_threads
  ADD COLUMN IF NOT EXISTS participant_a_typing_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS participant_b_typing_until TIMESTAMPTZ;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- All four columns present and nullable. A non-null default would make everyone
-- look permanently online and permanently typing.
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'dm_threads'
    AND (
      column_name LIKE '%_active_until'
      OR column_name LIKE '%_typing_until'
    )
  ORDER BY column_name;