'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { ContentItem } from '@/types/vault';
import { CommunityCard } from '@/components/cards/CommunityCard';
import { MediaPreviewModal } from '@/components/modals/MediaPreviewModal';
import { FollowButton } from '@/components/members/FollowButton';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { LoadingCircle } from '@/components/LoadingCircle';
import type { PostReaction } from '@/lib/reactions';

interface MemberProfile {
  id: string;
  handle: string;
  name: string;
  bio: string | null;
  headline: string | null;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  post_count: number;
  followed_by_me: boolean;
  is_self: boolean;
}

const HEADLINE_MAX = 80;
const BIO_MAX = 160;

export default function MemberProfilePage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { user, session } = useAuth();

  const [member, setMember] = useState<MemberProfile | null>(null);
  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarOk, setAvatarOk] = useState(true);

  const [editingBio, setEditingBio] = useState(false);
  const [headlineDraft, setHeadlineDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Reset on member change during render (the documented alternative to
  // setState-in-effect), so navigating from one profile to another never
  // flashes the previous member's posts.
  const [queryId, setQueryId] = useState(id);
  if (id !== queryId) {
    setQueryId(id);
    setMember(null);
    setPosts([]);
    setLoading(true);
    setError(null);
    setAvatarOk(true);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    fetch(`/api/community/members/${id}`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        setMember(d.member);
        setPosts(d.posts || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this profile.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, session?.access_token]);

  // Same settle-on-truth contract as the community feed's like handler.
  const handleToggleLike = useCallback(
    async (postId: string, reaction?: PostReaction | null) => {
      if (!session?.access_token) return null;
      try {
        const res = await fetch('/api/community/likes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(
            reaction === undefined ? { item_id: postId } : { item_id: postId, reaction }
          ),
        });
        if (!res.ok) return null;
        const body = await res.json();
        setPosts((prev) =>
          prev.map((i) =>
            i.id === postId
              ? {
                  ...i,
                  liked_by_me: body.liked,
                  like_count: body.like_count,
                  my_reaction: body.my_reaction,
                  reaction_counts: body.reaction_counts,
                }
              : i
          )
        );
        return {
          liked: body.liked,
          like_count: body.like_count,
          my_reaction: body.my_reaction ?? null,
          reaction_counts: body.reaction_counts ?? {},
        };
      } catch {
        return null;
      }
    },
    [session]
  );

  const startBioEdit = () => {
    if (!member) return;
    setHeadlineDraft(member.headline || '');
    setBioDraft(member.bio || '');
    setEditingBio(true);
  };

  const saveBio = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !member) return;
    setSavingBio(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          headline: headlineDraft.trim().slice(0, HEADLINE_MAX),
          bio: bioDraft.trim().slice(0, BIO_MAX),
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      // Own session sees it instantly; everyone else within the author-map
      // cache window (see the profiles-phase plan).
      setMember({
        ...member,
        headline: headlineDraft.trim() || null,
        bio: bioDraft.trim() || null,
      });
      setEditingBio(false);
    } finally {
      setSavingBio(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06070B] flex items-center justify-center gap-2 text-sm text-slate-500">
        <LoadingCircle className="w-4 h-4" /> Loading profile
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="min-h-screen bg-[#06070B] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-bold text-slate-200">Profile not found</p>
        <p className="text-xs text-slate-500">{error || 'This member does not exist.'}</p>
        <Link href="/community" className="text-xs font-bold text-cyan-400 hover:text-cyan-300">
          Back to Community
        </Link>
      </div>
    );
  }

  const initial = (member.name || 'K').charAt(0).toUpperCase();
  const isSelf = !!user && member.id === user.id;

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-100 pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <Link
          href="/community"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Community
        </Link>

        {/* ── Header ── */}
        <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-5">
          <div className="flex items-start gap-4">
            {member.avatar_url && avatarOk ? (
              <img
                src={member.avatar_url}
                alt={member.name}
                className="w-16 h-16 rounded-full object-cover border border-slate-700 shrink-0"
                onError={() => setAvatarOk(false)}
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950 flex items-center justify-center font-black text-2xl shrink-0">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-white tracking-tight truncate">{member.name}</h1>
              <p className="text-xs font-mono text-cyan-400">@{member.handle}</p>
              {member.headline && !editingBio && (
                <p className="text-[13px] text-slate-300 mt-1">{member.headline}</p>
              )}
            </div>
          </div>

          {editingBio ? (
            <div className="mt-4 space-y-2.5">
              <div>
                <input
                  value={headlineDraft}
                  onChange={(e) => setHeadlineDraft(e.target.value)}
                  maxLength={HEADLINE_MAX}
                  placeholder="Headline — e.g. DSA mentor, Reels collector"
                  className="w-full rounded-xl bg-slate-800/70 border border-slate-700 px-3 py-2 text-[13px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
                <p className="text-right text-[10px] font-mono text-slate-600 mt-0.5">
                  {headlineDraft.length}/{HEADLINE_MAX}
                </p>
              </div>
              <div>
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  maxLength={BIO_MAX}
                  rows={3}
                  placeholder="A line about yourself…"
                  className="w-full rounded-xl bg-slate-800/70 border border-slate-700 px-3 py-2 text-[13px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-none"
                />
                <p className="text-right text-[10px] font-mono text-slate-600 mt-0.5">
                  {bioDraft.length}/{BIO_MAX}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setEditingBio(false)}
                  disabled={savingBio}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveBio}
                  disabled={savingBio}
                  className="px-4 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingBio && <LoadingCircle className="w-3 h-3" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {member.bio && <p className="text-[13px] text-slate-400 leading-relaxed mt-3">{member.bio}</p>}
              <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                <span>
                  <strong className="text-white font-black">{member.follower_count}</strong> followers
                </span>
                <span>
                  <strong className="text-white font-black">{member.following_count}</strong> following
                </span>
                <span>
                  <strong className="text-white font-black">{member.post_count}</strong> posts
                </span>
              </div>
              <div className="mt-3">
                {isSelf ? (
                  <button
                    onClick={startBioEdit}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-600 transition-all active:scale-95"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit profile
                  </button>
                ) : (
                  <FollowButton
                    targetUserId={member.id}
                    initialFollowing={member.followed_by_me}
                    onCountChange={(count) =>
                      setMember((prev) => (prev ? { ...prev, follower_count: count } : prev))
                    }
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Posts ── */}
        <h2 className="mt-6 mb-3 text-sm font-bold text-slate-300 uppercase tracking-wider">
          Posts ({member.post_count})
        </h2>
        {posts.length === 0 ? (
          <p className="text-[13px] text-slate-600 py-6 text-center">
            No community posts yet.
          </p>
        ) : (
          <div className="space-y-7">
            {posts.map((item) => (
              <CommunityCard
                key={item.id}
                item={item}
                variant="feed"
                isOwner={isSelf}
                onOpenPreview={(it) => {
                  setSelectedItem(it);
                  setIsPreviewOpen(true);
                }}
                onToggleFavorite={handleToggleLike}
              />
            ))}
          </div>
        )}

        <MediaPreviewModal
          item={selectedItem}
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setSelectedItem(null);
          }}
          onToggleFavorite={handleToggleLike}
          onUpdateNotes={() => {}}
          onItemUpdated={(updated) => {
            setPosts((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
          }}
        />
      </div>
    </div>
  );
}
