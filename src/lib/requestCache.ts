type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type InFlightEntry<T> = {
  promise: Promise<T>;
  startedAt: number;
  requestId: number;
};

let requestIdCounter = 0;
const inFlight = new Map<string, InFlightEntry<any>>();
const resolved = new Map<string, CacheEntry<any>>();

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, key: string): Promise<T> => {
  if (timeoutMs <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Request timeout while loading cache key "${key}"`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
};

export const cached = async <T>(
  key: string,
  loader: () => Promise<T>,
  options?: { ttlMs?: number; inFlightTtlMs?: number; timeoutMs?: number }
): Promise<T> => {
  const ttlMs = options?.ttlMs ?? 15_000;
  const inFlightTtlMs = options?.inFlightTtlMs ?? 20_000;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const now = Date.now();

  const hit = resolved.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const existing = inFlight.get(key) as InFlightEntry<T> | undefined;
  if (existing) {
    const stillFresh = now - existing.startedAt <= inFlightTtlMs;
    if (stillFresh) return existing.promise;
    inFlight.delete(key);
  }

  const requestId = ++requestIdCounter;
  const startedAt = Date.now();

  const promise = withTimeout(loader(), timeoutMs, key)
    .then(value => {
      const current = inFlight.get(key);
      if (current?.requestId === requestId) {
        inFlight.delete(key);
        resolved.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .catch(err => {
      const current = inFlight.get(key);
      if (current?.requestId === requestId) {
        inFlight.delete(key);
        resolved.delete(key);
      }
      throw err;
    });

  inFlight.set(key, { promise, startedAt, requestId });
  return promise;
};

export const setCached = <T>(key: string, value: T, options?: { ttlMs?: number }) => {
  const ttlMs = options?.ttlMs ?? 15_000;
  resolved.set(key, { value, expiresAt: Date.now() + ttlMs });
};

export const clearCached = (prefix?: string) => {
  if (!prefix) {
    inFlight.clear();
    resolved.clear();
    return;
  }
  for (const key of Array.from(inFlight.keys())) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
  for (const key of Array.from(resolved.keys())) {
    if (key.startsWith(prefix)) resolved.delete(key);
  }
};
