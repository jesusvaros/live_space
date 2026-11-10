import { fetchQuery, getQuerySnapshot, serializeQueryKey, type FetchQueryOptions } from '../lib/queryClient';
import { eventsListQuery, upcomingCitiesQuery } from '../features/events/hooks/useEventsList';
import { inicioWindow } from '../features/events/inicioWindow';
import { readStoredCity } from '../features/agenda/agendaPrefs';
import { mapEventsQuery } from '../hooks/useMapFilters';
import { suggestedArtistsQuery } from '../features/discover/hooks/useDiscoverResults';
import { readStoredLocation } from '../shared/hooks/useStoredLocation';

// A saved copy younger than this is good enough: the tab opens on it and
// refreshes itself then, so the prefetch skips the request.
const FRESH_ENOUGH_MS = 10 * 60 * 1000;

type QueryDef<T> = {
  key: readonly unknown[];
  fn: () => Promise<T>;
  options: FetchQueryOptions;
};

const warm = async <T>(query: QueryDef<T>) => {
  const snapshot = getQuerySnapshot<T>(serializeQueryKey(query.key), query.options.persist);
  if (snapshot.data !== undefined && Date.now() - snapshot.updatedAt < FRESH_ENOUGH_MS) return snapshot.data;
  return fetchQuery<T>(query.key, query.fn, query.options);
};

/**
 * Once the first screen has settled: the data of the other bottom-nav tabs,
 * one request at a time, through the same queries (keys, persistence) the
 * tabs use, so opening one paints at once. Momentos (feed) pages itself and
 * Perfil depends on the account and workspace: those load when opened.
 */
export const prefetchTabs = async (options: { pathname: string; profileCity?: string | null }) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  // «Ahorro de datos» on: only what is opened gets downloaded.
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const { pathname } = options;
  const tasks: Array<() => Promise<unknown>> = [];

  if (!pathname.startsWith('/tabs/events')) {
    tasks.push(async () => {
      const window = inicioWindow();
      const cities = await warm(upcomingCitiesQuery(window));
      // The city Inicio will pick without a position: the chosen one, the
      // profile's, else the busiest.
      const wanted = readStoredCity() || options.profileCity || 'Madrid';
      const city =
        cities.find(option => option.name.toLocaleLowerCase('es') === wanted.toLocaleLowerCase('es'))?.name ??
        cities[0]?.name ??
        wanted;
      await warm(eventsListQuery({ ...window, city }));
    });
  }
  if (!pathname.startsWith('/tabs/map')) tasks.push(() => warm(mapEventsQuery('next30')));
  if (!pathname.startsWith('/tabs/discover')) tasks.push(() => warm(suggestedArtistsQuery(readStoredLocation())));

  for (const task of tasks) {
    await task().catch(() => undefined);
  }
};

/** Runs `task` when the browser is idle (or after `timeoutMs` at the latest). */
export const whenIdle = (task: () => void, timeoutMs = 2000) => {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) {
    const handle = idle(task, { timeout: timeoutMs });
    return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(handle);
  }
  const timer = window.setTimeout(task, 200);
  return () => window.clearTimeout(timer);
};
