import { cached, clearCached } from './requestCache';
import { onPersistentCacheHydrated, readPersisted, writePersisted } from './persistentCache';

type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

type QueryRecord<T> = {
  status: QueryStatus;
  hasData: boolean;
  data?: T;
  error: unknown;
  updatedAt: number;
  subscribers: Set<() => void>;
  persist?: QueryPersistOptions;
  /** The data came from the persistent cache and has not been refreshed yet. */
  fromCache: boolean;
};

export type QuerySnapshot<T> = {
  status: QueryStatus;
  data: T | undefined;
  error: unknown;
  updatedAt: number;
  /** Showing a copy saved on an earlier visit while the request runs. */
  fromCache: boolean;
};

/**
 * Keep the result across app restarts (persistentCache). The screen paints the
 * saved copy at once and the request still runs behind it.
 */
export type QueryPersistOptions = {
  /** Oldest saved copy still worth showing. */
  maxAgeMs: number;
  /**
   * Whose data it is. `null` = belongs to a person but nobody is signed in:
   * nothing is saved or read. Omit for public data.
   */
  userId?: string | null;
  /**
   * Storage key when the query key changes for reasons that should not throw
   * the saved copy away (e.g. a date window that moves every day).
   */
  key?: string;
};

export type QueryKey = string | readonly unknown[];

export type FetchQueryOptions = {
  ttlMs?: number;
  inFlightTtlMs?: number;
  timeoutMs?: number;
  force?: boolean;
  persist?: QueryPersistOptions;
};

const state = new Map<string, QueryRecord<any>>();

export const serializeQueryKey = (key: QueryKey): string => {
  if (typeof key === 'string') return key;
  return JSON.stringify(key);
};

const getOrCreateRecord = <T>(serializedKey: string): QueryRecord<T> => {
  const existing = state.get(serializedKey) as QueryRecord<T> | undefined;
  if (existing) return existing;
  const created: QueryRecord<T> = {
    status: 'idle',
    hasData: false,
    data: undefined,
    error: null,
    updatedAt: 0,
    subscribers: new Set(),
    fromCache: false,
  };
  state.set(serializedKey, created);
  return created;
};

const persistKeyOf = (serializedKey: string, persist: QueryPersistOptions) => persist.key ?? serializedKey;

// Fill a record that has nothing yet from the copy saved on an earlier visit.
const seedFromPersisted = <T>(serializedKey: string, record: QueryRecord<T>) => {
  if (record.hasData || !record.persist) return false;
  const hit = readPersisted<T>(persistKeyOf(serializedKey, record.persist), record.persist);
  if (!hit) return false;
  record.hasData = true;
  record.data = hit.value;
  record.status = 'success';
  record.error = null;
  record.updatedAt = hit.savedAt;
  record.fromCache = true;
  return true;
};

const attachPersist = <T>(serializedKey: string, record: QueryRecord<T>, persist?: QueryPersistOptions) => {
  if (!persist) return;
  record.persist = persist;
  seedFromPersisted(serializedKey, record);
};

const notify = (serializedKey: string) => {
  const record = state.get(serializedKey);
  if (!record) return;
  for (const subscriber of Array.from(record.subscribers)) subscriber();
};

export const getQuerySnapshot = <T>(serializedKey: string, persist?: QueryPersistOptions): QuerySnapshot<T> => {
  const record = getOrCreateRecord<T>(serializedKey);
  attachPersist(serializedKey, record, persist);
  return {
    status: record.status,
    data: record.data as T | undefined,
    error: record.error,
    updatedAt: record.updatedAt,
    fromCache: record.fromCache,
  };
};

// IndexedDB answered after the first render (slower than the boot budget):
// screens still waiting for their first data get the saved copy now.
onPersistentCacheHydrated(() => {
  for (const [serializedKey, record] of Array.from(state.entries())) {
    if (seedFromPersisted(serializedKey, record)) notify(serializedKey);
  }
});

export const subscribeQuery = (serializedKey: string, subscriber: () => void) => {
  const record = getOrCreateRecord(serializedKey);
  record.subscribers.add(subscriber);
  return () => {
    record.subscribers.delete(subscriber);
  };
};

export const fetchQuery = async <T>(
  queryKey: QueryKey,
  loader: () => Promise<T>,
  options?: FetchQueryOptions
): Promise<T> => {
  const serializedKey = serializeQueryKey(queryKey);
  const record = getOrCreateRecord<T>(serializedKey);
  attachPersist(serializedKey, record, options?.persist);

  if (options?.force) {
    clearCached(serializedKey);
  }

  if (!record.hasData) {
    record.status = 'loading';
    record.error = null;
    notify(serializedKey);
  }

  try {
    const value = await cached(serializedKey, loader, {
      ttlMs: options?.ttlMs,
      inFlightTtlMs: options?.inFlightTtlMs,
      timeoutMs: options?.timeoutMs,
    });
    record.status = 'success';
    record.hasData = true;
    record.data = value;
    record.error = null;
    record.updatedAt = Date.now();
    record.fromCache = false;
    if (record.persist) writePersisted(persistKeyOf(serializedKey, record.persist), value, record.persist);
    notify(serializedKey);
    return value;
  } catch (error) {
    record.error = error;
    record.status = record.hasData ? 'success' : 'error';
    record.updatedAt = Date.now();
    notify(serializedKey);
    throw error;
  }
};

export const invalidateQuery = (queryKey: QueryKey) => {
  const serializedKey = serializeQueryKey(queryKey);
  clearCached(serializedKey);
  const record = state.get(serializedKey);
  if (!record) return;
  record.status = record.hasData ? 'success' : 'idle';
  record.error = null;
  notify(serializedKey);
};

export const invalidateQueries = (prefix?: string) => {
  clearCached(prefix);
  for (const [serializedKey, record] of Array.from(state.entries())) {
    if (prefix && !serializedKey.startsWith(prefix)) continue;
    record.status = record.hasData ? 'success' : 'idle';
    record.error = null;
    notify(serializedKey);
  }
};
