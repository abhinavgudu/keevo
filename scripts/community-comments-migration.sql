-- ─────────────────────────────────────────────────────────────────────────────
-- Community comments (LinkedIn-style, one level of reply)
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Note on author_name / author_email: these are denormalised copies captured at
-- insert time on purpose. The community feed already resolves authors via
-- auth.admin.listUsers(), which fetches EVERY user and filters in JS. Doing that
-- again per comment list would make each open of a post an O(all users) call.
-- A comment's author name never needs to change, so it is stored inline.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_comments (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id     TEXT NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- One level of reply only. A reply points at a top-level comment. The API
  -- rejects a parent_id whose own parent_id is set, so threads cannot nest
  -- arbitrarily deep even though the column would allow it.
  parent_id   TEXT REFERENCES public.community_comments(id) ON DELETE CASCADE,

  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  author_name  TEXT NOT NULL DEFAULT '',
  author_email TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The feed reads comments for one item, oldest first, top-level rows before
-- their replies. This index covers that access pattern.
CREATE INDEX IF NOT EXISTS idx_community_comments_item
  ON public.community_comments (item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_comments_parent
  ON public.community_comments (parent_id);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

-- Comments ride along with the public community feed, so they are readable
-- without a session exactly like the posts themselves.
DROP POLICY IF EXISTS "Public read for community comments" ON public.community_comments;
CREATE POLICY "Public read for community comments"
  ON public.community_comments FOR SELECT
  USING (true);

-- You may only write a comment as yourself.
DROP POLICY IF EXISTS "Users insert own community comments" ON public.community_comments;
CREATE POLICY "Users insert own community comments"
  ON public.community_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- You may only delete your own comment. Deleting a top-level comment cascades
-- to its replies.
DROP POLICY IF EXISTS "Users delete own community comments" ON public.community_comments;
CREATE POLICY "Users delete own community comments"
  ON public.community_comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Edits live in community-comments-edit-migration.sql: an UPDATE policy scoped
-- to your own rows plus an edited_at stamp. Kept separate so databases that
-- already ran this file pick the edit up by running that one file.
