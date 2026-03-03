import { cached, clearCached } from './requestCache';

type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

type QueryRecord<T> = {
  status: QueryStatus;
  hasData: boolean;
  data?: T;
  error: unknown;
  updatedAt: number;
  subscribers: Set<() => void>;
};

export type QuerySnapshot<T> = {
  status: QueryStatus;
  data: T | undefined;
  error: unknown;
  updatedAt: number;
};

export type QueryKey = string | readonly unknown[];

export type FetchQueryOptions = {
  ttlMs?: number;
  inFlightTtlMs?: number;
  timeoutMs?: number;
  force?: boolean;
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
  };
  state.set(serializedKey, created);
  return created;
};

const notify = (serializedKey: string) => {
  const record = state.get(serializedKey);
  if (!record) return;
  for (const subscriber of Array.from(record.subscribers)) subscriber();
};

export const getQuerySnapshot = <T>(serializedKey: string): QuerySnapshot<T> => {
  const record = getOrCreateRecord<T>(serializedKey);
  return {
    status: record.status,
    data: record.data as T | undefined,
    error: record.error,
    updatedAt: record.updatedAt,
  };
};

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
