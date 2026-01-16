import { createClient } from '@supabase/supabase-js'

const env = (import.meta as any).env || {}
const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const isDev = Boolean(env.DEV)
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

const debugFetch: typeof fetch = async (...args) => {
  if (isDev) {
    const url = typeof args[0] === 'string' ? args[0] : args[0].url
    console.info('[supabase] request', url)
  }
  return fetch(...args)
}

const noLock = async (_name: string, _timeout: number, fn: () => Promise<any>) => fn()

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: isDev ? debugFetch : fetch,
  },
  auth: isDev
    ? {
        lock: noLock,
      }
    : undefined,
})

export const supabaseConfig = {
  isConfigured: isSupabaseConfigured,
}

if (isDev) {
  let host = 'missing'
  if (supabaseUrl) {
    try {
      host = new URL(supabaseUrl).host
    } catch {
      host = 'invalid-url'
    }
  }

  const keyHint = supabaseAnonKey
    ? `${supabaseAnonKey.slice(0, 6)}...${supabaseAnonKey.slice(-4)}`
    : 'missing'

  console.info('[supabase] config', {
    host,
    key: keyHint,
    isConfigured: isSupabaseConfigured,
  })
}

if (isDev) {
  ;(window as any).supabase = supabase
}
