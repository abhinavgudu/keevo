'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Database, ShieldAlert, Loader2, ArrowLeft, MoreVertical, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  lastSignIn: string;
  itemCount: number;
}

export default function AdminDashboard() {
  const { user, isLoading: authLoading, session } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Security Guard
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/auth/signin');
      }
    }
  }, [user, authLoading, router]);

  // Fetch Admin Data
  useEffect(() => {
    async function fetchAdminData() {
      if (!session?.access_token || !user) return;
      
      try {
        const res = await fetch('/api/admin/users', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Failed to fetch admin data');
        
        setUsers(data.users || []);
        setTotalItems(data.totalItems || 0);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      fetchAdminData();
    }
  }, [session, user]);

  if (authLoading || (user?.email === 'miabhisu@gmail.com' && loading)) {
    return (
      <div className="min-h-screen bg-[#07090E] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // Removed double check
  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-200 p-4 sm:p-8 relative overflow-hidden">
      {/* Background glow */}
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 rounded-xl bg-slate-900/50 hover:bg-slate-800 border border-slate-800/50 transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-6 h-6 text-fuchsia-500" />
                Admin Command Center
              </h1>
              <p className="text-sm text-slate-400">Manage Keevo system data and users</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
            {error}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-400">Total Users</h3>
            </div>
            <p className="text-3xl font-bold text-white">{users.length}</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                <Database className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-400">Total Content Items</h3>
            </div>
            <p className="text-3xl font-bold text-white">{totalItems}</p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl backdrop-blur-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Registered Users</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/40 text-xs uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-800/50">
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4 text-center">Items Saved</th>
                  <th className="px-6 py-4">Joined At</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs uppercase shadow-lg shadow-cyan-500/20">
                          {u.firstName?.[0] || u.email[0]}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-200">
                            {u.firstName || u.lastName ? `${u.firstName} ${u.lastName}` : 'No Name'}
                          </div>
                          {/* Admin badge removed for simplicity or could check role */}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {u.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-cyan-400">
                      {u.itemCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button className="p-2 hover:bg-slate-700/50 rounded-lg text-slate-500 transition-colors" title="Delete (Coming soon)">
                        <Trash2 className="w-4 h-4 hover:text-red-400 transition-colors" />
                      </button>
                    </td>
                  </tr>
                ))}
                
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
