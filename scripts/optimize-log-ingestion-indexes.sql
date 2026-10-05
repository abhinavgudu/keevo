-- ─────────────────────────────────────────────────────────────────────────────
-- Optimization: Index for unread count and public items query
--
-- Run this in Supabase SQL Editor:
-- Prevents sequential table scans on content_items which cause slow queries
-- and excessive Postgres log ingestion.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_content_items_public_created
  ON public.content_items (is_public, created_at DESC)
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_dm_threads_active_until
  ON public.dm_threads (participant_a_active_until, participant_b_active_until);
