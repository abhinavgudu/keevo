-- ─────────────────────────────────────────────────────────────────────────────
-- Editable community comments
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Why this file exists
-- --------------------
-- The original comments migration ended with "comments are immutable" and no
-- UPDATE policy, so edits were delete-and-repost. Members now expect an Edit
-- button next to Delete on their own comments and replies, so this adds the
-- one missing piece: an UPDATE policy scoped to the caller's own rows, plus an
-- `edited_at` stamp so the feed can mark an edited comment like it already
-- marks edited posts.
--
-- Purely additive. The delete cascade, the public read policy and the
-- insert policy are untouched.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Stamped on every body change so readers can tell an edited comment apart
-- from one written that way. NULL means never edited.
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- You may only edit your own comment. Without this the PATCH route's
-- `.eq('user_id', user.id)` update matches zero rows and reports "not found",
-- so someone else's comment can never be rewritten through the API.
DROP POLICY IF EXISTS "Users update own community comments" ON public.community_comments;
CREATE POLICY "Users update own community comments"
  ON public.community_comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- Verify.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'community_comments'
  AND column_name = 'edited_at';

SELECT policyname, cmd FROM pg_policies
  WHERE tablename = 'community_comments'
  ORDER BY policyname;
