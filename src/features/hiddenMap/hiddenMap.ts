// «Ocultar del mapa»: artists and venues a person is not interested in.
// Map-only: a hidden venue loses its pin; a concert leaves the map when its
// headliner is hidden or every artist on its bill is. A venue left without
// concerts loses its pin; with others left, its count shrinks.

export type HiddenMapType = 'artist' | 'venue';

export type HiddenMapItem = {
  type: HiddenMapType;
  id: string;
  name: string;
  imageUrl: string | null;
  hiddenAt: string;
};

export type HiddenMapSets = { artists: ReadonlySet<string>; venues: ReadonlySet<string> };

export const EMPTY_HIDDEN: HiddenMapSets = { artists: new Set(), venues: new Set() };

export const toHiddenSets = (items: readonly HiddenMapItem[]): HiddenMapSets => ({
  artists: new Set(items.filter(item => item.type === 'artist').map(item => item.id)),
  venues: new Set(items.filter(item => item.type === 'venue').map(item => item.id)),
});

type MapLikeEvent = {
  venue: { id: string } | null;
  artist: { id: string } | null;
  artist_ids: readonly string[];
};

export const isHiddenFromMap = (event: MapLikeEvent, hidden: HiddenMapSets) => {
  if (event.venue && hidden.venues.has(event.venue.id)) return true;
  if (hidden.artists.size === 0) return false;
  if (event.artist && hidden.artists.has(event.artist.id)) return true;
  return event.artist_ids.length > 0 && event.artist_ids.every(id => hidden.artists.has(id));
};

export const withoutHiddenOnMap = <T extends MapLikeEvent>(events: readonly T[], hidden: HiddenMapSets): T[] =>
  hidden.artists.size === 0 && hidden.venues.size === 0
    ? (events as T[])
    : events.filter(event => !isHiddenFromMap(event, hidden));

// Signed-out visitors: the list lives on the device.
export const LOCAL_KEY = 'live_space.hidden_map.v1';

const isItem = (value: any): value is HiddenMapItem =>
  value
  && (value.type === 'artist' || value.type === 'venue')
  && typeof value.id === 'string'
  && typeof value.name === 'string';

export const readLocalHidden = (): HiddenMapItem[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(isItem).map(item => ({ ...item, imageUrl: item.imageUrl ?? null, hiddenAt: item.hiddenAt || '' }))
      : [];
  } catch {
    return [];
  }
};

export const writeLocalHidden = (items: readonly HiddenMapItem[]) => {
  try {
    if (items.length === 0) window.localStorage.removeItem(LOCAL_KEY);
    else window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  } catch {
    // Private mode or full storage: the change lasts for this session only.
  }
};

export const addHidden = (items: readonly HiddenMapItem[], item: HiddenMapItem): HiddenMapItem[] =>
  items.some(existing => existing.type === item.type && existing.id === item.id) ? [...items] : [item, ...items];

export const removeHidden = (items: readonly HiddenMapItem[], type: HiddenMapType, id: string): HiddenMapItem[] =>
  items.filter(item => !(item.type === type && item.id === id));
