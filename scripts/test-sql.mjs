const PROJECT_REF = 'bqpuyxkqmbngzucbxnrg';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcHV5eGtxbWJuZ3p1Y2J4bnJnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDE4NjYyMCwiZXhwIjoyMTA1NzYyNjIwfQ.qPiGlp1bv20LAGFvOgbxiYZ4i4CDuhyvQGevOzZkRNA';

const SCHEMA_SQL = `
-- Enums
CREATE TYPE media_type AS ENUM ('REEL', 'LINKEDIN_POST', 'DOCUMENT', 'ARTICLE');
CREATE TYPE aspect_ratio_type AS ENUM ('PORTRAIT_9_16', 'LANDSCAPE_16_9', 'STANDARD_DOCUMENT');
CREATE TYPE priority_level AS ENUM ('MUST_LEARN', 'HIGH', 'MEDIUM', 'LOW');

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    color_hex VARCHAR(7) DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Content Items Table
CREATE TABLE IF NOT EXISTS content_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    platform VARCHAR(30) NOT NULL,
    media_type media_type NOT NULL,
    aspect_ratio aspect_ratio_type DEFAULT 'LANDSCAPE_16_9',
    thumbnail_url TEXT,
    doc_file_url TEXT,
    priority priority_level DEFAULT 'MEDIUM',
    priority_score FLOAT DEFAULT 0.0,
    access_count INT DEFAULT 0,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    description TEXT,
    tags TEXT[],
    notes TEXT
);

-- 3. Automatic Priority Score Calculation Trigger
CREATE OR REPLACE FUNCTION update_priority_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.priority_score := (
        CASE 
            WHEN NEW.priority = 'MUST_LEARN' THEN 100
            WHEN NEW.priority = 'HIGH' THEN 75
            WHEN NEW.priority = 'MEDIUM' THEN 50
            ELSE 25
        END
    ) + (COALESCE(NEW.access_count, 0) * 2) 
      + (CASE WHEN NEW.is_favorite THEN 30 ELSE 0 END)
      - (EXTRACT(DAY FROM (NOW() - NEW.created_at)) * 0.5);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_priority_score ON content_items;
CREATE TRIGGER trigger_priority_score
BEFORE INSERT OR UPDATE ON content_items
FOR EACH ROW EXECUTE FUNCTION update_priority_score();

-- Enable RLS & public policies
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full access on categories" ON categories;
CREATE POLICY "Public full access on categories" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access on content_items" ON content_items;
CREATE POLICY "Public full access on content_items" ON content_items FOR ALL USING (true) WITH CHECK (true);

-- Seed Initial Categories
INSERT INTO categories (name, color_hex) VALUES 
('Dev & Tech', '#10B981'),
('Design & UI/UX', '#F59E0B'),
('LinkedIn Insights', '#3B82F6'),
('Finance & Growth', '#8B5CF6'),
('AI & Machine Learning', '#EC4899')
ON CONFLICT DO NOTHING;
`;

async function tryExecSql() {
  const endpoints = [
    `https://${PROJECT_REF}.supabase.co/pg/query`,
    `https://${PROJECT_REF}.supabase.co/database/query`,
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: SCHEMA_SQL }),
      });
      console.log(`Endpoint ${ep} returned status:`, res.status);
      if (res.ok) {
        console.log('✅ Schema successfully executed!');
        return;
      }
    } catch (e) {
      console.log(`Endpoint ${ep} error:`, e.message);
    }
  }
}

tryExecSql();
