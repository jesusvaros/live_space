/**
 * IndexedDB persistence for the upload queue. Jobs keep their File (web) or
 * native paths, so an upload survives an app restart. When IndexedDB is not
 * available (private mode, tests) the queue still works in memory.
 */

const DB_NAME = 'live-space-uploads';
const STORE = 'jobs';
const VERSION = 1;

export type StoredRecord = { id: string } & Record<string, unknown>;

let databasePromise: Promise<IDBDatabase | null> | null = null;

const openDatabase = () => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'id' });
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

const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const loadStoredJobs = async (): Promise<StoredRecord[]> =>
  ((await run('readonly', (store) => store.getAll())) as StoredRecord[] | null) ?? [];

export const saveStoredJob = async (record: StoredRecord) => {
  await run('readwrite', (store) => store.put(record));
};

export const deleteStoredJob = async (id: string) => {
  await run('readwrite', (store) => store.delete(id));
};
