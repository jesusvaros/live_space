/**
 * The photos and videos picked on Upload by someone without an account, kept
 * while they sign in with Google/Apple on the web (a full page redirect that
 * would otherwise drop them). In the app the sign-in opens in an in-app
 * browser and the page stays alive, so this is only used on the web.
 *
 * One record, thrown away after 30 minutes or once read.
 */

const DB_NAME = 'live-space-pending-selection';
const STORE = 'selection';
const KEY = 'current';
const TTL_MS = 30 * 60 * 1000;

export type PendingSelection = {
  eventId: string | null;
  files: File[];
};

type StoredSelection = PendingSelection & { id: string; at: number };

const openDatabase = () =>
  new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      // Resolve once the write is on disk, not just queued: the page is about to go.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).finally(() => database.close());
};

export const savePendingSelection = async (selection: PendingSelection) => {
  const record: StoredSelection = { id: KEY, at: Date.now(), ...selection };
  await run('readwrite', (store) => store.put(record));
};

export const takePendingSelection = async (): Promise<PendingSelection | null> => {
  const record = (await run('readonly', (store) => store.get(KEY))) as StoredSelection | null | undefined;
  if (!record) return null;
  await run('readwrite', (store) => store.delete(KEY));
  if (Date.now() - record.at > TTL_MS || !record.files?.length) return null;
  return { eventId: record.eventId, files: record.files };
};
