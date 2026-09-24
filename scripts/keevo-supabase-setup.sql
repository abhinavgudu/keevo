-- ============================================================
-- KEEVO: Supabase Auth + RLS Setup
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color_hex    TEXT NOT NULL DEFAULT '#3B82F6',
  icon         TEXT DEFAULT 'Folder',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add user_id column if table already exists
ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable RLS on categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view own categories" ON categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON categories;
DROP POLICY IF EXISTS "Users can update own categories" ON categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON categories;

-- Create RLS policies for categories
CREATE POLICY "Users can view own categories"
  ON categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON categories FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. CONTENT ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS content_items (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  platform        TEXT NOT NULL DEFAULT 'Web',
  media_type      TEXT NOT NULL DEFAULT 'ARTICLE',
  aspect_ratio    TEXT NOT NULL DEFAULT 'LANDSCAPE_16_9',
  thumbnail_url   TEXT,
  doc_file_url    TEXT,
  priority        TEXT NOT NULL DEFAULT 'HIGH',
  priority_score  INTEGER NOT NULL DEFAULT 50,
  access_count    INTEGER NOT NULL DEFAULT 0,
  is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
  description     TEXT DEFAULT '',
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add user_id column if table already exists
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable RLS on content_items
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view own items" ON content_items;
DROP POLICY IF EXISTS "Users can insert own items" ON content_items;
DROP POLICY IF EXISTS "Users can update own items" ON content_items;
DROP POLICY IF EXISTS "Users can delete own items" ON content_items;

-- Create RLS policies for content_items
CREATE POLICY "Users can view own items"
  ON content_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON content_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON content_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON content_items FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. PRIORITY SCORE AUTO-CALC TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_priority_score()
RETURNS TRIGGER AS $$
DECLARE
  base_score INTEGER := 50;
BEGIN
  -- Priority level boost
  IF NEW.priority = 'MUST_LEARN' THEN base_score := 100;
  ELSIF NEW.priority = 'HIGH' THEN base_score := 70;
  ELSIF NEW.priority = 'MEDIUM' THEN base_score := 50;
  ELSIF NEW.priority = 'LOW' THEN base_score := 20;
  END IF;

  -- Access count bonus (max +30)
  base_score := base_score + LEAST(NEW.access_count * 3, 30);

  -- Favorite bonus
  IF NEW.is_favorite THEN base_score := base_score + 30; END IF;

  -- Recency bonus (within last 7 days: +10)
  IF NEW.created_at > NOW() - INTERVAL '7 days' THEN base_score := base_score + 10; END IF;

  NEW.priority_score := base_score;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_priority_score ON content_items;
CREATE TRIGGER set_priority_score
  BEFORE INSERT OR UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION calculate_priority_score();

-- ============================================================
-- 4. Storage bucket for PDF uploads
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('keevo-docs', 'keevo-docs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "Auth users upload docs" ON storage.objects;
DROP POLICY IF EXISTS "Public read docs" ON storage.objects;

CREATE POLICY "Auth users upload docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'keevo-docs' AND auth.role() = 'authenticated');

CREATE POLICY "Public read docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'keevo-docs');

-- ============================================================
-- Done! Your Keevo database is ready.
-- ============================================================
