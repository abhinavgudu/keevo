import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthorMap } from '@/lib/authorProfiles';
import { membersFromAuthorMap } from '@/lib/communityNotifications';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function resolveViewer(req: NextRequest): Promise<string | undefined> {
  const header = req.headers.get('Authorization');
  if (!header) return undefined;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${header.replace('Bearer ', '')}` } },
  });
  const { data } = await client.auth.getUser();
  return data.user?.id;
}

/**
 * GET: the member list backing @mention autocomplete.
 *
 * Returns handle + display name only. The underlying auth list holds full email
 * addresses and those must never reach the client — the handle is derived
 * server-side here and the raw address stays on the server.
 */
export async function GET(request: NextRequest) {
  try {
    const viewerId = await resolveViewer(request);
    const authorMap = await getAuthorMap();
    const members = membersFromAuthorMap(authorMap, viewerId);

    return NextResponse.json({ members });
  } catch (err) {
    const error = err as Error;
    console.error('Error listing community members:', error);
    return NextResponse.json({ error: error.message, members: [] }, { status: 500 });
  }
}
