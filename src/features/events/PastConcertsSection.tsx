import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CoverImage from '../../components/ui/CoverImage';
import GeneratedPoster from '../../components/ui/GeneratedPoster';
import { Spinner } from '../../components/ui/AppPrimitives';
import { IconPlay } from '../../components/icons';
import { fetchEventMomentStats } from '../../data/eventQueries';
import { readCache, writeCache } from '../../data/pageCache';
import type { EventListItem } from './types';
import { getEventCoverSources, getPrimaryArtistName } from './utils';
import {
  emptyPastConcerts,
  mergePastPage,
  momentCountLabel,
  nextPastPageSize,
  type MomentStats,
  type PastConcertsState,
} from './pastConcerts';

type PastConcertsSectionProps = {
  /** Who the list belongs to, e.g. `venue:<id>`: the cache key and the reset trigger. */
  ownerKey: string;
  /** One page of past concerts, most recent first. */
  fetchPage: (offset: number, limit: number) => Promise<EventListItem[]>;
  /** The row's title: the venue on an artist page, the artist on a venue page. */
  titleOf: (event: EventListItem) => string;
  subtitleOf?: (event: EventListItem) => string | null;
  /**
   * The page has nothing else to list (no upcoming concerts either): with no
   * past concerts the section is left out instead of saying so.
   */
  hideWhenEmpty?: boolean;
  className?: string;
  headingClassName?: string;
};

const cacheKey = (ownerKey: string) => `past:${ownerKey}`;

const pastDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .replace(/[.,]/g, '')
    .toUpperCase();

const safeStats = (ids: string[]) =>
  fetchEventMomentStats(ids).catch(() => new Map<string, MomentStats>());

// «Conciertos pasados» of an artist or a venue. Nothing is read until the
// section is about to scroll into view, so it never weighs on the page's first
// load; then a page at a time with «Ver más». Concerts with fan moments say how
// many and show the newest one.
const PastConcertsSection: React.FC<PastConcertsSectionProps> = ({
  ownerKey,
  fetchPage,
  titleOf,
  subtitleOf,
  hideWhenEmpty = false,
  className = '',
  headingClassName = 'font-display text-xl font-bold text-app-ink',
}) => {
  const navigate = useNavigate();
  const [state, setState] = useState<PastConcertsState<EventListItem>>(
    () => readCache<PastConcertsState<EventListItem>>(cacheKey(ownerKey)) ?? emptyPastConcerts(),
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const ownerRef = useRef(ownerKey);
  const stateRef = useRef(state);
  stateRef.current = state;
  const loadingRef = useRef(false);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  // Another artist or venue: start over (or from what was read before).
  useEffect(() => {
    ownerRef.current = ownerKey;
    loadingRef.current = false;
    const cached = readCache<PastConcertsState<EventListItem>>(cacheKey(ownerKey)) ?? emptyPastConcerts();
    stateRef.current = cached;
    setState(cached);
    setLoading(false);
    setFailed(false);
  }, [ownerKey]);

  const loadNext = useCallback(async () => {
    if (loadingRef.current) return;
    const owner = ownerRef.current;
    const current = stateRef.current;
    loadingRef.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const limit = nextPastPageSize(current.items.length);
      const page = await fetchPageRef.current(current.items.length, limit);
      const stats = await safeStats(page.map(event => event.id));
      if (ownerRef.current !== owner) return;
      const next = mergePastPage(current, page, stats, limit);
      stateRef.current = next;
      setState(next);
      writeCache(cacheKey(owner), next);
    } catch (error) {
      console.warn('Failed to load past concerts', error);
      if (ownerRef.current === owner) setFailed(true);
    } finally {
      if (ownerRef.current === owner) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  // The first page once the section is near the viewport.
  useEffect(() => {
    if (state.loaded || failed) return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      void loadNext();
      return undefined;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect();
          void loadNext();
        }
      },
      { rootMargin: '0px 0px 200px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [state.loaded, failed, loadNext, ownerKey]);

  if (state.loaded && state.items.length === 0 && hideWhenEmpty) return null;
  // Not known yet whether there is anything to show: no heading to take back.
  const showHeading = state.loaded || !hideWhenEmpty;

  return (
    <section className={className} data-testid="past-concerts">
      {showHeading ? <h2 className={`mb-2.5 ${headingClassName}`}>Conciertos pasados</h2> : null}
      {!state.loaded ? <div ref={sentinelRef} aria-hidden className="h-px" /> : null}

      {state.loaded && state.items.length === 0 ? (
        <p className="text-sm text-white/55">Aún no hay conciertos pasados.</p>
      ) : null}

      {state.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {state.items.map(event => {
            const moments = state.stats[event.id];
            const subtitle = subtitleOf?.(event);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/event/${event.id}`)}
                  className={`flex w-full items-center gap-3 rounded-2xl border bg-app-surface p-2 pr-3 text-left text-app-ink ${
                    moments ? 'border-app-accent/40' : 'border-app-line'
                  }`}
                >
                  <span className="relative block h-[64px] w-[52px] shrink-0 overflow-hidden rounded-lg bg-app-bg">
                    <CoverImage
                      sources={getEventCoverSources(event)}
                      className="absolute inset-0 h-full w-full object-cover"
                      fallback={<GeneratedPoster title={getPrimaryArtistName(event)} />}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] font-semibold text-[#8f8b84]">{pastDate(event.starts_at)}</span>
                    <span className="block truncate font-display text-[15px] font-bold">{titleOf(event)}</span>
                    {subtitle ? <span className="block truncate text-[13px] text-[#c9c5bd]">{subtitle}</span> : null}
                    {moments ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-app-accent/15 px-2 py-0.5 text-[11px] font-semibold text-app-accent">
                        <IconPlay size={11} />
                        {momentCountLabel(moments.count)}
                      </span>
                    ) : null}
                  </span>
                  {moments?.latestThumbnailUrl ? (
                    <span className="relative block h-[56px] w-[56px] shrink-0 overflow-hidden rounded-lg bg-app-bg">
                      <CoverImage
                        sources={[moments.latestThumbnailUrl]}
                        alt="Último momento"
                        className="absolute inset-0 h-full w-full object-cover"
                        fallback={null}
                      />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      ) : null}

      {failed ? (
        <button type="button" onClick={() => void loadNext()} className="mt-2 text-sm font-semibold text-app-accent">
          No se pudieron cargar. Reintentar
        </button>
      ) : null}

      {!loading && !failed && state.hasMore ? (
        <button
          type="button"
          onClick={() => void loadNext()}
          className="mt-2.5 inline-flex min-h-[42px] w-full items-center justify-center rounded-full border border-app-line text-[14px] font-semibold text-app-ink"
        >
          Ver más
        </button>
      ) : null}
    </section>
  );
};

export default PastConcertsSection;
