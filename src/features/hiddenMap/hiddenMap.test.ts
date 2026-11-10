import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addHidden,
  LOCAL_KEY,
  readLocalHidden,
  removeHidden,
  toHiddenSets,
  withoutHiddenOnMap,
  writeLocalHidden,
  type HiddenMapItem,
} from './hiddenMap';

const event = (id: string, venue: string, artists: string[]) => ({
  id,
  venue: { id: venue },
  artist: artists[0] ? { id: artists[0] } : null,
  artist_ids: artists,
});

const events = [
  event('e1', 'sala-1', ['headliner', 'support']),
  event('e2', 'sala-1', ['otro']),
  event('e3', 'sala-2', ['support']),
  event('e4', 'sala-3', []),
];

const item = (type: 'artist' | 'venue', id: string): HiddenMapItem => ({ type, id, name: id, imageUrl: null, hiddenAt: '' });
const ids = (list: { id: string }[]) => list.map(entry => entry.id);

describe('withoutHiddenOnMap', () => {
  it('removes every concert of a hidden venue (its pin disappears)', () => {
    expect(ids(withoutHiddenOnMap(events, toHiddenSets([item('venue', 'sala-1')])))).toEqual(['e3', 'e4']);
  });

  it('removes concerts headlined by a hidden artist; the venue keeps its other concerts', () => {
    const visible = withoutHiddenOnMap(events, toHiddenSets([item('artist', 'headliner')]));
    expect(ids(visible)).toEqual(['e2', 'e3', 'e4']);
    expect(visible.filter(entry => entry.venue.id === 'sala-1')).toHaveLength(1);
  });

  it('keeps a concert where the hidden artist is only the support act', () => {
    expect(ids(withoutHiddenOnMap(events, toHiddenSets([item('artist', 'support')])))).toEqual(['e1', 'e2', 'e4']);
  });

  it('removes a concert when every artist on the bill is hidden', () => {
    const hidden = toHiddenSets([item('artist', 'headliner'), item('artist', 'support')]);
    expect(ids(withoutHiddenOnMap(events, hidden))).toEqual(['e2', 'e4']);
  });

  it('returns the list untouched when nothing is hidden', () => {
    expect(withoutHiddenOnMap(events, toHiddenSets([]))).toBe(events);
  });
});

describe('local list', () => {
  // Node's own (file-less) localStorage can shadow jsdom's: use a plain one.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    });
  });

  it('adds once, removes, and survives a reload', () => {
    let list = addHidden([], item('venue', 'sala-1'));
    list = addHidden(list, item('venue', 'sala-1'));
    list = addHidden(list, item('artist', 'a1'));
    expect(list.map(entry => `${entry.type}:${entry.id}`)).toEqual(['artist:a1', 'venue:sala-1']);
    writeLocalHidden(list);
    expect(readLocalHidden()).toEqual(list);
    writeLocalHidden(removeHidden(list, 'artist', 'a1'));
    expect(readLocalHidden().map(entry => entry.id)).toEqual(['sala-1']);
    writeLocalHidden([]);
    expect(window.localStorage.getItem(LOCAL_KEY)).toBeNull();
  });

  it('ignores corrupt storage', () => {
    window.localStorage.setItem(LOCAL_KEY, '{"nope":');
    expect(readLocalHidden()).toEqual([]);
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify([{ type: 'x', id: 1 }, item('venue', 'ok')]));
    expect(readLocalHidden().map(entry => entry.id)).toEqual(['ok']);
  });
});
