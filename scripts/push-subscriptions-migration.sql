-- ─────────────────────────────────────────────────────────────────────────────
-- Web Push subscriptions
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- What this is for
-- ----------------
-- community_notifications makes the in-app bell work, but the bell is only
-- mounted while the app is open. This table is what makes a phone buzz when the
-- app is closed: one row per browser/device that has granted push permission.
--
-- Why a row per device and not per user
-- -------------------------------------
-- A push subscription belongs to a browser profile, not to an account. One person
-- with a phone and a laptop has two subscriptions, and they must be counted and
-- cleaned up separately. The endpoint — the push service's URL for that specific
-- browser installation — is the natural primary key for that, so it is UNIQUE.
--
-- Consequence of endpoint being unique: one device is one subscription, so
-- signing in as somebody else on a device REPLACES the owner of that row rather
-- than accumulating a stale row that will never fire again. The upsert in
-- /api/push/subscribe updates user_id for exactly this reason.
--
-- Dead subscriptions are pruned on their own
-- ------------------------------------------
-- When a browser is uninstalled, its subscription silently stops working and no
-- API is ever called to tell us. The push services signal this by answering
-- 404/410 on the next send, and the sender deletes the row at that point. Without
-- that pruning this table grows without bound and every send pays for the
-- deadweight.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE CASCADE: deleting the account must not leave a stranger's device
  -- registered against a user id that no longer exists.
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The push service URL for this browser installation. Unique because one
  -- browser installation has exactly one.
  endpoint     TEXT NOT NULL UNIQUE,

  -- The ECDH public key and auth secret the browser generated. Without both,
  -- the payload cannot be encrypted for this device.
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,

  -- Diagnostic only: lets a dead row be traced to "the old Pixel" when pruning.
  user_agent   TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Last time a send to this endpoint succeeded. NULL until the first send, and
  -- left alone when a send fails so a single flaky push is not mistaken for a
  -- dead subscription.
  last_success_at TIMESTAMPTZ
);

-- Sending is always "every subscription belonging to these users", so the
-- lookup must not need a scan.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies. Every read and write of this table goes through the
-- service role inside /api/push/*, which derives user_id from the session rather
-- than from anything the client can assert. With RLS on and no policy, a client
-- holding only the anon key cannot read another member's endpoints or register
-- a device on someone else's account, even if it guesses a user id.

COMMIT;

-- Verify.
SELECT count(*) AS push_subscriptions FROM public.push_subscriptions;
SELECT policyname, cmd FROM pg_policies
  WHERE tablename = 'push_subscriptions'
  ORDER BY policyname;
