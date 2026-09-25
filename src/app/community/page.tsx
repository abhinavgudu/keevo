'use client';

import React, { useEffect, useState } from 'react';
import { ContentItem } from '@/types/vault';
import { MasonryGrid } from '@/components/MasonryGrid';
import { MediaPreviewModal } from '@/components/modals/MediaPreviewModal';
import { createClient } from '@supabase/supabase-js';
import { Loader2, Globe } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function CommunityPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    async function fetchCommunityItems() {
      try {
        const { data, error } = await supabase
          .from('content_items')
          .select('*, category:categories(*)')
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setItems(data as ContentItem[]);
      } catch (err) {
        console.error('Error fetching community posts:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCommunityItems();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090E] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-200 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Globe className="w-8 h-8 text-cyan-500" /> Kyx Community
          </h1>
          <p className="text-slate-400 mt-2">Discover content shared by the community.</p>
        </header>

        <MasonryGrid
          items={items}
          onOpenPreview={(item) => {
            setSelectedItem(item);
            setIsPreviewOpen(true);
          }}
          onOpenPdf={(item) => {
            if (item.doc_file_url) window.open(item.doc_file_url, '_blank');
          }}
          onToggleFavorite={() => {}}
          onDelete={() => {}}
        />

        <MediaPreviewModal
          item={selectedItem}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          onToggleFavorite={() => {}}
          onUpdateNotes={() => {}}
        />
      </div>
    </div>
  );
}
