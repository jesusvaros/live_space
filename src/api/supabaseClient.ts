import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const isDev = Boolean(env.DEV);
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const debugFetch: typeof fetch = async (...args) => {
  if (isDev) {
    const input = args[0];
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    console.info('[supabase] request', url);
  }
  return fetch(...args);
};

const noLock = async (_name: string, _timeout: number, fn: () => Promise<any>) => fn();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: isDev ? debugFetch : fetch,
  },
  auth: {
    lock: noLock,
  },
});

export const supabaseConfig = {
  isConfigured: isSupabaseConfigured,
};

export const getSupabaseErrorMessage = (error: unknown, fallback = 'Unexpected error') => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof (error as { message?: string }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
};

if (isDev) {
  let host = 'missing';
  if (supabaseUrl) {
    try {
      host = new URL(supabaseUrl).host;
    } catch {
      host = 'invalid-url';
    }
  }

  const keyHint = supabaseAnonKey
    ? `${supabaseAnonKey.slice(0, 6)}...${supabaseAnonKey.slice(-4)}`
    : 'missing';

  console.info('[supabase] config', {
    host,
    key: keyHint,
    isConfigured: isSupabaseConfigured,
  });
}

if (isDev) {
  (window as any).supabase = supabase;
}
