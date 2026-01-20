import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { AuthError, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, AuthState, ManagedEntity } from '../lib/types';
import { managementService } from '../services/management.service';

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
  managedEntities: ManagedEntity[];
  activeEntity: ManagedEntity | null;
  isManagementMode: boolean;
  setManagementMode: (enabled: boolean) => void;
  setActiveEntity: (entity: ManagedEntity | null) => void;
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
  
  const [managedEntities, setManagedEntities] = useState<ManagedEntity[]>([]);
  const [activeEntity, setActiveEntity] = useState<ManagedEntity | null>(null);
  const [isManagementMode, setIsManagementMode] = useState(false);
  
  const isDev = Boolean((import.meta as any).env?.DEV);
  const profileUserIdRef = useRef<string | null>(null);
  const loadingProfileRef = useRef<string | null>(null);
  const lastLoadedEntitiesUserRef = useRef<string>('');
  const loadingEntitiesRef = useRef<string | null>(null);

    const loadProfile = async (userId: string, userRecord: User, mounted: boolean) => {
      if (!mounted) return;
      
      // Skip if already loaded OR currently loading for this user
      if (profileUserIdRef.current === userId && authState.profile && !authState.loading) return;
      if (loadingProfileRef.current === userId) return;
      
      loadingProfileRef.current = userId;
      setAuthState(prev => ({ ...prev, user: userRecord, loading: true }));

      try {
        // Use the view v_subject_users to get profile + subject_id
        const { data: profile, error } = await supabase
          .from('v_subject_users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (!mounted || loadingProfileRef.current !== userId) return;

        let finalProfile = profile;
        if (!profile && !error) {
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

          if (createdProfile) {
            // Ensure subject exists for the new user
            const { data: subjectId } = await supabase
              .rpc('get_or_create_user_subject', { p_profile_id: userId });
            
            finalProfile = { ...createdProfile, subject_id: subjectId };
          }
        }

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
    let mounted = true;
    const loadManagedEntities = async () => {
      const userId = authState.user?.id;
      if (userId) {
        if (lastLoadedEntitiesUserRef.current === userId || loadingEntitiesRef.current === userId) return;
        loadingEntitiesRef.current = userId;

        try {
          const entities = await managementService.getManagedEntities(userId);
          if (mounted && authState.user?.id === userId) {
            setManagedEntities(entities);
            lastLoadedEntitiesUserRef.current = userId;
          }
        } catch (err) {
          console.error('[auth] failed to load managed entities', err);
        } finally {
          if (loadingEntitiesRef.current === userId) {
            loadingEntitiesRef.current = null;
          }
        }
      } else if (mounted) {
        setManagedEntities([]);
        setActiveEntity(null);
        setIsManagementMode(false);
        lastLoadedEntitiesUserRef.current = '';
        loadingEntitiesRef.current = null;
      }
    };
    loadManagedEntities();
    return () => { mounted = false; };
  }, [authState.user?.id]);

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
    managedEntities,
    activeEntity,
    isManagementMode,
    setManagementMode: setIsManagementMode,
    setActiveEntity,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
