import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { AspectRatioType, MediaType, PriorityLevel, ScrapedMetadata } from '@/types/vault';

export interface SmartIngestionResult extends ScrapedMetadata {
  autoCategoryName?: string;
  autoTags: string[];
  autoPriority: PriorityLevel;
}

export function detectPlatformAndType(url: string): {
  platform: string;
  defaultMediaType: MediaType;
  defaultAspectRatio: AspectRatioType;
} {
  const lowercase = url.toLowerCase().trim();

  // 1. Instagram Reels & Posts
  if (
    lowercase.includes('instagram.com/reel') ||
    lowercase.includes('instagram.com/reels') ||
    lowercase.includes('instagr.am/reel')
  ) {
    return { platform: 'Instagram', defaultMediaType: 'REEL', defaultAspectRatio: 'PORTRAIT_9_16' };
  }
  if (lowercase.includes('instagram.com/p/') || lowercase.includes('instagr.am/p/')) {
    return { platform: 'Instagram', defaultMediaType: 'REEL', defaultAspectRatio: 'PORTRAIT_9_16' };
  }

  // 2. YouTube Shorts (9:16) vs Standard YouTube (16:9)
  if (
    lowercase.includes('youtube.com/shorts/') ||
    lowercase.includes('/shorts/') ||
    (lowercase.includes('youtu.be/') && lowercase.includes('shorts'))
  ) {
    return { platform: 'YouTube', defaultMediaType: 'REEL', defaultAspectRatio: 'PORTRAIT_9_16' };
  }
  if (lowercase.includes('youtube.com') || lowercase.includes('youtu.be')) {
    return { platform: 'YouTube', defaultMediaType: 'ARTICLE', defaultAspectRatio: 'LANDSCAPE_16_9' };
  }

  // 3. TikTok (9:16 Vertical)
  if (lowercase.includes('tiktok.com')) {
    return { platform: 'TikTok', defaultMediaType: 'REEL', defaultAspectRatio: 'PORTRAIT_9_16' };
  }

  // 4. LinkedIn Posts & Articles
  if (lowercase.includes('linkedin.com')) {
    return { platform: 'LinkedIn', defaultMediaType: 'LINKEDIN_POST', defaultAspectRatio: 'LANDSCAPE_16_9' };
  }

  // 5. Twitter / X
  if (lowercase.includes('twitter.com') || lowercase.includes('x.com')) {
    return { platform: 'Twitter/X', defaultMediaType: 'ARTICLE', defaultAspectRatio: 'LANDSCAPE_16_9' };
  }

  // 6. Documents & PDFs
  if (
    lowercase.endsWith('.pdf') ||
    lowercase.endsWith('.doc') ||
    lowercase.endsWith('.docx') ||
    lowercase.endsWith('.ppt') ||
    lowercase.endsWith('.pptx') ||
    lowercase.endsWith('.txt') ||
    lowercase.endsWith('.md') ||
    lowercase.includes('arxiv.org/pdf') ||
    lowercase.includes('arxiv.org/abs') ||
    lowercase.includes('/pdf/')
  ) {
    return { platform: 'PDF', defaultMediaType: 'DOCUMENT', defaultAspectRatio: 'STANDARD_DOCUMENT' };
  }

  // 7. Video Direct Links (MP4, WEBM, MOV)
  if (lowercase.endsWith('.mp4') || lowercase.endsWith('.mov') || lowercase.endsWith('.webm')) {
    return { platform: 'Video', defaultMediaType: 'REEL', defaultAspectRatio: 'PORTRAIT_9_16' };
  }

  return { platform: 'Web', defaultMediaType: 'ARTICLE', defaultAspectRatio: 'LANDSCAPE_16_9' };
}

function cleanTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\s*\|\s*LinkedIn$/i, '')
    .replace(/\s*•\s*Instagram\s*photos\s*and\s*videos$/i, '')
    .replace(/\s*-\s*YouTube$/i, '')
    .replace(/\s*\|\s*X$/i, '')
    .replace(/\s*on\s*Instagram:.*$/i, '')
    .trim();
}

function generateFallbackTitle(url: string, platform: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname;
    const humanized = decodeURIComponent(lastPart)
      .replace(/[-_]/g, ' ')
      .replace(/\.[a-zA-Z0-9]+$/, '')
      .replace(/^video\s*/i, '');
    
    if (humanized.length > 3) {
      return `${platform}: ${humanized.slice(0, 70)}`;
    }
    return `${platform} Saved Content`;
  } catch {
    return `${platform} Saved Resource`;
  }
}

// Smart AI Auto-Classifier for Categories & Tags
function autoClassifyContent(title: string, desc: string, platform: string): {
  categoryName: string;
  tags: string[];
  priority: PriorityLevel;
} {
  const combined = `${title} ${desc} ${platform}`.toLowerCase();

  const tags: string[] = [];

  // Tech & Engineering Keywords
  if (
    combined.includes('react') ||
    combined.includes('nextjs') ||
    combined.includes('next.js') ||
    combined.includes('javascript') ||
    combined.includes('typescript') ||
    combined.includes('python') ||
    combined.includes('rust') ||
    combined.includes('golang') ||
    combined.includes('redis') ||
    combined.includes('postgres') ||
    combined.includes('system design') ||
    combined.includes('architecture') ||
    combined.includes('api') ||
    combined.includes('docker') ||
    combined.includes('kubernetes') ||
    combined.includes('database') ||
    combined.includes('backend') ||
    combined.includes('fullstack')
  ) {
    if (combined.includes('system design') || combined.includes('architecture')) tags.push('SystemDesign');
    if (combined.includes('redis')) tags.push('Redis');
    if (combined.includes('next') || combined.includes('react')) tags.push('NextJS');
    if (combined.includes('typescript') || combined.includes('javascript')) tags.push('TypeScript');
    if (combined.includes('database') || combined.includes('postgres')) tags.push('Postgres');
    return { categoryName: 'Dev & Tech', tags, priority: 'MUST_LEARN' };
  }

  // AI & Machine Learning Keywords
  if (
    combined.includes('ai') ||
    combined.includes('llm') ||
    combined.includes('gpt') ||
    combined.includes('deepseek') ||
    combined.includes('openai') ||
    combined.includes('claude') ||
    combined.includes('gemini') ||
    combined.includes('machine learning') ||
    combined.includes('neural') ||
    combined.includes('prompt') ||
    combined.includes('agent') ||
    combined.includes('transformer')
  ) {
    tags.push('AI', 'MachineLearning');
    if (combined.includes('llm') || combined.includes('gpt')) tags.push('LLM');
    if (combined.includes('prompt')) tags.push('Prompts');
    return { categoryName: 'AI & Machine Learning', tags, priority: 'MUST_LEARN' };
  }

  // Design & UI/UX Keywords
  if (
    combined.includes('design') ||
    combined.includes('ui') ||
    combined.includes('ux') ||
    combined.includes('figma') ||
    combined.includes('css') ||
    combined.includes('tailwind') ||
    combined.includes('animation') ||
    combined.includes('glassmorphism') ||
    combined.includes('typography') ||
    combined.includes('prototype')
  ) {
    tags.push('UIUX', 'Design');
    if (combined.includes('figma')) tags.push('Figma');
    if (combined.includes('css') || combined.includes('tailwind')) tags.push('CSS');
    return { categoryName: 'Design & UI/UX', tags, priority: 'HIGH' };
  }

  // LinkedIn & Career Insights
  if (
    platform === 'LinkedIn' ||
    combined.includes('career') ||
    combined.includes('leadership') ||
    combined.includes('management') ||
    combined.includes('hiring') ||
    combined.includes('interview') ||
    combined.includes('resume') ||
    combined.includes('branding')
  ) {
    tags.push('Growth', 'Career', 'Strategy');
    return { categoryName: 'LinkedIn Insights', tags, priority: 'HIGH' };
  }

  // Finance, Growth & SaaS
  if (
    combined.includes('finance') ||
    combined.includes('crypto') ||
    combined.includes('investing') ||
    combined.includes('saas') ||
    combined.includes('mrr') ||
    combined.includes('startup') ||
    combined.includes('business') ||
    combined.includes('marketing') ||
    combined.includes('growth')
  ) {
    tags.push('Finance', 'SaaS', 'Growth');
    return { categoryName: 'Finance & Growth', tags, priority: 'HIGH' };
  }

  return { categoryName: 'Dev & Tech', tags: ['Knowledge'], priority: 'HIGH' };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const { platform, defaultMediaType, defaultAspectRatio } = detectPlatformAndType(parsedUrl.href);

    // 1. Direct PDF / Document Handling
    if (
      defaultMediaType === 'DOCUMENT' &&
      (parsedUrl.pathname.endsWith('.pdf') || parsedUrl.href.includes('arxiv.org'))
    ) {
      const filename = parsedUrl.pathname.split('/').pop() || 'Document.pdf';
      const cleanDocTitle = decodeURIComponent(filename).replace('.pdf', '').replace(/[-_]/g, ' ');
      const { categoryName, tags, priority } = autoClassifyContent(cleanDocTitle, 'Document PDF', 'PDF');

      const meta: SmartIngestionResult = {
        title: cleanDocTitle,
        description: `PDF Document automatically indexed from ${parsedUrl.hostname}`,
        thumbnail_url: 'https://images.unsplash.com/photo-1618042164219-62c820f10723?q=80&w=1200&auto=format&fit=crop',
        platform: 'PDF',
        media_type: 'DOCUMENT',
        aspect_ratio: 'STANDARD_DOCUMENT',
        source_url: parsedUrl.href,
        site_name: parsedUrl.hostname,
        autoCategoryName: categoryName,
        autoTags: tags,
        autoPriority: priority,
      };
      return NextResponse.json({ success: true, metadata: meta });
    }

    // 2. YouTube Fast Metadata Extraction (Shorts & Standard)
    if (platform === 'YouTube') {
      let videoId = '';
      if (parsedUrl.pathname.includes('/shorts/')) {
        videoId = parsedUrl.pathname.replace('/shorts/', '').split('/')[0];
      } else if (parsedUrl.hostname.includes('youtu.be')) {
        videoId = parsedUrl.pathname.replace('/', '').split('/')[0];
      } else {
        videoId = parsedUrl.searchParams.get('v') || '';
      }

      const isShort = defaultAspectRatio === 'PORTRAIT_9_16';
      const ytThumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;

      let ytTitle = '';
      try {
        if (videoId) {
          const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
            { signal: AbortSignal.timeout(3000) }
          );
          if (oembedRes.ok) {
            const oembedData = await oembedRes.json();
            ytTitle = oembedData.title || '';
          }
        }
      } catch {
        // oembed fallback
      }

      const finalTitle = ytTitle || (isShort ? 'YouTube Shorts Reel' : 'YouTube Video');
      const { categoryName, tags, priority } = autoClassifyContent(finalTitle, 'YouTube video', 'YouTube');

      const metadata: SmartIngestionResult = {
        title: finalTitle,
        description: `YouTube ${isShort ? 'Shorts 9:16 Vertical Reel' : 'Video 16:9 Landscape'}`,
        thumbnail_url: ytThumbnail,
        platform: 'YouTube',
        media_type: isShort ? 'REEL' : 'ARTICLE',
        aspect_ratio: isShort ? 'PORTRAIT_9_16' : 'LANDSCAPE_16_9',
        source_url: parsedUrl.href,
        site_name: 'YouTube',
        autoCategoryName: categoryName,
        autoTags: tags,
        autoPriority: priority,
      };
      return NextResponse.json({ success: true, metadata });
    }

    // 3. Instagram Fast Metadata
    if (platform === 'Instagram') {
      let igTitle = generateFallbackTitle(parsedUrl.href, 'Instagram');
      if (parsedUrl.pathname.includes('/reel/')) {
        igTitle = `Instagram Reel Video`;
      }

      const { categoryName, tags, priority } = autoClassifyContent(igTitle, 'Instagram Reel video', 'Instagram');

      const metadata: SmartIngestionResult = {
        title: igTitle,
        description: `Instagram Reel (9:16 Portrait Video)`,
        thumbnail_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080&auto=format&fit=crop',
        platform: 'Instagram',
        media_type: 'REEL',
        aspect_ratio: 'PORTRAIT_9_16',
        source_url: parsedUrl.href,
        site_name: 'Instagram',
        autoCategoryName: categoryName,
        autoTags: tags,
        autoPriority: priority,
      };
      return NextResponse.json({ success: true, metadata });
    }

    // 4. Generic Web Fetch & OpenGraph Parser
    let html = '';
    try {
      const response = await fetch(parsedUrl.href, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        html = await response.text();
      }
    } catch (fetchErr) {
      console.warn(`Scrape fetch note:`, fetchErr);
    }

    if (!html) {
      const fallbackTitle = generateFallbackTitle(parsedUrl.href, platform);
      const { categoryName, tags, priority } = autoClassifyContent(fallbackTitle, '', platform);
      const fallbackMeta: SmartIngestionResult = {
        title: fallbackTitle,
        description: `Saved ${platform} content from ${parsedUrl.hostname}`,
        thumbnail_url: null,
        platform,
        media_type: defaultMediaType,
        aspect_ratio: defaultAspectRatio,
        source_url: parsedUrl.href,
        site_name: parsedUrl.hostname,
        autoCategoryName: categoryName,
        autoTags: tags,
        autoPriority: priority,
      };
      return NextResponse.json({ success: true, metadata: fallbackMeta, fallback: true });
    }

    const $ = cheerio.load(html);

    const ogTitle =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';
    const ogDescription =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';
    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="image_src"]').attr('href') ||
      null;
    const ogSiteName = $('meta[property="og:site_name"]').attr('content') || parsedUrl.hostname;

    const ogWidthStr = $('meta[property="og:image:width"]').attr('content');
    const ogHeightStr = $('meta[property="og:image:height"]').attr('content');
    const ogWidth = ogWidthStr ? parseInt(ogWidthStr, 10) : null;
    const ogHeight = ogHeightStr ? parseInt(ogHeightStr, 10) : null;

    let calculatedAspectRatio: AspectRatioType = defaultAspectRatio;
    if (ogWidth && ogHeight) {
      if (ogHeight > ogWidth) {
        calculatedAspectRatio = 'PORTRAIT_9_16';
      } else {
        calculatedAspectRatio = 'LANDSCAPE_16_9';
      }
    }

    let mediaType: MediaType = defaultMediaType;
    if (
      calculatedAspectRatio === 'PORTRAIT_9_16' &&
      (platform === 'Instagram' || platform === 'YouTube' || platform === 'TikTok' || platform === 'Video')
    ) {
      mediaType = 'REEL';
    }

    const finalTitle = cleanTitle(ogTitle) || generateFallbackTitle(parsedUrl.href, platform);
    const { categoryName, tags, priority } = autoClassifyContent(finalTitle, ogDescription, platform);

    const metadata: SmartIngestionResult = {
      title: finalTitle,
      description: (ogDescription || '').slice(0, 300),
      thumbnail_url: ogImage,
      platform,
      media_type: mediaType,
      aspect_ratio: calculatedAspectRatio,
      source_url: parsedUrl.href,
      site_name: ogSiteName,
      autoCategoryName: categoryName,
      autoTags: tags,
      autoPriority: priority,
    };

    return NextResponse.json({ success: true, metadata });
  } catch (error: any) {
    console.error('Error in /api/scrape:', error);
    return NextResponse.json({ error: error.message || 'Scraping failed' }, { status: 500 });
  }
}
