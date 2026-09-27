-- ─────────────────────────────────────────────────────────────────────────────
-- Community likes (social, per-user, with a count)
--
-- Paste into Supabase -> SQL Editor -> Run. Idempotent, safe to re-run.
--
-- Why a new table instead of reusing content_items.is_favorite
-- ----------------------------------------------------------
-- is_favorite is a private vault flag: it marks one of YOUR OWN saved items and
-- adds +30 to that item's priority score. A community like is a social signal
-- from any signed-in user about a post that is not theirs, and it has to be
-- countable. The two cannot share a column. The community card previously read
-- is_favorite for its heart button, which meant a post showed "Liked" to
-- everyone based on one person's private vault state.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.community_likes (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id    TEXT NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One like per person per post. The toggle relies on this to make a
  -- double-submit idempotent instead of inflating the count.
  CONSTRAINT community_likes_unique UNIQUE (item_id, user_id)
);

-- The feed aggregates counts across many items at once, so item_id leads.
CREATE INDEX IF NOT EXISTS idx_community_likes_item
  ON public.community_likes (item_id);
-- Supports "which posts has this user liked" when loading the feed.
CREATE INDEX IF NOT EXISTS idx_community_likes_user
  ON public.community_likes (user_id);

ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY;

-- Likes ride along with the public community feed, readable without a session,
-- exactly like the posts and their comments.
DROP POLICY IF EXISTS "Public read for community likes" ON public.community_likes;
CREATE POLICY "Public read for community likes"
  ON public.community_likes FOR SELECT
  USING (true);

-- You may only like as yourself. Without this a signed-in client could inflate
-- any post's count on behalf of another user.
DROP POLICY IF EXISTS "Users insert own community likes" ON public.community_likes;
CREATE POLICY "Users insert own community likes"
  ON public.community_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Unliking is restricted to your own like, so nobody can delete someone else's.
DROP POLICY IF EXISTS "Users delete own community likes" ON public.community_likes;
CREATE POLICY "Users delete own community likes"
  ON public.community_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- No UPDATE policy: a like is a flag, so liking twice is a no-op and unliking is
-- a delete. The UNIQUE constraint is what makes that safe.

COMMIT;

-- Verify: an empty table is correct on a fresh install.
SELECT count(*) AS community_likes FROM public.community_likes;
