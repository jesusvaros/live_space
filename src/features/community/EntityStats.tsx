import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Spinner } from '../../components/ui/AppPrimitives';
import { fetchEntityAudienceStats, isForbidden, type EntityAudienceStats } from './api';
import { formatCount, HBar, Legend, PrivacyNote, SERIES, StatTile, TrendChart } from './components/charts';
import ProLockChip from '../pro/ProLockChip';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; stats: EntityAudienceStats }
  | { status: 'forbidden' }
  | { status: 'error' };

export const useEntityAudienceStats = (subjectId: string | null) => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    if (!subjectId) return undefined;
    setState({ status: 'loading' });
    fetchEntityAudienceStats(subjectId)
      .then(stats => {
        if (!cancelled) setState({ status: 'ready', stats });
      })
      .catch(error => {
        if (cancelled) return;
        if (isForbidden(error)) setState({ status: 'forbidden' });
        else {
          console.warn('Failed to load audience stats', error);
          setState({ status: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);
  return state;
};

const formatEventDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

const SectionTitle: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 className="m-0 font-display text-lg font-bold text-app-ink">{children}</h2>
    {aside}
  </div>
);

const StatusBlock: React.FC<{ state: LoadState }> = ({ state }) => {
  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-10 text-white/70">
        <Spinner />
      </div>
    );
  }
  if (state.status === 'forbidden') {
    return <p className="text-sm text-white/60">Solo quien gestiona esta sala o artista puede ver sus estadísticas.</p>;
  }
  return <p className="text-sm text-white/60">No se pudieron cargar las estadísticas. Inténtalo de nuevo más tarde.</p>;
};

/** A Pro-only block on the free plan: its title, the dashed shape and a lock chip. */
const LockedStat: React.FC<{ title: string }> = ({ title }) => (
  <section className="flex min-h-16 items-center gap-3 rounded-2xl border border-dashed border-white/25 px-3.5">
    <h2 className="m-0 min-w-0 flex-1 text-sm font-semibold text-app-ink">{title}</h2>
    <ProLockChip />
  </section>
);

/**
 * Full statistics for one artist or venue (the /gestion/estadisticas body).
 * On the free plan (`locked`) only the totals and the upcoming concerts show;
 * the trend, cities and past concerts are Pro.
 */
export const EntityStatsPanel: React.FC<{ subjectId: string; locked?: boolean }> = ({ subjectId, locked = false }) => {
  const navigate = useNavigate();
  const state = useEntityAudienceStats(subjectId);
  if (state.status !== 'ready') return <StatusBlock state={state} />;
  const { stats } = state;

  const now = Date.now();
  const upcoming = stats.events.filter(event => new Date(event.starts_at).getTime() >= now - 6 * 3600_000);
  const past = stats.events.filter(event => !upcoming.includes(event)).reverse();
  const eventMax = Math.max(1, ...stats.events.flatMap(event => [event.saves ?? 0, event.going ?? 0, event.attended ?? 0]));
  const cityMax = Math.max(1, ...stats.cities.map(city => city.followers));

  const renderEvent = (event: EntityAudienceStats['events'][number], keys: Array<'saves' | 'going' | 'attended'>) => (
    <li key={event.event_id}>
      <button
        type="button"
        onClick={() => navigate(`/event/${event.event_id}`)}
        className="block min-h-11 w-full rounded-2xl border border-app-line bg-app-surface p-3 text-left transition hover:border-white/25"
      >
        <p className="m-0 font-mono text-[10px] font-semibold tracking-[0.08em] text-app-accent">{formatEventDate(event.starts_at)}</p>
        <p className="m-0 mt-0.5 truncate font-display text-[15px] font-bold text-app-ink">{event.name}</p>
        <div className="mt-2 space-y-1.5">
          {keys.map(key => (
            <div key={key} className="grid grid-cols-[64px_1fr] items-center gap-2">
              <span className="text-[11px] text-white/60">{SERIES[key].label}</span>
              <HBar value={event[key]} max={eventMax} color={SERIES[key].color} label={SERIES[key].label} />
            </div>
          ))}
        </div>
      </button>
    </li>
  );

  const citiesTotal = stats.cities.reduce((sum, city) => sum + city.followers, 0);
  const hasOtherCities = stats.followers === null || stats.followers > citiesTotal;

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Resumen">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Guardados" value={stats.totals.saves} series="saves" />
          <StatTile label="Dicen «Voy»" value={stats.totals.going} series="going" />
          <StatTile label="Fueron" value={stats.totals.attended} series="attended" />
        </div>
        <p className="m-0 mt-2 text-xs text-[#8f8b84]">Conciertos de los últimos 60 días y los próximos.</p>
      </section>

      {locked ? (
        <>
          <LockedStat title="Interés, últimos 30 días" />
          <LockedStat title="De dónde son tus seguidores" />
        </>
      ) : (
        <>
          <section aria-labelledby="stats-trend" className="rounded-2xl border border-app-line bg-app-surface p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="stats-trend" className="m-0 text-sm font-semibold text-app-ink">Interés, últimos 30 días</h2>
              <Legend keys={['saves', 'going']} />
            </div>
            <TrendChart points={stats.trend} height={150} />
          </section>

          <section aria-labelledby="stats-cities" className="rounded-2xl border border-app-line bg-app-surface p-3.5">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h2 id="stats-cities" className="m-0 text-sm font-semibold text-app-ink">De dónde son tus seguidores</h2>
              <span className="font-mono text-[11px] text-[#8f8b84]">{formatCount(stats.followers)} en total</span>
            </div>
            <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
              {stats.cities.map(city => (
                <li key={city.city} className="grid grid-cols-[104px_1fr] items-center gap-2.5">
                  <span className="truncate text-app-ink">{city.city}</span>
                  <HBar value={city.followers} max={cityMax} color="#ff5b2e" label={city.city} />
                </li>
              ))}
              {hasOtherCities && (
                <li className="grid grid-cols-[104px_1fr] items-center gap-2.5 text-[#8f8b84]">
                  <span>{stats.cities.length ? 'Otras' : 'Todas'}</span>
                  <span>menos de {stats.k} personas por ciudad</span>
                </li>
              )}
            </ol>
          </section>
        </>
      )}

      <section aria-label="Próximos conciertos" className="mt-4">
        <SectionTitle aside={<Legend keys={['saves', 'going']} />}>Próximos conciertos</SectionTitle>
        {upcoming.length === 0 ? (
          <p className="m-0 text-sm text-white/55">No hay conciertos anunciados.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">{upcoming.map(event => renderEvent(event, ['saves', 'going']))}</ul>
        )}
      </section>

      {locked && past.length > 0 ? <div className="mt-4"><LockedStat title="Conciertos recientes" /></div> : null}

      {!locked && past.length > 0 && (
        <section aria-label="Conciertos recientes" className="mt-4">
          <SectionTitle aside={<Legend keys={['saves', 'attended']} />}>Recientes</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">{past.map(event => renderEvent(event, ['saves', 'attended']))}</ul>
        </section>
      )}

      <PrivacyNote className="mt-4" />
    </div>
  );
};

/**
 * Compact block for the management panel: four numbers, a sparkline and a
 * link to the full screen. Renders nothing for non-members.
 */
export const EntityStatsSummary: React.FC<{ subjectId: string; className?: string }> = ({ subjectId, className = '' }) => {
  const state = useEntityAudienceStats(subjectId);
  if (state.status !== 'ready') return null;
  const { stats } = state;
  return (
    <section className={`rounded-2xl border border-app-line bg-app-surface p-4 ${className}`} aria-label="Estadísticas">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 font-display text-base font-bold text-app-ink">Estadísticas</h3>
        <Link
          to={`/gestion/estadisticas?entidad=${encodeURIComponent(subjectId)}`}
          className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-app-accent no-underline"
        >
          Ver todo
        </Link>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatTile label="Guardados" value={stats.totals.saves} series="saves" />
        <StatTile label="Dicen «Voy»" value={stats.totals.going} series="going" />
        <StatTile label="Seguidores" value={stats.followers} />
      </div>
      <div className="mt-3">
        <TrendChart points={stats.trend} height={70} compact />
      </div>
    </section>
  );
};
