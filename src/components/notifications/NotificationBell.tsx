'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Loader2,
  MessageSquare,
  Heart,
  AtSign,
  CornerDownRight,
  Globe,
  CheckCheck,
  PencilLine,
} from 'lucide-react';
import { useCommunityNotifications } from '@/hooks/useCommunityNotifications';
import type { CommunityNotification, CommunityNotificationKind } from '@/lib/communityNotifications';
import { buildCommunityPostHref, isConversationKind, notifyCommunityPostFocus } from '@/lib/communityDeepLink';

function timeAgo(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateString).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const KIND_ICON: Record<CommunityNotificationKind, React.ReactNode> = {
  new_post: <Globe className="w-3.5 h-3.5 text-emerald-400" />,
  comment: <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />,
  reply: <CornerDownRight className="w-3.5 h-3.5 text-cyan-400" />,
  mention: <AtSign className="w-3.5 h-3.5 text-amber-400" />,
  like: <Heart className="w-3.5 h-3.5 text-rose-400" />,
  post_edited: <PencilLine className="w-3.5 h-3.5 text-violet-400" />,
};

const KIND_LABEL: Record<CommunityNotificationKind, string> = {
  new_post: 'shared a new post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  mention: 'mentioned you in a comment',
  like: 'liked your post',
  post_edited: 'edited a post you engaged with',
};

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: CommunityNotification;
  onOpen: (n: CommunityNotification) => void;
}) {
  const unread = !notification.read_at;
  const actor = notification.actor_name || 'Someone';

  return (
    <button
      onClick={() => onOpen(notification)}
      className={`w-full text-left px-3.5 py-2.5 flex gap-2.5 transition-colors border-b border-slate-800/60 last:border-b-0 ${
        unread ? 'bg-cyan-500/[0.06] hover:bg-cyan-500/10' : 'hover:bg-slate-800/40'
      }`}
    >
      <div className="shrink-0 w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center">
        {KIND_ICON[notification.kind]}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] text-slate-300 leading-snug break-words">
          <span className="font-semibold text-white">{actor}</span>{' '}
          {KIND_LABEL[notification.kind]}
        </p>

        {notification.comment_excerpt && (
          <p className="text-[11.5px] text-slate-500 mt-0.5 line-clamp-2 break-words">
            {notification.comment_excerpt}
          </p>
        )}

        {!notification.comment_excerpt && notification.item_title && (
          <p className="text-[11.5px] text-slate-500 mt-0.5 truncate">{notification.item_title}</p>
        )}

        <span className="text-[10.5px] text-slate-600 font-mono mt-0.5 block">
          {timeAgo(notification.created_at)}
        </span>
      </div>

      {unread && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2" />}
    </button>
  );
}

/**
 * The community activity bell.
 *
 * Separate from the Community tab badge on purpose: that badge counts unread
 * posts, this counts every kind of community activity. Neither reads the
 * other's state.
 */
export function NotificationBell({ className = '' }: { className?: string }) {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useCommunityNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openNotification = (n: CommunityNotification) => {
    if (!n.read_at) markRead([n.id]);
    setOpen(false);

    // Deep-link to the post itself, and hand the comment box focus for the kinds
    // where a reply is almost certainly the next thing wanted. A post that has
    // since been deleted has no item_id, so fall back to plain /community.
    if (!n.item_id) {
      router.push('/community');
      return;
    }

    const wantsReply = isConversationKind(n.kind);
    router.push(buildCommunityPostHref(n.item_id, n.kind));

    // If the feed is already open, pushing only changes the query string and
    // does not remount the page, so tell it directly. Harmless when the page is
    // not mounted yet, because it reads the same values off the URL on mount.
    notifyCommunityPostFocus(n.item_id, wantsReply);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        title="Community notifications"
        className="relative p-2 sm:p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 text-white text-[9.5px] font-black shadow-lg shadow-cyan-500/40 border-2 border-[#06070B]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/50 overflow-hidden z-50">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800">
            <span className="text-[12.5px] font-bold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(26rem,60vh)] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[11.5px] text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center mx-auto mb-2.5">
                  <Bell className="w-4 h-4 text-slate-600" />
                </div>
                <p className="text-[12px] text-slate-400 font-medium">No notifications yet</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Comments, replies, mentions and likes will show up here.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationRow key={n.id} notification={n} onOpen={openNotification} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
