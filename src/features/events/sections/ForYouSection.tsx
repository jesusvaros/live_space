import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GeneratedPoster from '../../../components/ui/GeneratedPoster';
import { FollowedEntity } from '../../../hooks/useFollowedEntities';
import { HistoryEntry } from '../../agenda/useConcertHistory';
import { eventCity, eventGenres, genreKey, sameCity } from '../../agenda/agendaPrefs';
import { EventListItem } from '../types';
import { getEventCoverImage, getPrimaryArtistName } from '../utils';

type ForYouSectionProps = {
  events: EventListItem[];
  city: string;
  entities: FollowedEntity[];
  tastes: string[];
  frequentVenues: HistoryEntry[];
  signedIn: boolean;
};

const MAX_ITEMS = 6;

type Pick = { event: EventListItem; score: number; reason: string; startsAt: number };

const dateLabel = (startsAt: number) => {
  const date = new Date(startsAt);
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return `Hoy · ${time}`;
  return `${date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '')} · ${time}`;
};

// "Para ti": the city's upcoming concerts ranked by who the user follows,
// then their genres, then the venues they go to most.
const ForYouSection: React.FC<ForYouSectionProps> = ({ events, city, entities, tastes, frequentVenues, signedIn }) => {
  const navigate = useNavigate();

  const picks = useMemo(() => {
    const artistIds = new Set(entities.filter(entity => entity.kind === 'artist').map(entity => entity.id));
    const venueIds = new Set(entities.filter(entity => entity.kind === 'venue').map(entity => entity.id));
    const festivalIds = new Set(entities.filter(entity => entity.kind === 'festival').map(entity => entity.id));
    const tasteKeys = new Set(tastes.map(genreKey));
    const venueVisits = new Map(frequentVenues.map(venue => [venue.id, venue.count]));
    // Tonight's concert stays listed for a few hours after doors.
    const from = Date.now() - 4 * 60 * 60 * 1000;
    const list: Pick[] = [];
    for (const event of events) {
      const startsAt = new Date(event.starts_at).getTime();
      if (startsAt < from || !sameCity(eventCity(event), city)) continue;
      const followedArtist = (event.event_artists || []).find(entry => entry.artist?.id && artistIds.has(entry.artist.id))?.artist;
      const followedVenue = Boolean(event.venue_place?.id && venueIds.has(event.venue_place.id));
      const followedFestival = Boolean(event.festival_id && festivalIds.has(event.festival_id));
      const genres = [...new Set(eventGenres(event).filter(genre => tasteKeys.has(genreKey(genre))))];
      const visits = event.venue_place?.id ? venueVisits.get(event.venue_place.id) || 0 : 0;
      // Tiers dominate: any follow beats any genre, any genre beats a usual venue.
      const score =
        (followedArtist || followedVenue || followedFestival ? 10_000 : 0) + Math.min(genres.length, 9) * 100 + Math.min(visits, 99);
      if (score === 0) continue;
      const reason = followedArtist
        ? `Sigues a ${followedArtist.name}`
        : followedFestival
          ? 'Sigues el festival'
          : followedVenue
            ? 'Sigues la sala'
            : genres.length > 0
              ? `Te gusta: ${genres.slice(0, 2).join(', ').toLocaleLowerCase('es')}`
              : `Has ido ${visits} ${visits === 1 ? 'vez' : 'veces'} a esta sala`;
      list.push({ event, score, reason, startsAt });
    }
    list.sort((left, right) => right.score - left.score || left.startsAt - right.startsAt);
    return list.slice(0, MAX_ITEMS);
  }, [city, entities, events, frequentVenues, tastes]);

  const hasSignals = entities.length > 0 || tastes.length > 0 || frequentVenues.length > 0;

  if (!signedIn) {
    return (
      <p className="px-4 pt-5 text-sm text-white/65">
        <Link to="/welcome" className="font-semibold text-app-accent">Entra</Link>{' '}
        y te recomendamos conciertos según lo que te gusta.
      </p>
    );
  }

  return (
    <section aria-labelledby="para-ti" className="flex flex-col gap-3 px-4 pt-[22px]">
      <div className="flex items-center justify-between">
        <h2 id="para-ti" className="font-display text-2xl font-bold text-app-ink">Para ti</h2>
        <Link
          to="/empezar"
          state={{ returnTo: '/tabs/events' }}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-app-accent"
        >
          {hasSignals ? 'Ajustar' : 'Configurar'}
        </Link>
      </div>

      {!hasSignals ? (
        <div className="rounded-2xl border border-dashed border-app-line p-5">
          <p className="text-sm text-white/70">
            Dinos tu ciudad, qué música te gusta y a quién sigues, y aquí verás tus próximos conciertos.
          </p>
          <button
            type="button"
            onClick={() => navigate('/empezar', { state: { returnTo: '/tabs/events' } })}
            className="mt-3 min-h-11 rounded-full bg-app-accent px-4 text-sm font-semibold text-[#14151a]"
          >
            Configurar mi agenda
          </button>
        </div>
      ) : picks.length === 0 ? (
        <p className="text-[13px] text-white/55">Nada que encaje contigo en {city} este mes todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {picks.map(({ event, reason, startsAt }) => {
            const cover = getEventCoverImage(event);
            const artist = getPrimaryArtistName(event);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/event/${event.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-2 text-left"
                >
                  <span className="relative h-[64px] w-[52px] shrink-0 overflow-hidden rounded-[10px]">
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <GeneratedPoster title={artist} variant="thumb" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] font-semibold uppercase text-app-accent">{dateLabel(startsAt)}</span>
                    <span className="block truncate font-display text-base font-bold text-app-ink">{artist}</span>
                    <span className="block truncate text-[13px] text-[#c9c5bd]">
                      {event.venue_place?.name || city} · {reason}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ForYouSection;
