import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, AuthState } from '../lib/types';

interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
    data: {
      username?: string;
      displayName?: string;
      primaryCity?: string;
    }
  ) => Promise<{ error: AuthError | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: AuthError | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  });
  const isDev = Boolean((import.meta as any).env?.DEV);

  useEffect(() => {
    const loadProfile = async (userId: string, userRecord: AuthState['user']) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!profile && userRecord) {
        const metadata = userRecord.user_metadata ?? {};
        const { data: createdProfile } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            username: metadata.username ?? null,
            display_name: metadata.display_name ?? metadata.displayName ?? null,
            primary_city: metadata.primary_city ?? metadata.primaryCity ?? null,
          })
          .select('*')
          .single();

        setAuthState(prev => ({
          ...prev,
          user: userRecord,
          profile: createdProfile ?? null,
          loading: false,
        }));
        return;
      }

      setAuthState(prev => ({
        ...prev,
        user: userRecord,
        profile: profile ?? null,
        loading: false,
      }));
    };

    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setAuthState({
          user: session.user,
          profile: null,
          loading: false,
        });
        await loadProfile(session.user.id, session.user);
      } else {
        setAuthState({
          user: null,
          profile: null,
          loading: false,
        });
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setAuthState({
            user: session.user,
            profile: null,
            loading: false,
          });
          await loadProfile(session.user.id, session.user);
        } else {
          setAuthState({
            user: null,
            profile: null,
            loading: false,
          });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
    data: {
      username?: string;
      displayName?: string;
      primaryCity?: string;
    }
  ) => {
    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          username: data.username || null,
          display_name: data.displayName || null,
          primary_city: data.primaryCity || null,
        }
      }
    });
    return { error };
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  };

  const signOut = async () => {
    if (isDev) {
      console.info('[auth] signOut');
    }
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    } finally {
      setAuthState({
        user: null,
        profile: null,
        loading: false,
      });
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!authState.user) {
      if (isDev) {
        console.warn('[auth] updateProfile skipped: no user');
      }
      return { error: { message: 'No user logged in' } as AuthError };
    }

    if (isDev) {
      console.info('[auth] updateProfile', { id: authState.user.id, updates });
    }

    const { role: requestedRole, ...safeUpdates } = updates;
    const payload = {
      id: authState.user.id,
      ...safeUpdates,
    };
    if (isDev && requestedRole) {
      (payload as Partial<Profile>).role = requestedRole;
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();

    if (isDev) {
      console.info('[auth] updateProfile result', { error: error?.message || null });
    }

    if (!error) {
      setAuthState(prev => ({
        ...prev,
        profile: data ?? (prev.profile ? { ...prev.profile, ...safeUpdates } : null),
      }));
    }

    return { error: error as AuthError | null };
  };

  const refreshProfile = async () => {
    if (!authState.user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authState.user.id)
      .single();

    setAuthState(prev => ({
      ...prev,
      profile: profile ?? null,
    }));
  };

  const value: AuthContextType = {
    ...authState,
    signIn,
    signUp,
    sendPasswordReset,
    updatePassword,
    signOut,
    updateProfile,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
