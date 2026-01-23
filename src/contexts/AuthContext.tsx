import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { AuthError, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, AuthState } from '../lib/types';
import { cached, setCached } from '../lib/requestCache';

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
  const profileUserIdRef = useRef<string | null>(null);
  const loadingProfileRef = useRef<string | null>(null);

    const loadProfile = async (userId: string, userRecord: User, mounted: boolean) => {
      if (!mounted) return;
      
      // Skip if already loaded OR currently loading for this user
      if (profileUserIdRef.current === userId && authState.profile && !authState.loading) return;
      if (loadingProfileRef.current === userId) return;
      
      loadingProfileRef.current = userId;
      setAuthState(prev => ({ ...prev, user: userRecord, loading: true }));

      try {
        // Load the profile row directly and keep subjects aligned
        const profileKey = `profiles:${userId}`;
        const profileRow = await cached(
          profileKey,
          async () => {
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle();
            if (error) throw error;
            return data as any;
          },
          { ttlMs: 30_000 }
        );

        if (!mounted || loadingProfileRef.current !== userId) return;

        let finalProfileData = profileRow;
        if (!finalProfileData) {
          const metadata = userRecord.user_metadata ?? {};
          const { data: createdProfile, error: creationError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              username: metadata.username ?? null,
              display_name: metadata.display_name ?? metadata.displayName ?? null,
              primary_city: metadata.primary_city ?? metadata.primaryCity ?? null,
            })
            .select('*')
            .single();

          if (creationError) throw creationError;
          finalProfileData = createdProfile;
          setCached(profileKey, createdProfile, { ttlMs: 30_000 });
        }

        const subjectKey = `subject:user:${userId}`;
        const subjectId = await cached(
          subjectKey,
          async () => {
            const { data, error } = await supabase
              .rpc('get_or_create_user_subject', { p_profile_id: userId });
            if (error) throw error;
            return data as unknown as string;
          },
          { ttlMs: 24 * 60 * 60 * 1000 }
        );

        if (!mounted || loadingProfileRef.current !== userId) return;

        const finalProfile = finalProfileData
          ? { ...finalProfileData, subject_id: subjectId }
          : null;

        profileUserIdRef.current = userId;
        setAuthState({
          user: userRecord,
          profile: finalProfile ?? null,
          loading: false,
        });
      } catch (err) {
        console.error('[auth] failed to load profile', err);
        if (mounted) setAuthState(prev => ({ ...prev, loading: false }));
      } finally {
        if (loadingProfileRef.current === userId) {
          loadingProfileRef.current = null;
        }
      }
    };

  useEffect(() => {
    let mounted = true;
    let authListener: { subscription: { unsubscribe: () => void } } | null = null;

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (mounted) {
        if (session?.user) {
          await loadProfile(session.user.id, session.user, mounted);
        } else {
          setAuthState({
            user: null,
            profile: null,
            loading: false,
          });
        }
      }

      const { data } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mounted) return;

          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            if (session?.user) {
              await loadProfile(session.user.id, session.user, mounted);
            }
          } else if (event === 'SIGNED_OUT') {
            profileUserIdRef.current = null;
            setAuthState({
              user: null,
              profile: null,
              loading: false,
            });
          }
        }
      );
      authListener = data;
    };

    initAuth();

    return () => {
      mounted = false;
      if (authListener) authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState !== 'visible') return;
      refreshProfile().catch(() => undefined);
    };

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [authState.user]);

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
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    } finally {
      profileUserIdRef.current = null;
      setAuthState({
        user: null,
        profile: null,
        loading: false,
      });
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!authState.user) {
      return { error: { message: 'No user logged in' } as AuthError };
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

    if (!error && data) {
      setAuthState(prev => ({
        ...prev,
        profile: data,
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

    if (profile) {
      setAuthState(prev => ({
        ...prev,
        profile: profile,
      }));
    }
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
