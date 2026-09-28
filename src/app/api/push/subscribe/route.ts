import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Register this browser's push subscription against the signed-in account.
 *
 * The endpoint URL arrives from the client but is about to become a destination
 * the SERVER posts to, with a request this server constructed. Accepting any
 * string here would turn the server into a request proxy aimed at whatever host
 * the caller named, so the scheme and the host are both pinned to the actual
 * push services browsers hand out subscriptions for.
 */
const ALLOWED_PUSH_HOSTS = new Set([
  // Chrome / Edge on Android and desktop, and most Chromium PWAs
  'fcm.googleapis.com',
  // Firefox
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  // Safari on iOS and macOS
  'web.push.apple.com',
]);

function getBearer(req: NextRequest) {
  const header = req.headers.get('Authorization');
  if (!header) return null;
  return header.replace('Bearer ', '');
}

async function resolveUser(token: string) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}

function validEndpoint(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_PUSH_HOSTS.has(url.hostname)) return null;
  return raw;
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function validKey(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 16 || raw.length > 255) return null;
  return BASE64URL.test(raw) ? raw : null;
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const user = await resolveUser(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const endpoint = validEndpoint(body?.endpoint);
    const p256dh = validKey(body?.keys?.p256dh);
    const auth = validKey(body?.keys?.auth);

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'Malformed push subscription' },
        { status: 400 }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Upsert on endpoint, not on user. One browser installation has exactly one
    // endpoint, and that is what makes "this device now belongs to whoever is
    // signed in" work: signing in as somebody else on a device moves the row
    // instead of leaving the previous person's subscription behind to fire into
    // a void. It is also what makes re-subscribing after a permission change
    // idempotent instead of accumulating rows.
    const { error } = await admin
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: request.headers.get('user-agent') || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('Push subscribe failed:', error);
      return NextResponse.json({ error: 'Failed to store subscription' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 });
  }
}
