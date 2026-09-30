import { NextRequest, NextResponse } from 'next/server';
import { sendDailyPostReminders } from '@/lib/postReminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vercel cron entry point for the daily post reminder.
 *
 * Vercel invokes this with HTTP GET. `CRON_SECRET` must be configured in the
 * deployment; without it the route stays closed rather than letting anyone on
 * the internet trigger reminder pushes.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendDailyPostReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Daily post reminder failed';
    console.error('Daily post reminder failed:', err);
    const status = message.includes('table is missing') || message.includes('Web Push keys')
      ? 503
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
