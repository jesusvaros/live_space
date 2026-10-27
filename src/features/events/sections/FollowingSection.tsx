import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../../../components/ui/Avatar';
import { IconPlus } from '../../../components/icons';
import { FollowedEntity } from '../../../hooks/useFollowedEntities';
import { EventListItem } from '../types';
import { getPrimaryArtistName } from '../utils';

type FollowingSectionProps = {
  events: EventListItem[];
  entities: FollowedEntity[];
  signedIn: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NEXT = 3;

const Chevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 opacity-70">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();

const time = (date: Date) => date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const weekday = (date: Date) => date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase();

type FollowedEvent = { event: EventListItem; reason: string; startsAt: Date };

// "Lo que sigues": followed artists and venues, ringed when they play this
// week, and the next concerts that involve them.
const FollowingSection: React.FC<FollowingSectionProps> = ({ events, entities, signedIn }) => {
  const navigate = useNavigate();

  const { upcoming, soonIds } = useMemo(() => {
    const artistIds = new Set(entities.filter(entity => entity.kind === 'artist').map(entity => entity.id));
    const venueIds = new Set(entities.filter(entity => entity.kind === 'venue').map(entity => entity.id));
    const festivalIds = new Set(entities.filter(entity => entity.kind === 'festival').map(entity => entity.id));
    const now = Date.now();
    // Tonight's concert stays listed for a few hours after doors.
    const from = now - 4 * 60 * 60 * 1000;
    const list: FollowedEvent[] = [];
    const soon = new Set<string>();
    for (const event of events) {
      const startsAt = new Date(event.starts_at);
      if (startsAt.getTime() < from) continue;
      const artistMatch = (event.event_artists || []).find(entry => entry.artist?.id && artistIds.has(entry.artist.id));
      const venueMatch = event.venue_place?.id && venueIds.has(event.venue_place.id) ? event.venue_place.id : null;
      const festivalMatch = event.festival_id && festivalIds.has(event.festival_id) ? event.festival_id : null;
      if (!artistMatch && !venueMatch && !festivalMatch) continue;
      const reason = artistMatch ? 'sigues al artista' : festivalMatch ? 'sigues el festival' : 'sigues la sala';
      list.push({ event, reason, startsAt });
      if (startsAt.getTime() - now <= WEEK_MS) {
        if (artistMatch?.artist?.id) soon.add(artistMatch.artist.id);
        if (venueMatch) soon.add(venueMatch);
        if (festivalMatch) soon.add(festivalMatch);
      }
    }
    list.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
    return { upcoming: list.slice(0, MAX_NEXT), soonIds: soon };
  }, [entities, events]);

  // Those with a concert this week go first.
  const ordered = useMemo(
    () => [...entities].sort((left, right) => Number(soonIds.has(right.id)) - Number(soonIds.has(left.id))),
    [entities, soonIds],
  );

  if (!signedIn || entities.length === 0) {
    return (
      <p className="px-4 pt-5 text-sm text-white/65">
        <Link to="/tabs/discover" className="font-semibold text-app-accent">Sigue artistas y salas</Link>{' '}
        y aquí verás cuándo tocan.
      </p>
    );
  }

  const today = new Date();

  return (
    <section aria-labelledby="lo-que-sigues" className="flex flex-col gap-3 px-4 pt-[22px]">
      <div className="flex items-center justify-between">
        <h2 id="lo-que-sigues" className="font-display text-2xl font-bold text-app-ink">Lo que sigues</h2>
        <Link
          to="/tabs/profile"
          state={{ profileTab: 'following' }}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-app-accent"
        >
          Gestionar
        </Link>
      </div>

      <div className="-mr-4 flex gap-3.5 overflow-x-auto pr-4">
        {ordered.map(entity => {
          const ringed = soonIds.has(entity.id);
          return (
            <button
              key={entity.subjectId}
              type="button"
              onClick={() => navigate(`/tabs/${entity.kind}/${entity.id}`)}
              className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-app-ink"
            >
              <span className={`${entity.kind === 'artist' ? 'rounded-full' : 'rounded-[18px]'} border-2 p-0.5 ${ringed ? 'border-app-accent' : 'border-app-line'}`}>
                <Avatar name={entity.name} src={entity.imageUrl} kind={entity.kind} badge className="h-[60px] w-[60px] text-[22px]" />
              </span>
              <span className={`w-full truncate text-center text-xs font-semibold ${ringed ? '' : 'text-[#c9c5bd]'}`}>
                {entity.name}
              </span>
              <span className="-mt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8f8b84]">
                {entity.kind === 'artist' ? 'Artista' : entity.kind === 'festival' ? 'Festival' : 'Sala'}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => navigate('/tabs/discover')}
          aria-label="Seguir a más artistas o salas"
          className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-[#c9c5bd]"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-app-line">
            <IconPlus size={22} />
          </span>
          <span className="text-xs font-semibold">Seguir más</span>
        </button>
      </div>

      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {upcoming.map(({ event, reason, startsAt }, index) => {
            const isToday = sameDay(startsAt, today);
            const artist = getPrimaryArtistName(event);
            const venue = event.venue_place?.name || event.city;
            if (index === 0 && isToday) {
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/event/${event.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-app-accent px-3 py-2.5 text-left text-[#14151a]"
                  >
                    <span className="w-[54px] text-center font-poster text-[30px] leading-[0.9]">Hoy</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base font-bold">{artist} en {venue}</span>
                      <span className="text-[13px]">{time(startsAt)} · {reason}</span>
                    </span>
                    <Chevron />
                  </button>
                </li>
              );
            }
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/event/${event.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3 py-2.5 text-left text-app-ink"
                >
                  <span className="w-[54px] text-center">
                    <span className="block font-mono text-[11px] font-semibold text-app-accent">
                      {isToday ? 'HOY' : weekday(startsAt)}
                    </span>
                    <span className="block font-poster text-[26px] leading-none">{startsAt.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base font-bold">{artist}</span>
                    <span className="block truncate text-[13px] text-[#c9c5bd]">{venue} · {reason}</span>
                  </span>
                  <Chevron />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-white/55">Ninguno tiene conciertos anunciados este mes.</p>
      )}
    </section>
  );
};

export default FollowingSection;
