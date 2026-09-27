-- ─────────────────────────────────────────────────────────────────────────────
-- Community captions
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Why: `community_caption` is read and written by 6 files
--   src/types/vault.ts
--   src/app/api/items/[id]/route.ts
--   src/components/modals/ShareToCommunityModal.tsx
--   src/components/modals/EditCommunityPostModal.tsx
--   src/components/cards/CommunityCard.tsx
--   src/hooks/useCommunityUnread.ts
-- but the column was never actually added to `content_items`. Every community
-- post therefore comes back from GET /api/community/items with no caption key at
-- all, so the feed has nothing to render where the post text should be, and the
-- PATCH in api/items/[id] writes a column that does not exist.
--
-- Purely additive. No existing column, constraint or policy is touched.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. The post text itself. A community post IS this text plus a link, so it is
--    the primary content of the feed and must never be silently dropped.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS community_caption TEXT DEFAULT '';

-- 2. Stamped on every caption change so the feed can mark the post "(edited)".
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS community_edited_at TIMESTAMPTZ;

-- 3. Backfill: rows written before this migration hold NULL. Normalise to ''
--    so the hasCaption check in CommunityCard never has to special-case null.
UPDATE public.content_items
  SET community_caption = ''
  WHERE community_caption IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify — should list both columns with '' / null, and 0 rows still null.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'content_items'
  AND column_name IN ('community_caption', 'community_edited_at');

SELECT count(*) AS still_null
FROM public.content_items
WHERE community_caption IS NULL;
