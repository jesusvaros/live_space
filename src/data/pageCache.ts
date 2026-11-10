import {
  PERSIST_MAX_AGE,
  getPersistViewer,
  readPersisted,
  removePersistedByPrefix,
  writePersisted,
} from '../lib/persistentCache';

// Copy of what detail screens already loaded, so opening a concert, artist or
// venue seen before (or listed on the previous screen) paints at once and
// refreshes behind. In memory for the session; the detail snapshots below are
// also kept across restarts (persistentCache), so a concert, artist or venue
// opened yesterday paints at once today too.
const entries = new Map<string, unknown>();

// Plenty for a session; keeps memory flat when someone scrolls a whole city.
const MAX_ENTRIES = 600;

type PersistPolicy = {
  maxAgeMs: number;
  /**
   * The snapshot lists other people's posts, which depend on who is looking
   * (blocks hide them both ways): stored per viewer.
   */
  perViewer: boolean;
};

const PERSIST_POLICIES: Array<[prefix: string, policy: PersistPolicy]> = [
  ['event:', { maxAgeMs: PERSIST_MAX_AGE.detail, perViewer: false }],
  ['artist:', { maxAgeMs: PERSIST_MAX_AGE.detail, perViewer: true }],
  ['venue:', { maxAgeMs: PERSIST_MAX_AGE.detail, perViewer: true }],
  ['past:', { maxAgeMs: PERSIST_MAX_AGE.detail, perViewer: true }],
];

const policyOf = (key: string) => PERSIST_POLICIES.find(([prefix]) => key.startsWith(prefix))?.[1];

const persistKey = (key: string) => `page:${key}`;

const remember = (key: string, value: unknown) => {
  entries.delete(key);
  entries.set(key, value);
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
};

export const readCache = <T>(key: string): T | undefined => {
  if (entries.has(key)) return entries.get(key) as T | undefined;
  const policy = policyOf(key);
  if (!policy) return undefined;
  const hit = readPersisted<T>(persistKey(key), {
    maxAgeMs: policy.maxAgeMs,
    userId: policy.perViewer ? getPersistViewer() : undefined,
  });
  if (!hit) return undefined;
  remember(key, hit.value);
  return hit.value;
};

/**
 * `persist: false` keeps it in memory only: list screens prime every card
 * they show, which would fill the persistent cache with duplicates of the
 * lists it already keeps.
 */
export const writeCache = <T>(key: string, value: T, options: { persist?: boolean } = {}) => {
  remember(key, value);
  if (options.persist === false) return;
  const policy = policyOf(key);
  if (!policy) return;
  writePersisted(persistKey(key), value, { userId: policy.perViewer ? getPersistViewer() : undefined });
};

/** Cards from a list restored from the persistent cache: open instantly again. */
export const primeCache = <T extends { id: string }>(items: readonly T[], keyOf: (id: string) => string) => {
  for (const item of items) {
    const key = keyOf(item.id);
    if (!entries.has(key)) remember(key, item);
  }
};

/**
 * After blocking or unblocking: the saved artist, venue and past-concert
 * snapshots list posts from before the change. Dropped so no screen paints
 * them again; the next visit loads them fresh.
 */
export const forgetViewerSnapshots = () => {
  for (const key of Array.from(entries.keys())) {
    if (policyOf(key)?.perViewer) entries.delete(key);
  }
  removePersistedByPrefix('page:', { userId: getPersistViewer() });
};

export const eventCacheKey = (id: string) => `event:${id}`;
export const artistCacheKey = (id: string) => `artist:${id}`;
export const venueCacheKey = (id: string) => `venue:${id}`;
