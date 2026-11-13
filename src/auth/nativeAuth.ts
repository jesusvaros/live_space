import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { createNativeSignIn } from '@jesusvaros/app-kit/auth';
import { createSupabaseAuth, type CallbackResult, type SignInOutcome } from '@jesusvaros/app-kit/auth/supabase';
import { supabase } from '../lib/supabase';

// Login with Google / Apple through the shared kit (github.com/jesusvaros/app-kit,
// pinned by tag in package.json): native sheet in the app (Google on Android
// and iOS, Apple on iOS), the in-app browser as plan B, a full redirect on the web.
//
// Auth redirects for the Android/iOS app. Supabase sends the user back to
// this custom scheme after the browser sign-in, email confirmation or a
// password reset; the app catches it (appUrlOpen) and stores the session.
// The scheme is declared in AndroidManifest.xml and Info.plist and must be
// listed in Supabase → Auth → URL Configuration → Redirect URLs.
export const AUTH_CALLBACK_URL = 'com.livespace.app://auth/callback';

export type OAuthProvider = 'google' | 'apple';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const isNative = () => Capacitor.isNativePlatform();

const auth = createSupabaseAuth({
  supabase,
  url: env.VITE_SUPABASE_URL || '',
  publishableKey: env.VITE_SUPABASE_ANON_KEY || '',
  native: createNativeSignIn({
    google: { webClientId: env.VITE_GOOGLE_WEB_CLIENT_ID, iosClientId: env.VITE_GOOGLE_IOS_CLIENT_ID },
    apple: { enabled: true, bundleId: 'com.livespace.app' },
  }),
  appCallbackUrl: AUTH_CALLBACK_URL,
  openInAppBrowser: url => Browser.open({ url, presentationStyle: 'popover' }),
});

// Where Supabase should send the user back to after an emailed link.
export const authRedirectUrl = (webPath: string) =>
  isNative() ? AUTH_CALLBACK_URL : `${window.location.origin}${webPath}`;

export const signInWithProvider = async (
  provider: OAuthProvider,
  webReturnPath = '/welcome',
): Promise<{ error: Error | null; outcome: SignInOutcome | null }> => {
  try {
    const outcome = await auth.signIn(provider, { returnPath: webReturnPath });
    return { error: null, outcome };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)), outcome: null };
  }
};

export type AuthCallbackResult = CallbackResult;

// Handles com.livespace.app://auth/callback (browser sign-in, email
// confirmation, password reset) and closes the in-app browser.
export const handleAuthCallbackUrl = async (rawUrl: string): Promise<AuthCallbackResult> => {
  if (!rawUrl.startsWith(AUTH_CALLBACK_URL)) return { kind: 'ignored' };
  if (isNative()) Browser.close().catch(() => undefined);
  return auth.handleCallbackUrl(rawUrl);
};

// Providers switched on in Supabase that work on this device: the login only
// shows the buttons that can work.
export const fetchEnabledProviders = (): Promise<Record<OAuthProvider, boolean>> => auth.availableProviders();
