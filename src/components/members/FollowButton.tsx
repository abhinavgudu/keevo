'use client';

import { useState } from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Follow/unfollow toggle for a member. Owns its state optimistically and
 * settles on the server's answer, so profile pages and (later) search rows
 * share one behaviour instead of reimplementing the toggle each time.
 * Renders nothing when signed out — the parent decides whether to prompt.
 */
export function FollowButton({
  targetUserId,
  initialFollowing,
  onCountChange,
  className = '',
}: {
  targetUserId: string;
  initialFollowing: boolean;
  onCountChange?: (count: number) => void;
  className?: string;
}) {
  const { session } = useAuth();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  // Adopt fresh props (refetch, or the same member revisited later) without
  // clobbering an in-flight optimistic update mid-render. Guarding on values
  // is what keeps the local toggle alive across unrelated re-renders.
  const [lastProps, setLastProps] = useState(initialFollowing);
  if (initialFollowing !== lastProps) {
    setLastProps(initialFollowing);
    setFollowing(initialFollowing);
  }

  if (!session?.access_token) return null;

  const toggle = async () => {
    if (pending) return;
    const next = !following;
    setFollowing(next);
    setPending(true);
    try {
      const res = await fetch('/api/community/follow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ target_user_id: targetUserId }),
      });
      if (!res.ok) {
        setFollowing(!next);
        return;
      }
      const body = await res.json();
      setFollowing(body.following);
      onCountChange?.(body.follower_count ?? 0);
    } catch {
      setFollowing(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-60 ${className} ${
        following
          ? 'bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-600'
          : 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-indigo-500'
      }`}
    >
      {following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
      {pending ? '…' : following ? 'Following' : 'Follow'}
    </button>
  );
}
