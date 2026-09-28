'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { setVaultUserId } from '@/lib/storage';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  supabase: ReturnType<typeof getSupabaseClient>;
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, firstName?: string, lastName?: string) => Promise<{ error: string | null; needsConfirm?: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => getSupabaseClient());
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    // Initial session check
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setVaultUserId(data.session?.user?.id ?? null);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, sess: Session | null) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setVaultUserId(sess?.user?.id ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, [supabase]);

  const signUpWithEmail = useCallback(async (email: string, password: string, firstName?: string, lastName?: string) => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
        data: {
          first_name: firstName,
          last_name: lastName,
        }
      },
    });
    if (error) return { error: error.message };
    const needsConfirm = !data.session && !!data.user;
    return { error: null, needsConfirm };
  }, [supabase]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { error: 'Supabase not configured' };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
      },
    });
    return { error: error?.message ?? null };
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    // Drop this device's push subscription BEFORE the session goes away.
    //
    // A push subscription is bound to a browser, not to a login, so leaving it
    // behind would keep delivering the previous account's notifications to
    // whoever signs in on this device next. The session is still valid at this
    // point, which is the only moment the server will accept the unsubscribe.
    // Failures are swallowed: signing out must never be blocked by this.
    const token = session?.access_token;
    if (token && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        const sub = await reg?.pushManager.getSubscription().catch(() => null);
        if (sub) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => undefined);
          await sub.unsubscribe().catch(() => undefined);
        }
      } catch {
        // Ignored on purpose — see above.
      }
    }
    await supabase.auth.signOut();
  }, [supabase, session?.access_token]);

  return (
    <AuthContext.Provider value={{ user, session, supabase, isLoading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
