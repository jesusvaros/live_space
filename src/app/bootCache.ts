import type { User } from '@supabase/supabase-js';
import {
  bootPersistentCache,
  configurePersistentCache,
  flushPersistentCache,
  persistentCacheStats,
  setPersistViewer,
} from '../lib/persistentCache';
import { indexedDbCacheAdapter } from '../lib/persistentCacheIdb';
import { logPerf } from '../lib/perfTiming';

// How long the first paint may wait for IndexedDB. Usually it answers in a
// few tens of ms; when it is slower the app paints without the saved copies
// and they fill in as soon as they load.
export const BOOT_BUDGET_MS = 120;

/**
 * The signed-in user as supabase-js stored it (localStorage), read without
 * waiting for the client: lets the first render know whose saved data to
 * show. supabase-js confirms (or refreshes, or drops) the session right after.
 */
export const readStoredSessionUser = (): User | null => {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const session = JSON.parse(window.localStorage.getItem(key) || 'null');
      const user = session?.user ?? session?.currentSession?.user;
      if (user?.id && typeof user.id === 'string') return user as User;
    }
  } catch {
    // ignore
  }
  return null;
};

export const bootCache = async () => {
  const started = performance.now();
  configurePersistentCache({ adapter: indexedDbCacheAdapter });
  setPersistViewer(readStoredSessionUser()?.id ?? null);
  // Pending writes go out before the app is put away or closed.
  const flush = () => void flushPersistentCache();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  const ready = await bootPersistentCache(BOOT_BUDGET_MS);
  const stats = persistentCacheStats();
  logPerf(
    ready
      ? `cache: ${stats.entries} entries, ${Math.round(stats.bytes / 1024)} KB loaded in ${Math.round(performance.now() - started)} ms`
      : `cache: still loading after ${BOOT_BUDGET_MS} ms, painting without it`,
  );
};
