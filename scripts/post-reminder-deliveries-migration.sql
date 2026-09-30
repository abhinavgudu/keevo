-- ─────────────────────────────────────────────────────────────────────────────
-- Daily post-reminder deliveries
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- What this is for
-- ----------------
-- The daily reminder is push-only and intentionally has no row in
-- community_notifications: there is no actor, post, or comment to show in the
-- bell. This table is the cron job's idempotency lock. One row per user per UTC
-- calendar day means a retried or overlapping Vercel invocation claims zero new
-- rows and therefore sends no duplicate reminder.
--
-- Recipients stay conservative by query, not by flag: only devices with a push
-- subscription can be reached, and users who shared a post in the last seven
-- days are skipped by the sender before it claims a row here.
--
-- Like push_subscriptions, this table has RLS enabled and no client policies.
-- Every read and write goes through the service role in /api/reminders/*.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.post_reminder_deliveries (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_for_date DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT post_reminder_deliveries_pkey PRIMARY KEY (user_id, sent_for_date)
);

CREATE INDEX IF NOT EXISTS idx_post_reminder_deliveries_date
  ON public.post_reminder_deliveries (sent_for_date);

ALTER TABLE public.post_reminder_deliveries ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify.
SELECT count(*) AS post_reminder_deliveries FROM public.post_reminder_deliveries;
SELECT policyname, cmd FROM pg_policies
  WHERE tablename = 'post_reminder_deliveries'
  ORDER BY policyname;
