'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import {
  Users, Database, ShieldAlert, Loader2, ArrowLeft, Trash2,
  BarChart3, Settings, Eye, Globe, ToggleLeft, ToggleRight,
  TrendingUp, Activity, Crown, Zap, Star, Film, FileText,
  BookOpen, Heart, Search, Bell, Palette, Layout, Layers,
  ChevronRight, RefreshCw, Download, AlertTriangle, CheckCircle2,
  XCircle, Clock, Hash, Cpu, Signal, Lock, Unlock, Ban,
  MessageSquare, PieChart, Target, Award, Filter
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  lastSignIn: string;
  itemCount: number;
}

interface SystemStats {
  totalUsers: number;
  totalItems: number;
  totalReels: number;
  totalArticles: number;
  totalDocs: number;
  totalFavorites: number;
  totalAccesses: number;
  publicItems: number;
}

type AdminTab = 'overview' | 'users' | 'content' | 'ui-controls' | 'community' | 'system';

const ADMIN_EMAIL = 'miabhisu@gmail.com';

// UI Feature Toggles stored in localStorage for demo (in production: db/env)
const DEFAULT_UI_FLAGS = {
  showMetricsBar: true,
  showQuickAddBar: true,
  showFooter: true,
  showReelsDeck: true,
  showCommandPalette: true,
  showCommunityTab: true,
  showPriorityScore: true,
  allowUserSignup: true,
  showSearchBar: true,
  maintenanceMode: false,
  darkModeForced: true,
  showWelcomeBanner: false,
};

export default function AdminDashboard() {
  const { user, isLoading: authLoading, session } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uiFlags, setUiFlags] = useState(DEFAULT_UI_FLAGS);
  const [refreshing, setRefreshing] = useState(false);
  const [communityItems, setCommunityItems] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [contentSearch, setContentSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Restore UI flags from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('keeva_admin_ui_flags') || localStorage.getItem('keevo_admin_ui_flags');
    if (saved) {
      try { setUiFlags(JSON.parse(saved)); } catch {}
    }
  }, []);

  // Security Guard — only admin email
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/auth/signin');
      } else if (user.email !== ADMIN_EMAIL) {
        router.replace('/');
      }
    }
  }, [user, authLoading, router]);

  const fetchAdminData = useCallback(async () => {
    if (!session?.access_token || user?.email !== ADMIN_EMAIL) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch admin data');

      setUsers(data.users || []);
      const allItemDetails = data.itemDetails || [];
      setAllItems(allItemDetails);

      // Calculate system stats from users data
      const totalItems = data.totalItems || 0;

      setStats({
        totalUsers: data.users?.length || 0,
        totalItems,
        totalReels: allItemDetails.filter((i: any) => i.media_type === 'REEL').length,
        totalArticles: allItemDetails.filter((i: any) => i.media_type === 'ARTICLE' || i.media_type === 'LINKEDIN_POST').length,
        totalDocs: allItemDetails.filter((i: any) => i.media_type === 'DOCUMENT').length,
        totalFavorites: allItemDetails.filter((i: any) => i.is_favorite).length,
        totalAccesses: allItemDetails.reduce((sum: number, i: any) => sum + (i.access_count || 0), 0),
        publicItems: allItemDetails.filter((i: any) => i.is_public).length,
      });
      setCommunityItems(allItemDetails.filter((i: any) => i.is_public));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, user]);

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) fetchAdminData();
  }, [fetchAdminData, user]);

  const toggleUiFlag = (key: keyof typeof DEFAULT_UI_FLAGS) => {
    const updated = { ...uiFlags, [key]: !uiFlags[key] };
    setUiFlags(updated);
    localStorage.setItem('keevo_admin_ui_flags', JSON.stringify(updated));
  };

  // Admin can toggle ANY item's community status
  const toggleCommunityByAdmin = async (itemId: string, currentPublic: boolean) => {
    setTogglingId(itemId);
    try {
      const res = await fetch(`/api/admin/toggle-community`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ itemId, is_public: !currentPublic }),
      });
      if (res.ok) {
        setAllItems(prev => prev.map(i => i.id === itemId ? { ...i, is_public: !currentPublic } : i));
        setCommunityItems(prev =>
          !currentPublic
            ? [...prev, allItems.find(i => i.id === itemId)]
            : prev.filter(i => i.id !== itemId)
        );
        setStats(prev => prev ? { ...prev, publicItems: prev.publicItems + (!currentPublic ? 1 : -1) } : prev);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleRemoveFromCommunity = async (itemId: string) => {
    try {
      await fetch(`/api/items/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ is_public: false }),
      });
      setCommunityItems(prev => prev.filter(i => i.id !== itemId));
    } catch (e) {
      console.error(e);
    }
  };

  if (authLoading || (user?.email === ADMIN_EMAIL && loading)) {
    return (
      <div className="min-h-screen bg-[#04050A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-fuchsia-600 via-indigo-600 to-cyan-500 p-[2px] shadow-2xl shadow-fuchsia-500/40">
              <div className="w-full h-full bg-[#04050A] rounded-[14px] flex items-center justify-center">
                <ShieldAlert className="w-7 h-7 text-fuchsia-400" />
              </div>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-[#04050A] animate-pulse" />
          </div>
          <p className="text-slate-400 text-sm font-mono">Initializing Command Center...</p>
        </div>
      </div>
    );
  }

  if (user?.email !== ADMIN_EMAIL) return null;

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" />, badge: users.length },
    { id: 'content', label: 'All Content', icon: <Database className="w-4 h-4" />, badge: stats?.totalItems },
    { id: 'community', label: 'Community', icon: <Globe className="w-4 h-4" />, badge: stats?.publicItems },
    { id: 'ui-controls', label: 'UI Controls', icon: <Layout className="w-4 h-4" /> },
    { id: 'system', label: 'System', icon: <Cpu className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#04050A] text-slate-100 relative overflow-hidden">
      {/* Premium ambient glows */}
      <div className="fixed top-0 left-0 w-[800px] h-[600px] bg-fuchsia-700/8 rounded-full blur-[180px] pointer-events-none" />
      <div className="fixed top-0 right-0 w-[600px] h-[500px] bg-indigo-700/8 rounded-full blur-[160px] pointer-events-none" />
      <div className="fixed bottom-0 left-1/3 w-[700px] h-[400px] bg-cyan-700/6 rounded-full blur-[160px] pointer-events-none" />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-50 bg-[#04050A]/90 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all group"
            >
              <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-fuchsia-600 via-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/30">
                  <ShieldAlert className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#04050A]" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white leading-none">Keeva Admin</h1>
                <p className="text-[10px] text-fuchsia-400 font-mono leading-none mt-0.5">Command Center v2.0</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchAdminData}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-medium transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
              Refresh
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20">
              <Crown className="w-3.5 h-3.5 text-fuchsia-400" />
              <span className="text-xs font-semibold text-fuchsia-300">Super Admin</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-6 flex gap-6">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 gap-1">
          <div className="mb-4 px-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Navigation</p>
          </div>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-fuchsia-600/20 to-indigo-600/20 text-white border border-fuchsia-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={activeTab === tab.id ? 'text-fuchsia-400' : 'text-slate-500'}>{tab.icon}</span>
                {tab.label}
              </div>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-fuchsia-500/30 text-fuchsia-300' : 'bg-white/10 text-slate-400'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}

          {/* Admin info card */}
          <div className="mt-auto pt-4 border-t border-white/5">
            <div className="p-3 rounded-xl bg-white/3 border border-white/8">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-fuchsia-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                  {user?.email?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-white">Admin</p>
                  <p className="text-[9px] text-slate-500 truncate max-w-[120px]">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                <span className="text-[10px] text-emerald-400">System Online</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile tab bar */}
        <div className="lg:hidden flex gap-2 overflow-x-auto pb-1 w-full mb-4 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-fuchsia-600/20 text-fuchsia-300 border border-fuchsia-500/30'
                  : 'bg-white/5 text-slate-400'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 space-y-6">
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          {/* ─── OVERVIEW TAB ─── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">System Overview</h2>
                <p className="text-slate-400 text-sm">Real-time Keeva platform intelligence dashboard.</p>
              </div>

              {/* Primary KPI Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Users', value: stats?.totalUsers ?? '—', icon: <Users className="w-5 h-5" />, color: 'cyan', change: '+12%' },
                  { label: 'Content Items', value: stats?.totalItems ?? '—', icon: <Database className="w-5 h-5" />, color: 'indigo', change: '+34%' },
                  { label: 'Total Accesses', value: stats?.totalAccesses ?? '—', icon: <Eye className="w-5 h-5" />, color: 'fuchsia', change: '+8%' },
                  { label: 'Public Posts', value: stats?.publicItems ?? '—', icon: <Globe className="w-5 h-5" />, color: 'emerald', change: 'New' },
                ].map((kpi) => (
                  <div key={kpi.label} className="relative overflow-hidden bg-[#0A0C14] border border-white/8 rounded-2xl p-5 group hover:border-white/15 transition-all">
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-${kpi.color}-500/5 rounded-full blur-2xl pointer-events-none`} />
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-2 rounded-xl bg-${kpi.color}-500/15 text-${kpi.color}-400`}>
                        {kpi.icon}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-${kpi.color}-500/10 text-${kpi.color}-400 border border-${kpi.color}-500/20`}>
                        {kpi.change}
                      </span>
                    </div>
                    <p className="text-3xl font-black text-white tabular-nums">{kpi.value}</p>
                    <p className="text-xs text-slate-500 mt-1 font-medium">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Content breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[#0A0C14] border border-white/8 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-indigo-400" /> Content Breakdown
                  </h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Reels / Shorts', value: stats?.totalReels, icon: <Film className="w-3.5 h-3.5" />, color: 'fuchsia' },
                      { label: 'Articles / Posts', value: stats?.totalArticles, icon: <BookOpen className="w-3.5 h-3.5" />, color: 'cyan' },
                      { label: 'Documents / PDFs', value: stats?.totalDocs, icon: <FileText className="w-3.5 h-3.5" />, color: 'indigo' },
                      { label: 'Favorited', value: stats?.totalFavorites, icon: <Heart className="w-3.5 h-3.5" />, color: 'rose' },
                    ].map((row) => {
                      const pct = stats?.totalItems ? Math.round(((row.value || 0) / stats.totalItems) * 100) : 0;
                      return (
                        <div key={row.label} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className={`flex items-center gap-2 text-${row.color}-400`}>
                              {row.icon} <span className="text-slate-300">{row.label}</span>
                            </div>
                            <span className="font-mono text-slate-400">{row.value ?? 0} <span className="text-slate-600">({pct}%)</span></span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full bg-${row.color}-500/60 rounded-full transition-all duration-700`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#0A0C14] border border-white/8 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" /> Top Active Users
                  </h3>
                  <div className="space-y-3">
                    {[...users]
                      .sort((a, b) => b.itemCount - a.itemCount)
                      .slice(0, 5)
                      .map((u, i) => (
                        <div key={u.id} className="flex items-center gap-3">
                          <span className={`w-5 text-center text-[11px] font-black ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-600' : 'text-slate-600'}`}>
                            #{i + 1}
                          </span>
                          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center text-white font-bold text-[10px] uppercase shrink-0">
                            {u.firstName?.[0] || u.email[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-200 truncate">{u.firstName || u.email.split('@')[0]}</p>
                            <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                          </div>
                          <span className="text-xs font-bold text-cyan-400 tabular-nums">{u.itemCount}</span>
                        </div>
                      ))}
                    {users.length === 0 && <p className="text-slate-600 text-xs">No users yet.</p>}
                  </div>
                </div>
              </div>

              {/* System health */}
              <div className="bg-[#0A0C14] border border-white/8 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Signal className="w-4 h-4 text-emerald-400" /> System Health
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Database', status: 'healthy', icon: <Database className="w-4 h-4" /> },
                    { label: 'Auth System', status: 'healthy', icon: <Lock className="w-4 h-4" /> },
                    { label: 'Storage', status: 'healthy', icon: <Layers className="w-4 h-4" /> },
                    { label: 'Community API', status: uiFlags.showCommunityTab ? 'healthy' : 'disabled', icon: <Globe className="w-4 h-4" /> },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
                      <div className={`${s.status === 'healthy' ? 'text-emerald-400' : s.status === 'disabled' ? 'text-slate-600' : 'text-red-400'}`}>
                        {s.status === 'healthy' ? <CheckCircle2 className="w-4 h-4" /> : s.status === 'disabled' ? <XCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-300">{s.label}</p>
                        <p className={`text-[10px] capitalize ${s.status === 'healthy' ? 'text-emerald-400' : 'text-slate-500'}`}>{s.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── USERS TAB ─── */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">User Management</h2>
                  <p className="text-slate-400 text-sm">{users.length} registered accounts</p>
                </div>
              </div>

              <div className="bg-[#0A0C14] border border-white/8 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">All Registered Users</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-slate-600 font-bold border-b border-white/5">
                        <th className="px-6 py-3">User</th>
                        <th className="px-6 py-3">Email</th>
                        <th className="px-6 py-3 text-center">Items</th>
                        <th className="px-6 py-3">Joined</th>
                        <th className="px-6 py-3">Last Login</th>
                        <th className="px-6 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/3">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-white/2 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center text-white font-black text-xs uppercase shadow-lg shadow-cyan-500/20 shrink-0">
                                {u.firstName?.[0] || u.email[0]}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-200">
                                  {u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : 'No Name'}
                                </p>
                                {u.email === ADMIN_EMAIL && (
                                  <span className="inline-flex items-center gap-1 text-[9px] uppercase font-black text-fuchsia-400 bg-fuchsia-400/10 px-1.5 py-0.5 rounded-full border border-fuchsia-400/20">
                                    <Crown className="w-2.5 h-2.5" /> Admin
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{u.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-xs font-bold border border-cyan-500/15">
                              {u.itemCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                            {new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                            {u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/15">
                              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Active
                            </span>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-600">
                            No users found. Run fetchAdminData.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── UI CONTROLS TAB ─── */}
          {activeTab === 'ui-controls' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">UI Component Controls</h2>
                <p className="text-slate-400 text-sm">Toggle every UI component on/off across the app. Changes persist in browser storage.</p>
              </div>

              {[
                {
                  group: 'Core Layout Components',
                  icon: <Layout className="w-4 h-4 text-cyan-400" />,
                  controls: [
                    { key: 'showMetricsBar' as const, label: 'Metrics Bar', desc: 'Top stats bar showing Total, Must Learn, Reels, PDFs, Favorites count' },
                    { key: 'showQuickAddBar' as const, label: 'Quick Add Bar', desc: 'The hero URL input bar at the top of the vault feed' },
                    { key: 'showFooter' as const, label: 'Footer', desc: 'Bottom footer shown on desktop only' },
                    { key: 'showSearchBar' as const, label: 'Search Bar', desc: 'Search/Filter input in the header' },
                  ]
                },
                {
                  group: 'Features & Modules',
                  icon: <Zap className="w-4 h-4 text-fuchsia-400" />,
                  controls: [
                    { key: 'showReelsDeck' as const, label: 'Reels Deck Mode', desc: 'TikTok-style vertical swiping modal for Reels' },
                    { key: 'showCommandPalette' as const, label: 'Command Palette', desc: 'Spotlight search (Ctrl+K) for power users' },
                    { key: 'showCommunityTab' as const, label: 'Community Feature', desc: 'Community tab in navigation and share-to-community button' },
                    { key: 'showPriorityScore' as const, label: 'Priority Score Engine', desc: 'Shows calculated priority scores on all content cards' },
                  ]
                },
                {
                  group: 'Access & Platform Settings',
                  icon: <Settings className="w-4 h-4 text-indigo-400" />,
                  controls: [
                    { key: 'allowUserSignup' as const, label: 'User Signup', desc: 'Allow new users to create accounts on /auth/signup' },
                    { key: 'darkModeForced' as const, label: 'Force Dark Mode', desc: 'Lock the app to dark theme regardless of system preference' },
                    { key: 'showWelcomeBanner' as const, label: 'Welcome Banner', desc: 'Show welcome/onboarding banner for new users' },
                    { key: 'maintenanceMode' as const, label: 'Maintenance Mode', desc: 'Show maintenance page to all non-admin users' },
                  ]
                }
              ].map((group) => (
                <div key={group.group} className="bg-[#0A0C14] border border-white/8 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                    {group.icon}
                    <h3 className="text-sm font-bold text-white">{group.group}</h3>
                  </div>
                  <div className="divide-y divide-white/5">
                    {group.controls.map((ctrl) => {
                      const isOn = uiFlags[ctrl.key];
                      return (
                        <div key={ctrl.key} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-white/2 transition-colors">
                          <div>
                            <p className="text-sm font-semibold text-slate-200">{ctrl.label}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{ctrl.desc}</p>
                          </div>
                          <button
                            onClick={() => toggleUiFlag(ctrl.key)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                              isOn
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25'
                                : 'bg-white/5 text-slate-500 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {isOn ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            {isOn ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  <strong>Note:</strong> UI flags are currently stored in browser localStorage. For production-level enforcement across all users, integrate these flags into a Supabase config table and fetch them server-side.
                </p>
              </div>
            </div>
          )}

          {/* ─── COMMUNITY TAB ─── */}
          {activeTab === 'community' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Community Moderation</h2>
                  <p className="text-slate-400 text-sm">{communityItems.length} posts are currently public in the community.</p>
                </div>
              </div>

              <div className="bg-[#0A0C14] border border-white/8 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Public Community Posts</h3>
                </div>
                {communityItems.length === 0 ? (
                  <div className="px-6 py-16 text-center">
                    <Globe className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-600 text-sm">No public community posts yet.</p>
                    <p className="text-slate-700 text-xs mt-1">Users can share posts via the Media Preview modal.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {communityItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/2 transition-colors">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt={item.title} className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                            <Globe className="w-5 h-5 text-slate-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-200 truncate">{item.title}</p>
                          <p className="text-xs text-slate-500">{item.platform} · {new Date(item.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/15">
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Public
                          </span>
                          <button
                            onClick={() => handleRemoveFromCommunity(item.id)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15 transition-colors"
                            title="Remove from Community"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── CONTENT TAB ─── */}
          {activeTab === 'content' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">All Content Items</h2>
                  <p className="text-slate-400 text-sm">
                    {allItems.length} items across all users. Admin can add/remove any post from Community.
                  </p>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search posts..."
                    value={contentSearch}
                    onChange={e => setContentSearch(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 w-full sm:w-64"
                  />
                </div>
              </div>

              {/* Mini KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Reels', value: stats?.totalReels ?? 0, color: 'text-fuchsia-400' },
                  { label: 'Articles', value: stats?.totalArticles ?? 0, color: 'text-cyan-400' },
                  { label: 'Documents', value: stats?.totalDocs ?? 0, color: 'text-indigo-400' },
                  { label: 'In Community', value: stats?.publicItems ?? 0, color: 'text-emerald-400' },
                ].map(s => (
                  <div key={s.label} className="bg-[#0A0C14] border border-white/8 rounded-xl p-4 text-center">
                    <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Full posts table */}
              <div className="bg-[#0A0C14] border border-white/8 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">All Posts</h3>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {allItems.filter(i => !contentSearch || i.title?.toLowerCase().includes(contentSearch.toLowerCase()) || i.platform?.toLowerCase().includes(contentSearch.toLowerCase())).length} results
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left min-w-[700px]">
                    <thead className="sticky top-0 bg-[#0A0C14]">
                      <tr className="text-[10px] uppercase tracking-widest text-slate-600 font-bold border-b border-white/5">
                        <th className="px-6 py-3">Post</th>
                        <th className="px-6 py-3">Platform</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3 text-center">Accesses</th>
                        <th className="px-6 py-3 text-center">Community</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/3">
                      {allItems
                        .filter(i => !contentSearch ||
                          i.title?.toLowerCase().includes(contentSearch.toLowerCase()) ||
                          i.platform?.toLowerCase().includes(contentSearch.toLowerCase())
                        )
                        .map(item => (
                          <tr key={item.id} className="hover:bg-white/2 transition-colors group">
                            <td className="px-6 py-3 max-w-[280px]">
                              <div className="flex items-center gap-3">
                                {item.thumbnail_url ? (
                                  <img src={item.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-white/10" />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                    <Globe className="w-4 h-4 text-slate-600" />
                                  </div>
                                )}
                                <p className="text-xs font-medium text-slate-300 truncate">{item.title || 'Untitled'}</p>
                              </div>
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap">
                              <span className="text-xs text-slate-400">{item.platform}</span>
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                item.media_type === 'REEL' ? 'bg-fuchsia-500/15 text-fuchsia-400' :
                                item.media_type === 'DOCUMENT' ? 'bg-indigo-500/15 text-indigo-400' :
                                'bg-cyan-500/15 text-cyan-400'
                              }`}>
                                {item.media_type}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-center">
                              <span className="text-xs font-mono text-slate-400">{item.access_count ?? 0}</span>
                            </td>
                            <td className="px-6 py-3 text-center">
                              <button
                                onClick={() => toggleCommunityByAdmin(item.id, item.is_public)}
                                disabled={togglingId === item.id}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                  item.is_public
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/20'
                                    : 'bg-white/5 text-slate-500 border-white/10 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-500/20'
                                }`}
                                title={item.is_public ? 'Remove from Community' : 'Add to Community'}
                              >
                                {togglingId === item.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : item.is_public ? (
                                  <><Globe className="w-3 h-3" /> Public</>
                                ) : (
                                  <><Globe className="w-3 h-3" /> Add</>
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      {allItems.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-600 text-sm">
                            No items found. Refresh data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}


          {/* ─── SYSTEM TAB ─── */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">System Configuration</h2>
                <p className="text-slate-400 text-sm">Platform environment and admin-level operations.</p>
              </div>

              {/* Environment Info */}
              <div className="bg-[#0A0C14] border border-white/8 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" /> Environment
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'App Name', value: 'Keeva' },
                    { label: 'Version', value: 'v2.0.0' },
                    { label: 'Environment', value: 'Production' },
                    { label: 'Database', value: 'Supabase PostgreSQL 17' },
                    { label: 'Auth Provider', value: 'Supabase Auth' },
                    { label: 'Hosting', value: 'Vercel (Edge Network)' },
                    { label: 'Admin Email', value: ADMIN_EMAIL },
                    { label: 'Framework', value: 'Next.js 15 App Router' },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/3 border border-white/5">
                      <span className="text-xs text-slate-500">{row.label}</span>
                      <span className="text-xs font-mono text-slate-300">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-[#0A0C14] border border-red-500/15 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-red-500/10 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <h3 className="text-sm font-bold text-red-400">Danger Zone</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">Toggle Maintenance Mode</p>
                      <p className="text-xs text-slate-500 mt-0.5">Shows maintenance screen to all non-admin visitors</p>
                    </div>
                    <button
                      onClick={() => toggleUiFlag('maintenanceMode')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                        uiFlags.maintenanceMode
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-white/5 text-slate-400 border-white/10'
                      }`}
                    >
                      {uiFlags.maintenanceMode ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {uiFlags.maintenanceMode ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">Reset All UI Flags</p>
                      <p className="text-xs text-slate-500 mt-0.5">Restore all UI component toggles to their default state</p>
                    </div>
                    <button
                      onClick={() => {
                        localStorage.removeItem('keevo_admin_ui_flags');
                        setUiFlags(DEFAULT_UI_FLAGS);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-slate-300 border border-white/10 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/20 transition-all shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Reset Flags
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
