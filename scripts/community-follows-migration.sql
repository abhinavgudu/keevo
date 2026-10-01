-- ─────────────────────────────────────────────────────────────────────────────
-- One-way follows + new_follower notification kind
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Why one table, no state column
-- ------------------------------
-- Follow is one-way (LinkedIn-style): A follows B without B accepting. So a
-- follow IS the row — (follower_id, following_id) as the primary key. The
-- toggle relies on that pair to make a double-submit idempotent, exactly like
-- community_likes does with (item_id, user_id).
--
-- Two concerns, one file, clearly sectioned: the follows table first, then the
-- notification kind CHECK update. Section 2 must run wherever this file runs
-- because the follow API writes 'new_follower' rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Section 1: follows table ─────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One follow per pair. The toggle relies on this to make a double-submit
  -- idempotent instead of inflating the follower count.
  CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id),
  -- The API rejects self-follow with a 400; this is the backstop so no path
  -- can ever write it, even a future one that forgets the check.
  CONSTRAINT follows_no_self CHECK (follower_id <> following_id)
);

-- The PK leads with follower_id ("who do I follow"). Follower counts and
-- "who follows X" need the reverse direction without a full scan.
CREATE INDEX IF NOT EXISTS idx_follows_following
  ON public.follows (following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Follow lists ride along with the public community feed, readable without a
-- session, exactly like likes and comments.
DROP POLICY IF EXISTS "Public read for follows" ON public.follows;
CREATE POLICY "Public read for follows"
  ON public.follows FOR SELECT
  USING (true);

-- You may only follow as yourself. Without this a signed-in client could
-- inflate anyone's follower count on behalf of another user.
DROP POLICY IF EXISTS "Users insert own follows" ON public.follows;
CREATE POLICY "Users insert own follows"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

-- Unfollowing is restricted to your own rows, so nobody can remove someone
-- else's follow.
DROP POLICY IF EXISTS "Users delete own follows" ON public.follows;
CREATE POLICY "Users delete own follows"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- No UPDATE policy: a follow is a flag, so following twice is a no-op and
-- unfollowing is a delete. The PRIMARY KEY is what makes that safe.

COMMIT;

-- ── Section 2: new_follower notification kind ─────────────────────────────────
--
-- Following someone notifies them, the same way liking notifies the post's
-- owner. That needs a distinct kind: the per-comment dedupe index and the
-- like UNIQUE pair both assume kinds they know, so a new kind gets its own
-- name rather than overloading 'like'.
--
-- Re-point the kind CHECK at the current list of kinds. Written as a
-- drop-then-add so re-running this file also upgrades a database that already
-- ran an earlier version of the constraint. The list below must stay the full
-- set — dropping the constraint and re-adding a partial list would reject
-- every existing row of the missing kinds.

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
  CHECK (kind IN ('new_post', 'comment', 'reply', 'mention', 'like', 'comment_like', 'post_edited', 'new_follower'));

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT count(*) AS follows FROM public.follows;
SELECT policyname, cmd FROM pg_policies
  WHERE tablename = 'follows'
  ORDER BY policyname;
