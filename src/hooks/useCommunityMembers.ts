'use client';

import { useEffect, useState } from 'react';
import type { CommunityMember } from '@/lib/communityNotifications';

/**
 * The member list used for @mention autocomplete.
 *
 * Handles and display names only — the API deliberately never returns email
 * addresses. Fetched once per mount and shared through this hook, so opening a
 * thread does not re-request it for every composer in it.
 */
export function useCommunityMembers(enabled: boolean) {
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    let cancelled = false;

    fetch('/api/community/members')
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => {
        if (cancelled) return;
        setMembers(Array.isArray(d.members) ? d.members : []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, loaded]);

  return { members, handles: members.map((m) => m.handle) };
}
