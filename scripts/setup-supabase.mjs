import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bqpuyxkqmbngzucbxnrg.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcHV5eGtxbWJuZ3p1Y2J4bnJnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDE4NjYyMCwiZXhwIjoyMTA1NzYyNjIwfQ.qPiGlp1bv20LAGFvOgbxiYZ4i4CDuhyvQGevOzZkRNA';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SCHEMA_SQL = `
-- 1. Create Enums if not exist
DO $$ BEGIN
    CREATE TYPE media_type AS ENUM ('REEL', 'LINKEDIN_POST', 'DOCUMENT', 'ARTICLE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE aspect_ratio_type AS ENUM ('PORTRAIT_9_16', 'LANDSCAPE_16_9', 'STANDARD_DOCUMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE priority_level AS ENUM ('MUST_LEARN', 'HIGH', 'MEDIUM', 'LOW');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    color_hex VARCHAR(7) DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Content Items Table
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

-- 4. Automatic Priority Score Calculation Trigger Function
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

-- 5. Trigger
DROP TRIGGER IF EXISTS trigger_priority_score ON content_items;
CREATE TRIGGER trigger_priority_score
BEFORE INSERT OR UPDATE ON content_items
FOR EACH ROW EXECUTE FUNCTION update_priority_score();

-- Enable RLS and public read/write policies for frictionless operation
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full access on categories" ON categories;
CREATE POLICY "Public full access on categories" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access on content_items" ON content_items;
CREATE POLICY "Public full access on content_items" ON content_items FOR ALL USING (true) WITH CHECK (true);
`;

async function run() {
  console.log('🚀 Connecting to Supabase at:', SUPABASE_URL);

  // 1. Create Storage Bucket for PDFs if missing
  try {
    const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
    if (bErr) {
      console.warn('Listing buckets note:', bErr.message);
    }
    const pdfBucketExists = buckets?.some(b => b.name === 'pdfs');
    if (!pdfBucketExists) {
      console.log('📦 Creating public "pdfs" storage bucket...');
      const { error: cErr } = await supabase.storage.createBucket('pdfs', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['application/pdf'],
      });
      if (cErr) console.warn('Bucket creation note:', cErr.message);
      else console.log('✅ Bucket "pdfs" created successfully.');
    } else {
      console.log('✅ Bucket "pdfs" already exists.');
    }
  } catch (err) {
    console.warn('Storage bucket check note:', err.message);
  }

  // 2. Execute SQL Schema via Supabase Postgres REST / RPC
  // We can run SQL via the Supabase SQL endpoint with service key or pg client
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SCHEMA_SQL }),
    });
    console.log('RPC check status:', response.status);
  } catch (sqlErr) {
    console.warn('SQL execution notice:', sqlErr.message);
  }

  // 3. Verify Tables & Seed Categories
  const { data: existingCats, error: catErr } = await supabase.from('categories').select('*').limit(5);
  if (catErr) {
    console.log('⚠️ Tables need creation in Supabase SQL editor. Error:', catErr.message);
  } else {
    console.log('✅ categories table verified. Found:', existingCats?.length || 0, 'categories.');
    if (!existingCats || existingCats.length === 0) {
      console.log('🌱 Seeding initial categories...');
      const defaultCategories = [
        { name: 'Dev & Tech', color_hex: '#10B981' },
        { name: 'Design & UI/UX', color_hex: '#F59E0B' },
        { name: 'LinkedIn Insights', color_hex: '#3B82F6' },
        { name: 'Finance & Growth', color_hex: '#8B5CF6' },
        { name: 'AI & Machine Learning', color_hex: '#EC4899' },
      ];
      const { data: seeded, error: seedErr } = await supabase.from('categories').insert(defaultCategories).select();
      if (!seedErr) {
        console.log('✅ Default categories seeded:', seeded?.length);
      }
    }
  }

  console.log('🏁 Setup finished.');
}

run();
