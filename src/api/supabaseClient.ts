import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const isDev = Boolean(env.DEV);
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const configuredTimeoutMs = Number(env.VITE_SUPABASE_REQUEST_TIMEOUT_MS);
const SUPABASE_REQUEST_TIMEOUT_MS =
  Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
    ? configuredTimeoutMs
    : 20_000;

const mergeAbortSignals = (externalSignal: AbortSignal | undefined, timeoutSignal: AbortSignal) => {
  if (!externalSignal) return timeoutSignal;
  if (externalSignal.aborted) return externalSignal;

  const merged = new AbortController();
  const abortMerged = () => merged.abort();

  externalSignal.addEventListener('abort', abortMerged, { once: true });
  timeoutSignal.addEventListener('abort', abortMerged, { once: true });

  return merged.signal;
};

const timeoutFetch: typeof fetch = async (input, init) => {
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  try {
    const signal = mergeAbortSignals(init?.signal, timeoutController.signal);
    return await fetch(input, { ...(init || {}), signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

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
  return timeoutFetch(...args);
};

const noLock = async (_name: string, _timeout: number, fn: () => Promise<any>) => fn();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: isDev ? debugFetch : timeoutFetch,
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
