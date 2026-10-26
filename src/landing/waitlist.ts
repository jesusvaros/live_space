import { createClient } from '@supabase/supabase-js';

// The public site only writes to `waitlist_signups` (insert-only for anon,
// no read policy), so it gets its own tiny client instead of the app's.

const env = (import.meta as any).env || {};
const supabaseUrl: string = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey: string = env.VITE_SUPABASE_ANON_KEY || '';

const client = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const ANDROID_URL: string = env.VITE_ANDROID_URL || '';
export const IOS_URL: string = env.VITE_IOS_URL || '';
export const HAS_STORE_LINKS = Boolean(ANDROID_URL || IOS_URL);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const isValidEmail = (value: string) => value.length <= 254 && EMAIL_RE.test(value);

export type JoinResult = 'joined' | 'invalid' | 'error';

export const joinWaitlist = async (rawEmail: string, source: string): Promise<JoinResult> => {
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmail(email)) return 'invalid';
  if (!client) return 'error';
  const { error } = await client.from('waitlist_signups').insert({ email, source: source.slice(0, 64) });
  // Already on the list counts as joined: the visitor's goal is met.
  if (!error || error.code === '23505') return 'joined';
  return 'error';
};
