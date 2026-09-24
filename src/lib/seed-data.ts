import { Category, ContentItem } from '@/types/vault';

export const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'Dev & Tech',
    color_hex: '#10B981',
    icon: 'Code',
    created_at: new Date('2026-01-01').toISOString(),
  },
  {
    id: 'cat-2',
    name: 'Design & UI/UX',
    color_hex: '#F59E0B',
    icon: 'Palette',
    created_at: new Date('2026-01-01').toISOString(),
  },
  {
    id: 'cat-3',
    name: 'LinkedIn Insights',
    color_hex: '#3B82F6',
    icon: 'Share2',
    created_at: new Date('2026-01-01').toISOString(),
  },
  {
    id: 'cat-4',
    name: 'Finance & Growth',
    color_hex: '#8B5CF6',
    icon: 'TrendingUp',
    created_at: new Date('2026-01-01').toISOString(),
  },
  {
    id: 'cat-5',
    name: 'AI & Machine Learning',
    color_hex: '#EC4899',
    icon: 'Cpu',
    created_at: new Date('2026-01-01').toISOString(),
  },
];

// Completely empty - no dummy items
export const INITIAL_ITEMS: ContentItem[] = [];
