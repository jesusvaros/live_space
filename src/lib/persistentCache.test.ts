import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bootPersistentCache,
  clearUserPersisted,
  configurePersistentCache,
  flushPersistentCache,
  hydratePersistentCache,
  readPersisted,
  resetPersistentCacheForTests,
  writePersisted,
  type PersistAdapter,
  type StoredEntry,
} from './persistentCache';
import { fetchQuery, getQuerySnapshot, serializeQueryKey } from './queryClient';
import { clearCached } from './requestCache';

// Stands in for IndexedDB: survives a "restart" (resetPersistentCacheForTests
// only forgets the memory side).
const fakeStorage = () => {
  const rows = new Map<string, StoredEntry>();
  let gate: Promise<void> | null = null;
  const adapter: PersistAdapter = {
    loadAll: async () => {
      if (gate) await gate;
      return Array.from(rows.values()).map(row => ({ ...row }));
    },
    put: async entries => {
      for (const entry of entries) rows.set(entry.key, { ...entry });
    },
    remove: async keys => {
      for (const key of keys) rows.delete(key);
    },
  };
  return {
    rows,
    adapter,
    slowDown: () => {
      let open: () => void = () => undefined;
      gate = new Promise<void>(resolve => {
        open = resolve;
      });
      return () => {
        gate = null;
        open();
      };
    },
  };
};

const HOUR = 60 * 60 * 1000;
let clock = 1_000_000;
const now = () => clock;

const restart = async (storage: ReturnType<typeof fakeStorage>, options: { version?: number; maxBytes?: number } = {}) => {
  await flushPersistentCache();
  resetPersistentCacheForTests();
  configurePersistentCache({ adapter: storage.adapter, now, ...options });
  await hydratePersistentCache();
};

describe('persistentCache', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    clock = 1_000_000;
    resetPersistentCacheForTests();
    storage = fakeStorage();
    configurePersistentCache({ adapter: storage.adapter, now });
  });

  afterEach(() => resetPersistentCacheForTests());

  it('survives a restart: hydrate loads what was written', async () => {
    await hydratePersistentCache();
    writePersisted('inicio:cities', [{ name: 'Madrid' }]);
    await restart(storage);
    expect(readPersisted('inicio:cities', { maxAgeMs: HOUR })?.value).toEqual([{ name: 'Madrid' }]);
  });

  it('ignores and removes entries older than the max age', async () => {
    await hydratePersistentCache();
    writePersisted('map', [1, 2, 3]);
    clock += 2 * HOUR;
    expect(readPersisted('map', { maxAgeMs: 3 * HOUR })?.value).toEqual([1, 2, 3]);
    expect(readPersisted('map', { maxAgeMs: HOUR })).toBeUndefined();
    await flushPersistentCache();
    expect(storage.rows.size).toBe(0);
  });

  it('evicts the least recently used entries past the size cap', async () => {
    // Each entry is ~ (100 chars + key) * 2 bytes: three do not fit in 600 bytes.
    resetPersistentCacheForTests();
    configurePersistentCache({ adapter: storage.adapter, now, maxBytes: 600 });
    await hydratePersistentCache();
    const payload = 'x'.repeat(100);
    writePersisted('a', payload);
    clock += 1;
    writePersisted('b', payload);
    clock += 1;
    readPersisted('a', { maxAgeMs: HOUR }); // a is now the most recent
    clock += 1;
    writePersisted('c', payload);
    expect(readPersisted('a', { maxAgeMs: HOUR })?.value).toBe(payload);
    expect(readPersisted('b', { maxAgeMs: HOUR })).toBeUndefined();
    expect(readPersisted('c', { maxAgeMs: HOUR })?.value).toBe(payload);
    await flushPersistentCache();
    expect(Array.from(storage.rows.keys()).sort()).toEqual(['p:a', 'p:c']);
  });

  it('drops everything saved under another schema version', async () => {
    await hydratePersistentCache();
    writePersisted('venue:1', { name: 'Sala' });
    await restart(storage, { version: 2 });
    expect(readPersisted('venue:1', { maxAgeMs: HOUR })).toBeUndefined();
    await flushPersistentCache();
    expect(storage.rows.size).toBe(0);
  });

  it('drops entries that do not parse', async () => {
    storage.rows.set('p:broken', { key: 'p:broken', v: 1, savedAt: clock, usedAt: clock, user: null, data: '{nope' });
    storage.rows.set('p:junk', { key: 'p:junk' } as StoredEntry);
    await hydratePersistentCache();
    expect(readPersisted('broken', { maxAgeMs: HOUR })).toBeUndefined();
    await flushPersistentCache();
    expect(storage.rows.size).toBe(0);
  });

  it('keeps each person apart and clears them on sign-out', async () => {
    await hydratePersistentCache();
    writePersisted('inicio:going', ['ana'], { userId: 'ana' });
    writePersisted('inicio:going', ['luis'], { userId: 'luis' });
    writePersisted('inicio:cities', ['Madrid']);
    writePersisted('page:venue:1', 'as a visitor', { userId: 'anon' });

    expect(readPersisted('inicio:going', { maxAgeMs: HOUR, userId: 'ana' })?.value).toEqual(['ana']);
    expect(readPersisted('inicio:going', { maxAgeMs: HOUR, userId: 'luis' })?.value).toEqual(['luis']);
    // Nobody signed in: nothing personal is read or written.
    expect(readPersisted('inicio:going', { maxAgeMs: HOUR, userId: null })).toBeUndefined();
    expect(readPersisted('inicio:going', { maxAgeMs: HOUR })).toBeUndefined();

    await clearUserPersisted('ana');
    expect(readPersisted('inicio:going', { maxAgeMs: HOUR, userId: 'ana' })).toBeUndefined();
    expect(readPersisted('inicio:going', { maxAgeMs: HOUR, userId: 'luis' })?.value).toEqual(['luis']);

    await clearUserPersisted();
    expect(readPersisted('inicio:going', { maxAgeMs: HOUR, userId: 'luis' })).toBeUndefined();
    expect(readPersisted('inicio:cities', { maxAgeMs: HOUR })?.value).toEqual(['Madrid']);
    // What a visitor without an account saw is nobody's personal data.
    expect(readPersisted('page:venue:1', { maxAgeMs: HOUR, userId: 'anon' })?.value).toBe('as a visitor');
    expect(Array.from(storage.rows.keys()).sort()).toEqual(['p:inicio:cities', 'u:anon:page:venue:1']);
  });

  it('does not hold the first paint for a slow store, and fills in when it answers', async () => {
    writePersisted('seed', 'x');
    await flushPersistentCache();
    resetPersistentCacheForTests();
    configurePersistentCache({ adapter: storage.adapter, now });
    const open = storage.slowDown();
    await expect(bootPersistentCache(10)).resolves.toBe(false);
    expect(readPersisted('seed', { maxAgeMs: HOUR })).toBeUndefined();
    open();
    await hydratePersistentCache();
    expect(readPersisted('seed', { maxAgeMs: HOUR })?.value).toBe('x');
  });
});

describe('queryClient with persist', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(async () => {
    clock = 1_000_000;
    clearCached();
    resetPersistentCacheForTests();
    storage = fakeStorage();
    configurePersistentCache({ adapter: storage.adapter, now });
    await hydratePersistentCache();
  });

  afterEach(() => resetPersistentCacheForTests());

  it('paints the saved copy, revalidates behind it and saves the fresh one', async () => {
    const persist = { maxAgeMs: HOUR, key: 'test:list' };
    writePersisted('test:list', ['old']);
    const key = ['test:list', 'window-1'];

    const first = getQuerySnapshot<string[]>(serializeQueryKey(key), persist);
    expect(first).toMatchObject({ status: 'success', data: ['old'], fromCache: true });

    let calls = 0;
    const fresh = await fetchQuery(key, async () => {
      calls += 1;
      return ['new'];
    }, { persist });
    expect(fresh).toEqual(['new']);
    expect(calls).toBe(1);
    expect(getQuerySnapshot<string[]>(serializeQueryKey(key))).toMatchObject({ data: ['new'], fromCache: false });
    expect(readPersisted('test:list', { maxAgeMs: HOUR })?.value).toEqual(['new']);
  });

  it('keeps the saved copy on screen when the request fails (offline)', async () => {
    const persist = { maxAgeMs: HOUR };
    const key = ['test:offline'];
    writePersisted(serializeQueryKey(key), ['saved']);
    await expect(
      fetchQuery(key, async () => {
        throw new Error('offline');
      }, { persist }),
    ).rejects.toThrow('offline');
    expect(getQuerySnapshot<string[]>(serializeQueryKey(key))).toMatchObject({ status: 'success', data: ['saved'] });
  });

  it('dedupes requests in flight and still forces a refetch when asked', async () => {
    const key = ['test:dedupe'];
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    const persist = { maxAgeMs: HOUR };
    await Promise.all([fetchQuery(key, loader, { persist }), fetchQuery(key, loader, { persist })]);
    expect(calls).toBe(1);
    await fetchQuery(key, loader, { persist });
    expect(calls).toBe(1);
    await expect(fetchQuery(key, loader, { persist, force: true })).resolves.toBe(2);
  });

  it('never reads or saves a personal query without a signed-in user', async () => {
    writePersisted('test:mine', ['ana'], { userId: 'ana' });
    const snapshot = getQuerySnapshot<string[]>(serializeQueryKey(['test:mine', '']), {
      maxAgeMs: HOUR,
      userId: null,
      key: 'test:mine',
    });
    expect(snapshot.data).toBeUndefined();
    await fetchQuery(['test:mine', ''], async () => ['anon'], { persist: { maxAgeMs: HOUR, userId: null, key: 'test:mine' } });
    await flushPersistentCache();
    expect(Array.from(storage.rows.keys())).toEqual(['u:ana:test:mine']);
  });
});
