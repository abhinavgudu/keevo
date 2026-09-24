'use client';

import React, { useState } from 'react';
import { X, Database, Download, Upload, Trash2, Copy, Check, Shield, Server, FileCode2 } from 'lucide-react';
import { VaultStorage } from '@/lib/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}

const SUPABASE_SCHEMA_SQL = `-- Enums
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

-- Insert Default Categories
INSERT INTO categories (name, color_hex) VALUES 
('Dev & Tech', '#10B981'),
('Design & UI/UX', '#F59E0B'),
('LinkedIn Insights', '#3B82F6'),
('Finance & Growth', '#8B5CF6'),
('AI & Machine Learning', '#EC4899')
ON CONFLICT DO NOTHING;`;

export function SettingsModal({ isOpen, onClose, onDataChanged }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'STORAGE' | 'SQL' | 'BACKUP'>('STORAGE');
  const [supabaseUrl, setSupabaseUrl] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('vaultx_supabase_url') || '' : ''
  );
  const [supabaseKey, setSupabaseKey] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('vaultx_supabase_key') || '' : ''
  );
  const [isCopied, setIsCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  const handleSaveSupabase = () => {
    if (typeof window !== 'undefined') {
      if (supabaseUrl && supabaseKey) {
        localStorage.setItem('vaultx_supabase_url', supabaseUrl.trim());
        localStorage.setItem('vaultx_supabase_key', supabaseKey.trim());
        setStatusMsg('Supabase credentials saved! Connecting to cloud database...');
      } else {
        localStorage.removeItem('vaultx_supabase_url');
        localStorage.removeItem('vaultx_supabase_key');
        setStatusMsg('Operating on VaultX Local Storage Engine.');
      }
      setTimeout(() => {
        onDataChanged();
        setStatusMsg('');
      }, 1200);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleExportJson = async () => {
    const data = await VaultStorage.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaultx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      const res = await VaultStorage.importData(content);
      if (res.success) {
        setStatusMsg(`Successfully imported ${res.count} items!`);
        onDataChanged();
      } else {
        setStatusMsg(`Import error: ${res.error}`);
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = async () => {
    if (confirm('Are you sure you want to clear all vault content items?')) {
      await VaultStorage.clearAllItems();
      setStatusMsg('All items cleared from vault.');
      onDataChanged();
      setTimeout(() => setStatusMsg(''), 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative my-8 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Server className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">System Settings & Cloud DB</h2>
            <p className="text-xs text-slate-400">Configure PostgreSQL, copy schema, or backup vault data</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl mb-6">
          <button
            onClick={() => setActiveTab('STORAGE')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'STORAGE' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Supabase Config
          </button>
          <button
            onClick={() => setActiveTab('SQL')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'SQL' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            SQL Schema & Triggers
          </button>
          <button
            onClick={() => setActiveTab('BACKUP')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'BACKUP' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Data Backup & Clean
          </button>
        </div>

        {statusMsg && (
          <div className="p-3 bg-cyan-950/60 border border-cyan-800 text-cyan-300 rounded-xl text-xs mb-4">
            {statusMsg}
          </div>
        )}

        {/* Tab 1: Supabase Configuration */}
        {activeTab === 'STORAGE' && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Shield className="w-4 h-4" /> Live Supabase PostgreSQL Connection
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Connect your free tier Supabase project ($0 cost) to sync Reels, Posts, and PDF uploads in real-time.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  NEXT_PUBLIC_SUPABASE_URL
                </label>
                <input
                  type="text"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://bqpuyxkqmbngzucbxnrg.supabase.co"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </label>
                <input
                  type="password"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSupabase}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md cursor-pointer"
                >
                  Save & Sync
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: SQL Schema */}
        {activeTab === 'SQL' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <FileCode2 className="w-4 h-4 text-cyan-400" /> PostgreSQL Table & Priority Trigger Script
              </span>
              <button
                onClick={handleCopySql}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 transition-colors cursor-pointer"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied SQL!' : 'Copy SQL Script'}</span>
              </button>
            </div>
            <pre className="w-full h-64 bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-200/90 overflow-auto scrollbar-none">
              {SUPABASE_SCHEMA_SQL}
            </pre>
          </div>
        )}

        {/* Tab 3: Backup & Clean */}
        {activeTab === 'BACKUP' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-cyan-400" /> Export Vault
                </h4>
                <p className="text-[11px] text-slate-400">Download complete vault state as JSON backup.</p>
                <button
                  onClick={handleExportJson}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  Download JSON
                </button>
              </div>

              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-purple-400" /> Restore Vault
                </h4>
                <p className="text-[11px] text-slate-400">Import your vault from a previously exported JSON file.</p>
                <label className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors flex items-center justify-center cursor-pointer">
                  <span>Upload Backup JSON</span>
                  <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
                </label>
              </div>
            </div>

            <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-rose-300">Clear All Vault Items</h4>
                <p className="text-[11px] text-slate-400">Permanently empty all curated cards and start fresh.</p>
              </div>
              <button
                onClick={handleClearAllData}
                className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
