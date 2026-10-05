-- =============================================================================
-- REDUCE SUPABASE LOG INGESTION BELOW 1 GB/MONTH
--
-- Run this entire script in Supabase Dashboard → SQL Editor.
-- Safe to re-run; all statements are idempotent.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Fix REPLICA IDENTITY on dm_threads
--
-- FULL = before + after image in WAL on every UPDATE → doubles log bytes.
-- DEFAULT = only primary key in WAL.
-- Trade-off: Realtime UPDATE events won't carry old column values — fine for
-- typing/presence since we only ever care about the NEW value.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.dm_threads  REPLICA IDENTITY DEFAULT;
ALTER TABLE public.dm_messages REPLICA IDENTITY DEFAULT;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 (OPTIONAL): Remove dm_threads from Realtime entirely
-- Uncomment if you don't need instant typing dots (45-s poll fallback is fine).
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.dm_threads;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Indexes — prevent seq-scans that inflate planner log lines
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_content_items_public_created
  ON public.content_items (is_public, created_at DESC)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_dm_threads_active_until
  ON public.dm_threads (participant_a_active_until, participant_b_active_until);

CREATE INDEX IF NOT EXISTS idx_dm_threads_participant_a
  ON public.dm_threads (participant_a, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_dm_threads_participant_b
  ON public.dm_threads (participant_b, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_created
  ON public.dm_messages (thread_id, created_at ASC);

-- Unread notifications: most queries filter by recipient + unread (read_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_community_notifications_recipient
  ON public.community_notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Presence is now 100% Realtime Broadcast (In-Memory WebSockets)
--
-- No DB writes, no WAL logs, and no periodic pg_cron UPDATE needed!
-- Presence and typing events are broadcasted peer-to-peer through Supabase Realtime
-- channels without touching postgres disk or generating WAL entries.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Vacuum / analyze to pick up new indexes immediately
-- ─────────────────────────────────────────────────────────────────────────────
ANALYZE public.dm_threads;
ANALYZE public.dm_messages;
ANALYZE public.content_items;
ANALYZE public.community_notifications;
