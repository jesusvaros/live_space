import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '../config/env.js';

const timeoutFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.scraperTimeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

let client: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient => {
  if (client) {
    return client;
  }

  client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: timeoutFetch,
    },
  });

  return client;
};
