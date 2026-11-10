/**
 * Stale-while-revalidate storage that survives an app restart. Selected query
 * results (lists, detail snapshots) are kept in IndexedDB and loaded into
 * memory once at startup (see bootPersistentCache), so the first render can
 * paint what was on screen last time while the request runs behind.
 *
 * - Every entry is JSON, with the time it was saved and a schema version:
 *   bump CACHE_VERSION when the shape of anything persisted changes and old
 *   entries are dropped on the next start. Entries that fail to parse are
 *   dropped when read.
 * - Readers pass a max age; older entries are ignored (and removed).
 * - Entries of a signed-in person carry their user id, live under their own
 *   key and are cleared on sign-out and account deletion.
 * - The total is capped (MAX_BYTES); the least recently used go first.
 *
 * Without IndexedDB (private mode, tests, old WebViews) the same API works in
 * memory for the life of the page.
 */

export const CACHE_VERSION = 1;

const HOUR_MS = 60 * 60 * 1000;

export const PERSIST_MAX_AGE = {
  /** Public lists (Inicio, Mapa, Explorar, festivals). */
  publicList: 24 * HOUR_MS,
  /** A concert, artist or venue page. */
  detail: 7 * 24 * HOUR_MS,
  /** A signed-in person's own lists (Voy, followed, history, profile). */
  user: 24 * HOUR_MS,
  /** The Inicio hero: «Estuviste ayer» is about the last hours. */
  hero: 6 * HOUR_MS,
} as const;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
// A single entry bigger than this is not worth evicting everything else for.
const MAX_ENTRY_SHARE = 0.4;
const FLUSH_DELAY_MS = 400;
// The viewer key of a visitor without an account (see getPersistViewer).
const ANON_VIEWER = 'anon';

export type StoredEntry = {
  key: string;
  v: number;
  savedAt: number;
  usedAt: number;
  /** User id for a signed-in person's entry; null when anyone may read it. */
  user: string | null;
  /** JSON text of the value. */
  data: string;
};

export type PersistAdapter = {
  loadAll: () => Promise<StoredEntry[]>;
  put: (entries: StoredEntry[]) => Promise<void>;
  remove: (keys: string[]) => Promise<void>;
};

export type PersistScope = {
  /** Oldest entry still worth showing. */
  maxAgeMs: number;
  /** The signed-in person the value belongs to; omit for public data. */
  userId?: string | null;
};

type MemoryEntry = StoredEntry & { size: number; parsed?: { value: unknown } };

const memoryAdapter = (): PersistAdapter => ({
  loadAll: async () => [],
  put: async () => undefined,
  remove: async () => undefined,
});

let adapter: PersistAdapter = memoryAdapter();
let adapterFactory: (() => PersistAdapter) | null = null;
let maxBytes = DEFAULT_MAX_BYTES;
let version = CACHE_VERSION;
let now = () => Date.now();

const entries = new Map<string, MemoryEntry>();
let totalBytes = 0;
const dirty = new Set<string>();
const removed = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let hydratePromise: Promise<void> | null = null;
let hydrated = false;
const hydratedListeners = new Set<() => void>();

/** Lets the app (main.tsx) plug in IndexedDB, and tests a fake. */
export const configurePersistentCache = (options: {
  adapter?: PersistAdapter | (() => PersistAdapter);
  maxBytes?: number;
  version?: number;
  now?: () => number;
}) => {
  if (options.adapter) {
    if (typeof options.adapter === 'function') {
      adapterFactory = options.adapter;
    } else {
      adapter = options.adapter;
      adapterFactory = null;
    }
  }
  if (options.maxBytes) maxBytes = options.maxBytes;
  if (options.version) version = options.version;
  if (options.now) now = options.now;
};

/** Tests: forget everything in memory (not in the adapter). */
export const resetPersistentCacheForTests = () => {
  entries.clear();
  dirty.clear();
  removed.clear();
  totalBytes = 0;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  hydratePromise = null;
  hydrated = false;
  adapter = memoryAdapter();
  adapterFactory = null;
  maxBytes = DEFAULT_MAX_BYTES;
  version = CACHE_VERSION;
  now = () => Date.now();
};

const storageKey = (key: string, userId?: string | null) => (userId ? `u:${userId}:${key}` : `p:${key}`);

const byteSize = (text: string) => text.length * 2;

const isStoredEntry = (value: unknown): value is StoredEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<StoredEntry>;
  return (
    typeof entry.key === 'string' &&
    typeof entry.data === 'string' &&
    typeof entry.savedAt === 'number' &&
    (entry.user === null || typeof entry.user === 'string')
  );
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPersistentCache();
  }, FLUSH_DELAY_MS);
};

/** Writes pending changes now (tests, and before the page hides). */
export const flushPersistentCache = async () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const toRemove = Array.from(removed);
  removed.clear();
  const toPut: StoredEntry[] = [];
  for (const key of dirty) {
    const entry = entries.get(key);
    if (!entry) continue;
    const { size: _size, parsed: _parsed, ...stored } = entry;
    toPut.push(stored);
  }
  dirty.clear();
  try {
    if (toRemove.length) await adapter.remove(toRemove);
    if (toPut.length) await adapter.put(toPut);
  } catch {
    // Storage full or gone: the memory copy still serves this session.
  }
};

const deleteEntry = (key: string) => {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  totalBytes -= entry.size;
  dirty.delete(key);
  removed.add(key);
};

const evict = () => {
  if (totalBytes <= maxBytes) return;
  const oldestFirst = Array.from(entries.values()).sort((left, right) => left.usedAt - right.usedAt);
  for (const entry of oldestFirst) {
    if (totalBytes <= maxBytes) break;
    deleteEntry(entry.key);
  }
};

const insert = (entry: StoredEntry) => {
  const existing = entries.get(entry.key);
  if (existing) totalBytes -= existing.size;
  const size = byteSize(entry.data) + byteSize(entry.key);
  entries.set(entry.key, { ...entry, size });
  totalBytes += size;
};

/**
 * Loads what IndexedDB holds into memory. Safe to call more than once; writes
 * made while it runs win over the stored copy.
 */
export const hydratePersistentCache = () => {
  if (hydratePromise) return hydratePromise;
  if (adapterFactory) {
    adapter = adapterFactory();
    adapterFactory = null;
  }
  hydratePromise = (async () => {
    let stored: unknown[] = [];
    try {
      stored = await adapter.loadAll();
    } catch {
      stored = [];
    }
    const stale: string[] = [];
    for (const raw of stored) {
      if (!isStoredEntry(raw)) {
        const key = (raw as { key?: unknown } | null)?.key;
        if (typeof key === 'string') stale.push(key);
        continue;
      }
      if (raw.v !== version) {
        stale.push(raw.key);
        continue;
      }
      const current = entries.get(raw.key);
      if (current && current.savedAt >= raw.savedAt) continue;
      insert({ ...raw, usedAt: typeof raw.usedAt === 'number' ? raw.usedAt : raw.savedAt });
    }
    for (const key of stale) removed.add(key);
    evict();
    if (removed.size) scheduleFlush();
    hydrated = true;
    for (const listener of Array.from(hydratedListeners)) listener();
  })();
  return hydratePromise;
};

/**
 * Startup: hydrate, but give up waiting after `budgetMs` so a slow IndexedDB
 * never delays the first paint. Hydration still completes in the background
 * and onPersistentCacheHydrated listeners pick it up.
 */
export const bootPersistentCache = async (budgetMs: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), budgetMs);
  });
  const done = hydratePersistentCache().then(() => true as const);
  const result = await Promise.race([done, timeout]);
  if (timer) clearTimeout(timer);
  return result;
};

export const isPersistentCacheHydrated = () => hydrated;

export const onPersistentCacheHydrated = (listener: () => void) => {
  hydratedListeners.add(listener);
  return () => {
    hydratedListeners.delete(listener);
  };
};

export type PersistedHit<T> = { value: T; savedAt: number };

export const readPersisted = <T>(key: string, scope: PersistScope): PersistedHit<T> | undefined => {
  if (scope.userId === null) return undefined;
  const fullKey = storageKey(key, scope.userId);
  const entry = entries.get(fullKey);
  if (!entry) return undefined;
  if (entry.v !== version || now() - entry.savedAt > scope.maxAgeMs) {
    deleteEntry(fullKey);
    scheduleFlush();
    return undefined;
  }
  if (!entry.parsed) {
    try {
      entry.parsed = { value: JSON.parse(entry.data) };
    } catch {
      deleteEntry(fullKey);
      scheduleFlush();
      return undefined;
    }
  }
  // Recency for the LRU; written with the next change rather than per read.
  entry.usedAt = now();
  return { value: entry.parsed.value as T, savedAt: entry.savedAt };
};

export const writePersisted = <T>(key: string, value: T, scope: Pick<PersistScope, 'userId'> = {}) => {
  if (scope.userId === null) return;
  let data: string;
  try {
    data = JSON.stringify(value);
  } catch {
    return;
  }
  if (data === undefined) return;
  const fullKey = storageKey(key, scope.userId);
  if (byteSize(data) > maxBytes * MAX_ENTRY_SHARE) {
    deleteEntry(fullKey);
    scheduleFlush();
    return;
  }
  const time = now();
  insert({ key: fullKey, v: version, savedAt: time, usedAt: time, user: scope.userId ?? null, data });
  dirty.add(fullKey);
  removed.delete(fullKey);
  evict();
  scheduleFlush();
};

export const removePersisted = (key: string, scope: Pick<PersistScope, 'userId'> = {}) => {
  deleteEntry(storageKey(key, scope.userId));
  scheduleFlush();
};

/**
 * Sign-out and account deletion: drop a person's entries (every signed-in
 * person's when no id is given). Public entries, and what a visitor without
 * an account saw (viewer `anon`), stay. Written at once.
 */
export const clearUserPersisted = async (userId?: string | null) => {
  if (hydratePromise && !hydrated) await hydratePromise.catch(() => undefined);
  for (const entry of Array.from(entries.values())) {
    if (entry.user === null || entry.user === ANON_VIEWER) continue;
    if (userId && entry.user !== userId) continue;
    deleteEntry(entry.key);
  }
  await flushPersistentCache();
};

/** Drops one person's entries whose key starts with `prefix`. */
export const removePersistedByPrefix = (prefix: string, scope: Pick<PersistScope, 'userId'> = {}) => {
  const fullPrefix = storageKey(prefix, scope.userId);
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(fullPrefix)) deleteEntry(key);
  }
  scheduleFlush();
};

/** Size and count, for tests and the dev timing log. */
export const persistentCacheStats = () => ({ entries: entries.size, bytes: totalBytes, hydrated });

// ---- Who is looking ---------------------------------------------------------
// Snapshots that include other people's posts depend on who is looking
// (blocks hide posts both ways), so they are stored per viewer. The viewer is
// known before the first render (from the stored session) and kept current by
// AuthContext.

let viewer: string | null = null;

export const setPersistViewer = (userId: string | null) => {
  viewer = userId;
};

/** `anon` for a visitor without an account. */
export const getPersistViewer = () => viewer ?? ANON_VIEWER;
