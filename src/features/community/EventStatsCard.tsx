import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { fetchEventIntentStats, isForbidden, type EventIntentStats } from './api';
import { Legend, PrivacyNote, StatTile, TrendChart } from './components/charts';

type EventStatsCardProps = {
  eventId: string;
  className?: string;
};

/**
 * Aggregated intent for one event, for members of its artist or venue.
 * Renders nothing for everybody else (the RPC refuses them), so it can be
 * mounted on any event screen with a single line.
 */
const EventStatsCard: React.FC<EventStatsCardProps> = ({ eventId, className = '' }) => {
  const { user } = useAuth();
  const { managedEntities } = useWorkspace();
  const userId = user?.id ?? null;
  // Fans never manage anything: skip the round trip for them.
  const managesSomething = managedEntities.some(entity => entity.type === 'artist' || entity.type === 'venue');
  const [stats, setStats] = useState<EventIntentStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    if (!userId || !eventId || !managesSomething) return undefined;
    fetchEventIntentStats(eventId)
      .then(data => {
        if (!cancelled) setStats(data);
      })
      .catch(error => {
        // Not a member (42501) is the normal case for fans; any other error
        // (e.g. the migration is not applied yet) also hides the card.
        if (!cancelled && !isForbidden(error)) console.warn('Failed to load event stats', error);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, userId, managesSomething]);

  if (!stats) return null;

  return (
    <section
      aria-labelledby={`event-stats-${eventId}`}
      className={`rounded-2xl border border-app-line bg-app-surface p-4 ${className}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={`event-stats-${eventId}`} className="m-0 font-display text-base font-bold text-app-ink">
          Intención del público
        </h3>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-app-accent">Solo gestión</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatTile label="Guardados" value={stats.saves} series="saves" />
        <StatTile label="Dicen «Voy»" value={stats.going} series="going" />
        <StatTile label="Fueron" value={stats.attended} series="attended" />
      </div>
      {stats.trend?.length ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="m-0 text-xs font-semibold text-white/70">Interés, últimos 30 días</p>
            <Legend keys={['saves', 'going']} />
          </div>
          <TrendChart points={stats.trend} height={110} />
        </div>
      ) : null}
      <PrivacyNote className="mt-3" />
    </section>
  );
};

export default EventStatsCard;
