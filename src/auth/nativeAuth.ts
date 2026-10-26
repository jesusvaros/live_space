import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '../lib/supabase';

// Auth redirects for the Android/iOS app. Supabase sends the user back to
// this custom scheme after Google/Apple sign-in, email confirmation or a
// password reset; the app catches it (appUrlOpen) and stores the session.
// The scheme is declared in AndroidManifest.xml and Info.plist and must be
// listed in Supabase → Auth → URL Configuration → Redirect URLs.
export const AUTH_CALLBACK_URL = 'com.livespace.app://auth/callback';

export type OAuthProvider = 'google' | 'apple';

const isNative = () => Capacitor.isNativePlatform();

// Where Supabase should send the user back to after an emailed link.
export const authRedirectUrl = (webPath: string) =>
  isNative() ? AUTH_CALLBACK_URL : `${window.location.origin}${webPath}`;

export const signInWithProvider = async (provider: OAuthProvider) => {
  if (!isNative()) {
    // Dev in the browser: supabase-js picks the tokens up from the URL.
    return supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/welcome` },
    });
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: AUTH_CALLBACK_URL, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { data, error };
  await Browser.open({ url: data.url, presentationStyle: 'popover' });
  return { data, error: null };
};

export type AuthCallbackResult =
  | { kind: 'signed-in' }
  | { kind: 'recovery' }
  | { kind: 'error'; message: string }
  | { kind: 'ignored' };

// Handles com.livespace.app://auth/callback#access_token=…&refresh_token=…&type=…
// (implicit flow) and …?code=… (PKCE), plus Supabase's error redirects.
export const handleAuthCallbackUrl = async (rawUrl: string): Promise<AuthCallbackResult> => {
  if (!rawUrl.startsWith(AUTH_CALLBACK_URL)) return { kind: 'ignored' };
  if (isNative()) Browser.close().catch(() => undefined);

  const url = new URL(rawUrl.replace(/^com\.livespace\.app:\/\//, 'https://callback/'));
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  url.searchParams.forEach((value, key) => params.set(key, value));

  const failure = params.get('error_description') || params.get('error');
  if (failure) return { kind: 'error', message: failure.replace(/\+/g, ' ') };

  const code = params.get('code');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : accessToken && refreshToken
      ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      : { error: new Error('El enlace no trae sesión.') };
  if (error) return { kind: 'error', message: error.message };
  return params.get('type') === 'recovery' ? { kind: 'recovery' } : { kind: 'signed-in' };
};

// Providers switched on in Supabase (Auth → Providers). The login only shows
// the buttons that can work.
export const fetchEnabledProviders = async (): Promise<Record<OAuthProvider, boolean>> => {
  const env = (import.meta as any).env || {};
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  const none = { google: false, apple: false };
  if (!url || !key) return none;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!response.ok) return none;
    const settings = await response.json();
    return { google: Boolean(settings?.external?.google), apple: Boolean(settings?.external?.apple) };
  } catch {
    return none;
  }
};
