import type { PersistAdapter, StoredEntry } from './persistentCache';

/**
 * IndexedDB storage for persistentCache (same pattern as
 * media/uploadQueueStore). Any failure (no IndexedDB, private mode, blocked
 * upgrade, quota) resolves quietly: the cache then lives in memory only.
 */

const DB_NAME = 'live-space-cache';
const STORE = 'entries';
const DB_VERSION = 1;

let databasePromise: Promise<IDBDatabase | null> | null = null;

const openDatabase = () => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase | null>(resolve => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return databasePromise;
};

const write = async (action: (store: IDBObjectStore) => void) => {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>(resolve => {
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
};

export const indexedDbCacheAdapter = (): PersistAdapter => ({
  loadAll: async () => {
    const database = await openDatabase();
    if (!database) return [];
    return new Promise<StoredEntry[]>(resolve => {
      try {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        request.onsuccess = () => resolve((request.result || []) as StoredEntry[]);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  },
  put: entries =>
    write(store => {
      for (const entry of entries) store.put(entry);
    }),
  remove: keys =>
    write(store => {
      for (const key of keys) store.delete(key);
    }),
});
