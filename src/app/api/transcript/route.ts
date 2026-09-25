import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';

async function assemblyAIRequest(endpoint: string, options: RequestInit = {}) {
  if (!ASSEMBLYAI_API_KEY) {
    throw new Error('AssemblyAI API key not configured');
  }
  const response = await fetch(`${ASSEMBLYAI_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': ASSEMBLYAI_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `AssemblyAI error: ${response.status}`);
  }
  return response.json();
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { videoUrl, itemId } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl required' }, { status: 400 });
    }

    // Check if user owns this item (if itemId provided)
    if (itemId) {
      const { data: item, error } = await supabase
        .from('content_items')
        .select('id, user_id, transcript_json, transcript_text')
        .eq('id', itemId)
        .eq('user_id', user.id)
        .single();

      if (error || !item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }

      // Return cached transcript if exists
      if (item.transcript_json) {
        return NextResponse.json({
          success: true,
          transcript: item.transcript_json,
          text: item.transcript_text,
          cached: true
        });
      }
    }

    // Extract audio URL from video URL
    const audioUrl = await extractAudioUrl(videoUrl);
    if (!audioUrl) {
      return NextResponse.json({ error: 'Could not extract audio from video URL' }, { status: 400 });
    }

    // Submit to AssemblyAI
    const transcriptRequest = await assemblyAIRequest('/transcript', {
      method: 'POST',
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        auto_chapters: true,
        entity_detection: true,
        sentiment_analysis: true
      })
    });

    const transcriptId = transcriptRequest.id;

    // Poll for completion
    let transcript = null;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const status = await assemblyAIRequest(`/transcript/${transcriptId}`);

      if (status.status === 'completed') {
        transcript = status;
        break;
      }
      if (status.status === 'error') {
        throw new Error(status.error || 'Transcription failed');
      }
      attempts++;
    }

    if (!transcript) {
      return NextResponse.json({
        success: false,
        error: 'Transcription timed out',
        transcriptId
      }, { status: 202 });
    }

    // Format segments
    const segments = transcript.words?.map((w: { text: string; start: number; end: number; speaker?: string; confidence?: number }) => ({
      text: w.text,
      start: w.start / 1000,
      end: w.end / 1000,
      speaker: w.speaker,
      confidence: w.confidence
    })) || [];

    const fullText = transcript.text || '';

    // Save to database if itemId provided
    if (itemId) {
      await supabase
        .from('content_items')
        .update({
          transcript_json: segments,
          transcript_text: fullText,
          transcript_language: transcript.language_code || 'en',
          transcript_duration: transcript.audio_duration
        })
        .eq('id', itemId)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      success: true,
      transcript: segments,
      text: fullText,
      language: transcript.language_code,
      duration: transcript.audio_duration,
      chapters: transcript.chapters,
      entities: transcript.entities,
      sentiment: transcript.sentiment_analysis_results
    });
  } catch (err) {
    const error = err as Error;
    console.error('Transcript error:', error);
    return NextResponse.json({ error: error.message || 'Transcription failed' }, { status: 500 });
  }
}

// Helper to extract audio URL from various video platforms
async function extractAudioUrl(videoUrl: string): Promise<string | null> {
  try {
    const url = new URL(videoUrl);

    // YouTube - use ytdlp or invidious instance
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      // For production, use a ytdlp microservice or Invidious
      // For now, return the video URL - AssemblyAI can handle YouTube URLs directly
      return videoUrl;
    }

    // Instagram - can't easily extract, would need API
    if (url.hostname.includes('instagram.com')) {
      return null;
    }

    // TikTok - can use TikTok API
    if (url.hostname.includes('tiktok.com')) {
      return null;
    }

    // Direct video files
    if (videoUrl.match(/\.(mp4|webm|mov|m4a|mp3)(\?|$)/i)) {
      return videoUrl;
    }

    // Generic - try as-is (AssemblyAI supports many formats)
    return videoUrl;
  } catch {
    return null;
  }
}

// GET endpoint to check transcript status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth header' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const transcriptId = searchParams.get('id');

    if (!transcriptId) {
      return NextResponse.json({ error: 'Transcript ID required' }, { status: 400 });
    }

    const status = await assemblyAIRequest(`/transcript/${transcriptId}`);

    return NextResponse.json({
      status: status.status,
      transcript: status.status === 'completed' ? {
        text: status.text,
        words: status.words?.map((w: { text: string; start: number; end: number; speaker?: string }) => ({
          text: w.text,
          start: w.start / 1000,
          end: w.end / 1000,
          speaker: w.speaker
        })),
        language: status.language_code,
        duration: status.audio_duration
      } : null
    });
  } catch (err) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}