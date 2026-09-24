import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { AspectRatioType, MediaType, PriorityLevel } from '@/types/vault';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const sanitizedFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isVideo = file.type.startsWith('video/') || ['mp4', 'mov', 'webm'].includes(ext);
    const isImage = file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
    const isPdf = file.type === 'application/pdf' || ext === 'pdf';

    let mediaType: MediaType = 'DOCUMENT';
    let aspectRatio: AspectRatioType = 'STANDARD_DOCUMENT';
    let platform = 'PDF';

    if (isVideo) {
      mediaType = 'REEL';
      aspectRatio = 'PORTRAIT_9_16';
      platform = 'Video';
    } else if (isImage) {
      mediaType = 'ARTICLE';
      aspectRatio = 'LANDSCAPE_16_9';
      platform = 'Image';
    } else if (['doc', 'docx', 'txt', 'md', 'ppt', 'pptx', 'csv', 'xlsx'].includes(ext)) {
      mediaType = 'DOCUMENT';
      aspectRatio = 'STANDARD_DOCUMENT';
      platform = ext.toUpperCase();
    }

    // Attempt Supabase Storage Upload if configured
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const bucketName = 'pdfs';
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(`uploads/${sanitizedFileName}`, buffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: true,
          });

        if (!error && data) {
          const { data: publicData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(`uploads/${sanitizedFileName}`);

          return NextResponse.json({
            success: true,
            fileUrl: publicData.publicUrl,
            fileName: file.name,
            fileSize: file.size,
            platform,
            mediaType,
            aspectRatio,
          });
        }
      } catch (storageErr) {
        console.warn('Supabase storage upload fallback to data URI:', storageErr);
      }
    }

    // Fallback: Return base64 data URI for offline / instant mode
    const mimeType = file.type || 'application/octet-stream';
    const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
    
    return NextResponse.json({
      success: true,
      fileUrl: base64,
      fileName: file.name,
      fileSize: file.size,
      platform,
      mediaType,
      aspectRatio,
    });
  } catch (error: any) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: error.message || 'File upload failed' }, { status: 500 });
  }
}
