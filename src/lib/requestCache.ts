type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const inFlight = new Map<string, Promise<any>>();
const resolved = new Map<string, CacheEntry<any>>();

export const cached = async <T>(
  key: string,
  loader: () => Promise<T>,
  options?: { ttlMs?: number }
): Promise<T> => {
  const ttlMs = options?.ttlMs ?? 15_000;
  const now = Date.now();

  const hit = resolved.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = loader()
    .then(value => {
      inFlight.delete(key);
      resolved.set(key, { value, expiresAt: now + ttlMs });
      return value;
    })
    .catch(err => {
      inFlight.delete(key);
      resolved.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
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

