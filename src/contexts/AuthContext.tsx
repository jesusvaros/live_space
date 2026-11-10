import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { authRedirectUrl } from '../auth/nativeAuth';
import { AuthError, User } from '@supabase/supabase-js';
import { supabase } from '../api';
import { Profile, AuthState } from '../lib/types';
import { cached, setCached } from '../lib/requestCache';
import { useAuthStore, useWorkspaceStore } from '../store/appStore';
import { mapProfile } from '../data/canonicalMappers';
import { readStoredSessionUser } from '../app/bootCache';
import { clearUserPersisted, readPersisted, setPersistViewer, writePersisted } from '../lib/persistentCache';

// The signed-in person's profile is kept across restarts (per user), so the
// app opens straight into their account instead of waiting for two requests.
const PROFILE_CACHE_KEY = 'auth:profile';
const PROFILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const readCachedProfile = (userId: string) =>
  readPersisted<Profile>(PROFILE_CACHE_KEY, { userId, maxAgeMs: PROFILE_MAX_AGE_MS })?.value ?? null;

const saveProfile = (userId: string, profile: Profile | null) => {
  if (profile) writePersisted(PROFILE_CACHE_KEY, profile, { userId });
};

// Signed out (or the session is gone): nothing of theirs stays on the device.
const forgetSignedInData = () => {
  setPersistViewer(null);
  void clearUserPersisted();
};

// A stored session plus its saved profile: render signed in right away;
// supabase-js confirms the session (or signs out) a moment later.
const initialAuthState = (): { state: AuthState; userId: string | null } => {
  const storedUser = typeof window === 'undefined' ? null : readStoredSessionUser();
  const profile = storedUser ? readCachedProfile(storedUser.id) : null;
  if (storedUser && profile) {
    return { state: { user: storedUser, profile, loading: false }, userId: storedUser.id };
  }
  return { state: { user: null, profile: null, loading: true }, userId: null };
};

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
  const { setUserId } = useAuthStore();
  const { resetWorkspace } = useWorkspaceStore();
  const [initial] = useState(initialAuthState);
  const [authState, setAuthState] = useState<AuthState>(initial.state);

  // Whose profile is on screen (possibly the saved copy).
  const profileUserIdRef = useRef<string | null>(initial.userId);
  const loadingProfileRef = useRef<string | null>(null);

    const loadProfile = async (userId: string, userRecord: User, mounted: boolean) => {
      if (!mounted) return;

      if (loadingProfileRef.current === userId) return;

      // Their profile is already on screen (the saved copy, or a token
      // refresh): refresh it behind instead of going back to a spinner.
      const background = profileUserIdRef.current === userId;
      loadingProfileRef.current = userId;
      setUserId(userId);
      setPersistViewer(userId);
      setAuthState(prev => (background ? { ...prev, user: userRecord } : { ...prev, user: userRecord, loading: true }));

      // The subject only needs the user id: look it up alongside the
      // profile. Creating it (first sign-in) waits for the profile row.
      let markProfileReady: () => void = () => undefined;
      const profileReady = new Promise<void>(resolve => {
        markProfileReady = resolve;
      });
      const subjectKey = `subject:user:${userId}`;
      const subjectRequest = cached(subjectKey, async () => {
        const { data, error } = await supabase
          .from('subjects')
          .select('id')
          .eq('type', 'user')
          .eq('profile_id', userId)
          .maybeSingle();
        if (error) throw error;
        if (data?.id) return data.id as string;

        await profileReady;
        const { data: createdId, error: createError } = await supabase
          .rpc('get_or_create_user_subject', { p_profile_id: userId });
        if (createError) throw createError;
        return createdId as unknown as string;
      }, { ttlMs: 24 * 60 * 60 * 1000 });
      subjectRequest.catch(() => undefined);

      try {
        // Load the profile row directly and keep subjects aligned
        const profileKey = `profiles:${userId}`;
        const ensureProfileRow = async () => {
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
          if (profileRow || !mounted || loadingProfileRef.current !== userId) return profileRow;

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
          setCached(profileKey, createdProfile, { ttlMs: 30_000 });
          return createdProfile as any;
        };

        const finalProfileData = await ensureProfileRow().finally(markProfileReady);
        if (!mounted || loadingProfileRef.current !== userId) return;

        const subjectId = await subjectRequest;

        if (!mounted || loadingProfileRef.current !== userId) return;

        const finalProfile = finalProfileData ? mapProfile(finalProfileData, subjectId) : null;
        saveProfile(userId, finalProfile ?? null);

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
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (mounted) {
          if (session?.user) {
            await loadProfile(session.user.id, session.user, mounted);
          } else if (sessionError && profileUserIdRef.current) {
            // The token could not be refreshed (offline): keep the saved
            // account on screen. supabase-js keeps the session and retries;
            // a real sign-out arrives as SIGNED_OUT.
          } else {
            profileUserIdRef.current = null;
            forgetSignedInData();
            setUserId(null);
            resetWorkspace();
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
              forgetSignedInData();
              setUserId(null);
              resetWorkspace();
              setAuthState({
                user: null,
                profile: null,
                loading: false,
              });
            }
          }
        );
        authListener = data;
      } catch (error) {
        console.error('[auth] failed to initialize auth', error);
        if (mounted) {
          loadingProfileRef.current = null;
          profileUserIdRef.current = null;
          setUserId(null);
          resetWorkspace();
          setAuthState({
            user: null,
            profile: null,
            loading: false,
          });
        }
      }
    };

    initAuth().catch(error => {
      console.error('[auth] unexpected initAuth error', error);
      if (mounted) {
        setAuthState(prev => ({ ...prev, loading: false }));
      }
    });

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
    window.addEventListener('pageshow', handleResume);
    document.addEventListener('visibilitychange', handleResume);
    document.addEventListener('resume', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('pageshow', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
      document.removeEventListener('resume', handleResume);
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
        emailRedirectTo: authRedirectUrl('/welcome'),
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
      redirectTo: authRedirectUrl('/reset'),
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
      forgetSignedInData();
      setUserId(null);
      resetWorkspace();
      setAuthState({
        user: null,
        profile: null,
        loading: false,
      });
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!authState.user) {
      return { error: { message: 'No has iniciado sesión' } as AuthError };
    }

    const {
      role: _role,
      is_verified: _isVerified,
      subject_id: _subjectId,
      id: _id,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...safeUpdates
    } = updates;
    const payload = {
      id: authState.user.id,
      ...safeUpdates,
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();

    if (!error && data) {
      const next = mapProfile(data, authState.profile?.subject_id);
      saveProfile(authState.user.id, next);
      setAuthState(prev => ({ ...prev, profile: next }));
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
      const next = mapProfile(profile, authState.profile?.subject_id);
      saveProfile(authState.user.id, next);
      setAuthState(prev => ({ ...prev, profile: next }));
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
