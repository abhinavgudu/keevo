-- ─────────────────────────────────────────────────────────────────────────────
-- LinkedIn-style post reactions
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Why a column instead of a new table
-- -----------------------------------
-- A member has exactly one reaction per post — the same (item_id, user_id)
-- UNIQUE pair the like toggle already relies on. Switching from Like to Love
-- is therefore an UPDATE of that row, and un-reacting is still a DELETE, so
-- the toggle stays idempotent and the total count stays exact. No second
-- table, no second count to keep in sync.
--
-- Purely additive apart from the widened CHECK: every existing like becomes a
-- 'like' reaction via the column DEFAULT, and the new UPDATE policy is scoped
-- to the caller's own rows, exactly like the delete policy.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.community_likes
  ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'like';

DO $$
DECLARE
  reaction_check TEXT;
BEGIN
  SELECT con.conname INTO reaction_check
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'community_likes'
    AND con.contype = 'c'
    AND att.attname = 'reaction';

  IF reaction_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.community_likes DROP CONSTRAINT %I', reaction_check);
  END IF;
END $$;

ALTER TABLE public.community_likes
  ADD CONSTRAINT community_likes_reaction_check
  CHECK (reaction IN ('like', 'celebrate', 'support', 'love', 'insightful', 'funny'));

-- Switching reactions is an UPDATE of your own row, so it needs its own
-- policy. Without this, changing Like to Love matches zero rows and the card
-- would roll its optimistic update back every time.
DROP POLICY IF EXISTS "Users update own community likes" ON public.community_likes;
CREATE POLICY "Users update own community likes"
  ON public.community_likes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- Verify.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'community_likes'
  AND column_name = 'reaction';

SELECT policyname, cmd FROM pg_policies
  WHERE tablename = 'community_likes'
  ORDER BY policyname;
