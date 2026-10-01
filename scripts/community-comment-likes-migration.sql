-- ─────────────────────────────────────────────────────────────────────────────
-- Community comment likes (social, per-user, with a count)
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Why a separate table instead of reusing community_likes
-- -------------------------------------------------------
-- community_likes is keyed (item_id, user_id): one row per person per POST.
-- A like on a comment needs (comment_id, user_id) instead, and mixing the two
-- in one table would let a post like and a comment like collide on the UNIQUE
-- pair. The toggle relies on the UNIQUE pair to make a double-submit
-- idempotent instead of inflating the count, so each target gets its own
-- table, exactly like posts did.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.community_comment_likes (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  comment_id TEXT NOT NULL REFERENCES public.community_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One like per person per comment. The toggle relies on this to make a
  -- double-submit idempotent instead of inflating the count.
  CONSTRAINT community_comment_likes_unique UNIQUE (comment_id, user_id)
);

-- The thread aggregates counts across many comments at once, so comment_id leads.
CREATE INDEX IF NOT EXISTS idx_community_comment_likes_comment
  ON public.community_comment_likes (comment_id);
-- Supports "which comments has this user liked" when loading the thread.
CREATE INDEX IF NOT EXISTS idx_community_comment_likes_user
  ON public.community_comment_likes (user_id);

ALTER TABLE public.community_comment_likes ENABLE ROW LEVEL SECURITY;

-- Comment likes ride along with the public community feed, readable without a
-- session, exactly like the comments themselves.
DROP POLICY IF EXISTS "Public read for community comment likes" ON public.community_comment_likes;
CREATE POLICY "Public read for community comment likes"
  ON public.community_comment_likes FOR SELECT
  USING (true);

-- You may only like as yourself. Without this a signed-in client could inflate
-- any comment's count on behalf of another user.
DROP POLICY IF EXISTS "Users insert own community comment likes" ON public.community_comment_likes;
CREATE POLICY "Users insert own community comment likes"
  ON public.community_comment_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Unliking is restricted to your own like, so nobody can delete someone else's.
DROP POLICY IF EXISTS "Users delete own community comment likes" ON public.community_comment_likes;
CREATE POLICY "Users delete own community comment likes"
  ON public.community_comment_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- No UPDATE policy: a like is a flag, so liking twice is a no-op and unliking
-- is a delete. The UNIQUE constraint is what makes that safe.

COMMIT;

-- Verify: an empty table is correct on a fresh install.
SELECT count(*) AS community_comment_likes FROM public.community_comment_likes;
