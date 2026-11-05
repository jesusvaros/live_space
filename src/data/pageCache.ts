// In-memory copy of what detail screens already loaded, so opening a concert,
// artist or venue seen before (or listed on the previous screen) paints at
// once and refreshes behind. Lives as long as the app process; nothing here
// is persisted.
const entries = new Map<string, unknown>();

// Plenty for a session; keeps memory flat when someone scrolls a whole city.
const MAX_ENTRIES = 600;

export const readCache = <T>(key: string): T | undefined => entries.get(key) as T | undefined;

export const writeCache = <T>(key: string, value: T) => {
  entries.delete(key);
  entries.set(key, value);
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
};

export const eventCacheKey = (id: string) => `event:${id}`;
export const artistCacheKey = (id: string) => `artist:${id}`;
export const venueCacheKey = (id: string) => `venue:${id}`;
