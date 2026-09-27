-- ─────────────────────────────────────────────────────────────────────────────
-- Canonical category taxonomy, seeded as GLOBAL rows (user_id IS NULL) so every
-- account sees the same vocabulary.
--
-- Why this migration exists
-- -------------------------
-- autoClassifyContent() in the scrape route returned one of five fixed names
-- ("Dev & Tech", "AI & Machine Learning", ...) while the categories table held
-- only user-created rows like "DSA" and "Gym". AddItemModal matched the detected
-- name to a category with strict equality, so the match could never succeed and
-- 14 of 15 items saved with category_id = NULL.
--
-- It also had to be idempotent, because `categories` has no UNIQUE constraint on
-- name — the previous seed used ON CONFLICT DO NOTHING, which without a matching
-- unique index silently does nothing and duplicates the rows on every run.
--
-- HOW TO RUN: paste into Supabase -> SQL Editor -> Run. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Repair the schema first.
--
--    keevo-supabase-setup.sql declares
--        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text
--    but the deployed table predates that default: CREATE TABLE IF NOT EXISTS
--    is a no-op against an existing table and nothing ever ran
--    ALTER COLUMN ... SET DEFAULT. Any INSERT that omits id therefore fails with
--    "null value in column id violates not-null constraint". The INSERT below
--    passes explicit ids anyway, so it works even on a database where this ALTER
--    is unavailable.
ALTER TABLE public.categories
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- 2. Idempotency guard. The function reports how many duplicate global rows it
--    collapsed; it must run before the partial unique index below, or creating
--    that index would fail on the duplicates it is meant to prevent.
CREATE OR REPLACE FUNCTION dedupe_global_categories() RETURNS INTEGER AS $$
DECLARE
  removed INTEGER := 0;
  row_count INTEGER := 0;
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT name, MIN(created_at) AS keep_at
    FROM public.categories
    WHERE user_id IS NULL
    GROUP BY name
    HAVING COUNT(*) > 1
  LOOP
    DELETE FROM public.categories
    WHERE user_id IS NULL
      AND name = dup.name
      AND created_at > dup.keep_at;
    -- Accumulate across iterations; assigning ROW_COUNT directly would report
    -- only the last duplicate name removed, not the total.
    GET DIAGNOSTICS row_count = ROW_COUNT;
    removed := removed + row_count;
  END LOOP;
  RETURN removed;
END;
$$ LANGUAGE plpgsql;

SELECT dedupe_global_categories();

-- 3. Make the global name unique going forward. Other users' rows are left
--    alone, so a personal "DSA" and the shared "Programming & DSA" can coexist.
CREATE UNIQUE INDEX IF NOT EXISTS categories_global_name_unique
  ON public.categories (name)
  WHERE user_id IS NULL;

-- 4. The taxonomy. These names must stay in sync with CATEGORY_TAXONOMY in
--    src/lib/categories.ts — the classifier returns exactly these strings.
--    Explicit, stable ids keep a re-run an update rather than a second insert.
INSERT INTO public.categories (id, user_id, name, color_hex, icon) VALUES
  ('cat-glob-programming-dsa',     NULL, 'Programming & DSA',     '#10B981', 'Code2'),
  ('cat-glob-dev-software',        NULL, 'Dev & Software',        '#3B82F6', 'Code'),
  ('cat-glob-ai-ml',               NULL, 'AI & ML',               '#EC4899', 'Brain'),
  ('cat-glob-system-design-cloud', NULL, 'System Design & Cloud', '#8B5CF6', 'Server'),
  ('cat-glob-design-ui-ux',        NULL, 'Design & UI/UX',        '#F59E0B', 'Palette'),
  ('cat-glob-career-growth',       NULL, 'Career & Growth',       '#0EA5E9', 'Briefcase'),
  ('cat-glob-finance-money',       NULL, 'Finance & Money',       '#F43F5E', 'TrendingUp'),
  ('cat-glob-health-fitness',      NULL, 'Health & Fitness',      '#22C55E', 'HeartPulse'),
  ('cat-glob-food-cooking',        NULL, 'Food & Cooking',        '#FB923C', 'ChefHat'),
  ('cat-glob-entertainment',       NULL, 'Entertainment',         '#A855F7', 'Clapperboard')
ON CONFLICT (name) WHERE user_id IS NULL DO UPDATE
  SET color_hex = EXCLUDED.color_hex,
      icon      = EXCLUDED.icon;

-- 5. A missing index here is what made the feed's category join slow once the
--    item count grows.
CREATE INDEX IF NOT EXISTS content_items_category_id_idx
  ON public.content_items (category_id);

COMMIT;

-- Verify: exactly 10 rows, all global, ids non-null.
SELECT id, name, color_hex FROM public.categories WHERE user_id IS NULL ORDER BY name;
