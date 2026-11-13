import { vi } from 'vitest';

/** Node's own (file-less) localStorage can shadow jsdom's: a plain in-memory one. */
export const stubLocalStorage = () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, String(value)),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
};
