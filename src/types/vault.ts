export type MediaType = 'REEL' | 'LINKEDIN_POST' | 'DOCUMENT' | 'ARTICLE';

export type AspectRatioType = 'PORTRAIT_9_16' | 'LANDSCAPE_16_9' | 'STANDARD_DOCUMENT';

export type PriorityLevel = 'MUST_LEARN' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Category {
  id: string;
  name: string;
  color_hex: string;
  icon?: string;
  created_at: string;
}

export interface ContentItem {
  id: string;
  category_id: string | null;
  category?: Category;
  title: string;
  source_url: string;
  platform: string;
  media_type: MediaType;
  aspect_ratio: AspectRatioType;
  thumbnail_url: string | null;
  doc_file_url: string | null;
  priority: PriorityLevel;
  priority_score: number;
  access_count: number;
  is_favorite: boolean;
  created_at: string;
  description?: string;
  tags?: string[];
  notes?: string;
}

export interface ScrapedMetadata {
  title: string;
  description: string;
  thumbnail_url: string | null;
  platform: string;
  media_type: MediaType;
  aspect_ratio: AspectRatioType;
  source_url: string;
  site_name?: string;
  favicon?: string;
}

export interface VaultStats {
  totalItems: number;
  mustLearnCount: number;
  reelsCount: number;
  landscapeCount: number;
  documentsCount: number;
  favoritesCount: number;
  totalAccesses: number;
}

export const PRIORITY_BASE_WEIGHTS: Record<PriorityLevel, number> = {
  MUST_LEARN: 100,
  HIGH: 75,
  MEDIUM: 50,
  LOW: 25,
};

export function calculatePriorityScore(
  priority: PriorityLevel,
  accessCount: number,
  isFavorite: boolean,
  createdAt: string | Date
): number {
  const baseWeight = PRIORITY_BASE_WEIGHTS[priority] || 50;
  const accessBonus = (accessCount || 0) * 2;
  const favBonus = isFavorite ? 30 : 0;
  
  const createdDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const now = new Date();
  const diffTime = Math.max(0, now.getTime() - createdDate.getTime());
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  const timeDecay = diffDays * 0.5;

  const score = baseWeight + accessBonus + favBonus - timeDecay;
  return Math.round(score * 10) / 10;
}
