-- ─────────────────────────────────────────────────────────────────────────────
-- Community notifications + comment mentions
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- Scope note: this is a SEPARATE feed from the Community tab badge.
-- The badge on the Community tab counts unread POSTS and is derived from
-- keeva_community_last_seen_time in the browser. This table is every other
-- kind of community activity (comments, replies, mentions, likes, new posts)
-- and never feeds that badge. Do not join the two.
--
-- Why a real table instead of deriving the feed on read
-- ---------------------------------------------------
-- "Who commented on / replied to / mentioned / liked me" needs four different
-- joins plus a fan-out over every other user's activity on every poll. This
-- table stores the fan-out once, at the moment the event happens, so the feed
-- is one indexed query and stays cheap as the community grows.
--
-- Why recipient_user_id is nullable
-- --------------------------------
-- A new post notifies EVERYONE. Writing one row per member would mean a full
-- table rewrite of N rows for every single post. Instead a broadcast row has
-- recipient_user_id = NULL and each reader filters it out for themselves by
-- excluding the actor. Targeted events (comment / reply / mention / like) are
-- low-volume, so those get a real per-recipient row.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Mentions on comments ─────────────────────────────────────────────────────
--
-- Resolved user ids, captured at insert time. Storing the ids rather than only
-- the raw @text means a later rename cannot silently break an old mention, and
-- it lets "who mentioned me" be a direct lookup instead of a body scan.
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}'::uuid[];

-- ── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_notifications (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

  -- NULL means "broadcast to the whole community" (new posts). Otherwise the one
  -- member this notification belongs to.
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who caused it. Never the recipient: self-generated events are filtered out
  -- before the row is written.
  actor_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  kind              TEXT NOT NULL
                    CHECK (kind IN ('new_post', 'comment', 'reply', 'mention', 'like')),

  -- ON DELETE CASCADE is deliberate. Deleting a post or a comment must not leave
  -- a dangling notification pointing at something that no longer exists.
  item_id           TEXT REFERENCES public.content_items(id) ON DELETE CASCADE,
  comment_id        TEXT REFERENCES public.community_comments(id) ON DELETE CASCADE,

  -- Denormalised like community_comments.author_name, for the same reason: the
  -- feed must not need an auth.admin.listUsers() sweep to draw a line of text.
  actor_name        TEXT NOT NULL DEFAULT '',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at           TIMESTAMPTZ
);

-- Personal feed: "my notifications, newest first".
CREATE INDEX IF NOT EXISTS idx_community_notifications_recipient
  ON public.community_notifications (recipient_user_id, created_at DESC);

-- Broadcast feed: every new post, newest first.
CREATE INDEX IF NOT EXISTS idx_community_notifications_broadcast
  ON public.community_notifications (created_at DESC)
  WHERE recipient_user_id IS NULL;

-- Unliking has to find and remove exactly the row the like created, so the
-- (actor, item) pair needs to be reachable without a full scan.
CREATE INDEX IF NOT EXISTS idx_community_notifications_actor_item
  ON public.community_notifications (actor_user_id, item_id);

-- At most one notification per person per comment. This is what guarantees you
-- are not pinged three times for one comment just because you own the post, are
-- being replied to, AND were @mentioned — the API already collapses those, and
-- this index makes the invariant hold in the database too.
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_notifications_comment_uniq
  ON public.community_notifications (recipient_user_id, comment_id)
  WHERE comment_id IS NOT NULL;

-- Same idea for likes: liking, unliking and re-liking repeatedly must not stack
-- up rows. A re-like is a no-op here and the existing notification stands.
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_notifications_like_uniq
  ON public.community_notifications (recipient_user_id, actor_user_id, item_id)
  WHERE kind = 'like';

-- ── Row level security ───────────────────────────────────────────────────────
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;

-- Unlike every other community table, this one is NOT publicly readable. A
-- notification says who interacted with you, which is private information.
DROP POLICY IF EXISTS "Users read own community notifications" ON public.community_notifications;
CREATE POLICY "Users read own community notifications"
  ON public.community_notifications FOR SELECT
  TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR (recipient_user_id IS NULL AND actor_user_id IS DISTINCT FROM auth.uid())
  );

-- No INSERT, UPDATE or DELETE policy on purpose. A client cannot write itself a
-- notification, mark one read, or delete one — every write to this table goes
-- through the service role inside the API routes, which also validates the
-- actor. Read state therefore cannot be tampered with, and a member cannot
-- fabricate a notification attributed to someone else.

-- Also note the rows themselves cascade away when their cause is deleted, so
-- the cascade is not something a policy has to allow.

COMMIT;

-- Verify: both objects exist and the policies are as expected.
SELECT count(*) AS community_notifications FROM public.community_notifications;
SELECT policyname, cmd FROM pg_policies
  WHERE tablename = 'community_notifications'
  ORDER BY policyname;
