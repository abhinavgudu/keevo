-- ─────────────────────────────────────────────────────────────────────────────
-- Avatars storage bucket
--
-- Paste into Supabase → SQL Editor → Run. Idempotent, safe to re-run.
--
-- What this is for
-- ----------------
-- Profile photos live in Storage, not in the database: one public object per
-- member at <userId>/avatar.<ext>. The profile stores only the public URL in
-- auth user_metadata (no profiles table, no RLS involved), and every upload
-- overwrites the same path so stale photos never accumulate in the bucket.
--
-- Type/size checks (image only, ≤2MB) live in the upload UI, not here —
-- Storage policies cannot inspect file bytes, so the client is the gate and
-- these policies are the backstop.
-- ─────────────────────────────────────────────────────────────────────────────

-- Public bucket. ON CONFLICT keeps re-runs from failing on a project where
-- the bucket already exists, while still flipping a private bucket public.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Read: avatars render for signed-out visitors too, exactly like public posts.
DROP POLICY IF EXISTS "Public read for avatars" ON storage.objects;
CREATE POLICY "Public read for avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Write: authenticated members may only write inside their own user-id folder,
-- so nobody can overwrite — or plant a photo on — someone else's profile.
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT id, public FROM storage.buckets WHERE id = 'avatars';
SELECT policyname, cmd FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname LIKE '%avatar%'
  ORDER BY policyname;
