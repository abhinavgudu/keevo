-- ─────────────────────────────────────────────────────────────────────────────
-- comment_like notification kind
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Liking a comment notifies the comment's author, the same way liking a post
-- notifies the post's owner. That needs a distinct kind: reusing 'like' would
-- collide with the (recipient, actor, item) UNIQUE index whenever the same
-- person likes both the post and one of its comments. The per-comment dedupe
-- index (recipient, comment_id) already covers the new kind, so one comment
-- still produces at most one bell row no matter how many people like it.
--
-- Re-point the kind CHECK at the current list of kinds. Written as a
-- drop-then-add so re-running this file also upgrades a database that already
-- ran an earlier version of the constraint.
-- ─────────────────────────────────────────────────────────────────────────────

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
  CHECK (kind IN ('new_post', 'comment', 'reply', 'mention', 'like', 'post_edited', 'comment_like'));
