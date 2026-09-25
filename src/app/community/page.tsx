'use client';

import React, { useEffect, useState } from 'react';
import { ContentItem } from '@/types/vault';
import { MasonryGrid } from '@/components/MasonryGrid';
import { MediaPreviewModal } from '@/components/modals/MediaPreviewModal';
import { createClient } from '@supabase/supabase-js';
import { Loader2, Globe, UserCircle, Clock } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function SharedByBadge({ sharedBy }: { sharedBy: ContentItem['shared_by'] }) {
  if (!sharedBy) return null;
  const name = sharedBy.first_name || sharedBy.last_name 
    ? `${sharedBy.first_name || ''} ${sharedBy.last_name || ''}`.trim()
    : sharedBy.email.split('@')[0];
  const initial = name.charAt(0).toUpperCase();
  
  return (
    <div className="flex items-center gap-2 ml-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">
        {initial}
      </div>
      <span className="text-xs font-medium text-emerald-300">Shared by {name}</span>
    </div>
  );
}

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
          .select(`
            *,
            category:categories(*),
            shared_by:user_id (
              id,
              email,
              raw_user_meta_data
            )
          `)
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        const itemsWithSharer = (data as any[]).map(item => ({
          ...item,
          shared_by: item.shared_by ? {
            id: item.shared_by.id,
            email: item.shared_by.email,
            first_name: item.shared_by.raw_user_meta_data?.first_name,
            last_name: item.shared_by.raw_user_meta_data?.last_name,
          } : undefined,
        }));
        
        setItems(itemsWithSharer as ContentItem[]);
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
            <Globe className="w-8 h-8 text-cyan-500" /> Keeva Community
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
