import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { supabase } from '../lib/supabase';
import type { OAuthProvider } from './nativeAuth';

// Native Google / Apple sign-in for the Android and iOS app: the system
// account sheet (Credential Manager on Android, Google/Apple sheets on iOS)
// instead of a browser tab. The ID token it returns is handed to Supabase
// (signInWithIdToken), so accounts are the same as with the browser flow.
//
// - Google: Android and iOS. Needs VITE_GOOGLE_WEB_CLIENT_ID (both) and
//   VITE_GOOGLE_IOS_CLIENT_ID (iOS). The Android OAuth client only lives in
//   Google Cloud (package + SHA-1); its ID is never used here.
// - Apple: iOS only. On Android Apple has no native sheet: the browser flow
//   is used.
//
// Without those IDs, or if the native sheet fails for a reason other than the
// user cancelling, nativeAuth falls back to the browser flow.

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const GOOGLE_WEB_CLIENT_ID = env.VITE_GOOGLE_WEB_CLIENT_ID?.trim() || '';
const GOOGLE_IOS_CLIENT_ID = env.VITE_GOOGLE_IOS_CLIENT_ID?.trim() || '';

export type NativeSignInResult =
  | { kind: 'signed-in' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; error: Error };

export const canSignInNatively = (provider: OAuthProvider) => {
  if (!Capacitor.isNativePlatform()) return false;
  const platform = Capacitor.getPlatform();
  if (provider === 'apple') return platform === 'ios';
  if (!GOOGLE_WEB_CLIENT_ID) return false;
  return platform === 'android' || (platform === 'ios' && Boolean(GOOGLE_IOS_CLIENT_ID));
};

let initialized: Promise<void> | null = null;

const initialize = () => {
  if (!initialized) {
    initialized = SocialLogin.initialize({
      google: GOOGLE_WEB_CLIENT_ID
        ? {
            webClientId: GOOGLE_WEB_CLIENT_ID,
            iOSClientId: GOOGLE_IOS_CLIENT_ID || undefined,
            // The ID token must be issued for the web client: it is the one
            // Supabase checks the audience against.
            iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
            mode: 'online',
          }
        : undefined,
      // On iOS the client ID only tells the plugin to set Apple up.
      apple: Capacitor.getPlatform() === 'ios' ? { clientId: 'com.livespace.app' } : undefined,
    }).catch(error => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
};

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

// Supabase's replay protection: the provider gets SHA-256(nonce) and puts it
// in the ID token; Supabase gets the raw nonce, hashes it and compares.
export const createNonce = async () => {
  const raw = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const hashed = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return { raw, hashed };
};

const isCancellation = (error: unknown) => {
  const text = `${(error as { code?: unknown })?.code ?? ''} ${(error as Error)?.message ?? error}`;
  return /cancel|1001|12501|USER_CANCELED|USER_CANCELLED/i.test(text);
};

export const signInNatively = async (provider: OAuthProvider): Promise<NativeSignInResult> => {
  try {
    await initialize();
    const nonce = await createNonce();
    const response =
      provider === 'google'
        ? await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'], nonce: nonce.hashed } })
        : await SocialLogin.login({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: nonce.hashed } });

    const result = response.result as { idToken?: string | null; profile?: { givenName?: string | null; familyName?: string | null } };
    const idToken = result?.idToken;
    if (!idToken) return { kind: 'failed', error: new Error('El inicio de sesión no devolvió identidad.') };

    const { error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce: nonce.raw });
    if (error) return { kind: 'failed', error };

    // Apple only sends the name the very first time: keep it for the profile.
    if (provider === 'apple') {
      const name = [result.profile?.givenName, result.profile?.familyName].filter(Boolean).join(' ').trim();
      if (name) await supabase.auth.updateUser({ data: { full_name: name, display_name: name } }).catch(() => undefined);
    }
    return { kind: 'signed-in' };
  } catch (error) {
    if (isCancellation(error)) return { kind: 'cancelled' };
    return { kind: 'failed', error: error instanceof Error ? error : new Error(String(error)) };
  }
};
