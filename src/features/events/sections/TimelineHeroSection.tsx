import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserConcertHeroState } from '../hooks/useUserConcertHero';
import { getEventCoverImage } from '../utils';
import { EventListItem } from '../types';

type TimelineHeroSectionProps = {
  state: UserConcertHeroState;
  // Upcoming events with a photo, rotated behind the cold-start hero.
  featured?: EventListItem[];
  onDismissPendingMoments?: (eventId: string) => void;
};

// CC0 concert photos (same as the landing, see src/landing/photos.ts) for
// events that have no published photo yet.
const FALLBACK_PHOTOS = [
  '/auth/fondo-login.jpg',
  '/fotos/multitud-escenario.jpg',
  '/fotos/franja-luz-roja.jpg',
  '/fotos/manos-luz-azul.jpg',
  '/fotos/publico-escenario.jpg',
  '/fotos/festival-multitud.jpg',
];
const ROTATE_MS = 5000;

const getVenueName = (event: EventListItem) =>
  event.venue_place?.name || event.address || event.city || 'Sala';

const getPrimaryArtistName = (event: EventListItem) => {
  const artist = event.event_artists?.find(entry => entry.artist)?.artist;
  return artist?.name || event.name;
};

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' });

const TimelineHeroSection: React.FC<TimelineHeroSectionProps> = ({ state, featured = [], onDismissPendingMoments }) => {
  const navigate = useNavigate();
  const [slide, setSlide] = useState(0);
  const slides = Math.max(featured.length, FALLBACK_PHOTOS.length);

  useEffect(() => {
    if (state.kind !== 'cold_start' || slides < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setSlide(current => (current + 1) % slides), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [slides, state.kind]);

  const heroShellClass = 'relative h-[64vh] min-h-[420px] w-full overflow-hidden bg-black';
  const basePrimaryCtaClass =
    'inline-flex items-center justify-center rounded-full border border-app-accent/35 bg-app-accent px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none';
  const baseGhostCtaClass =
    'inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white/90 transition-colors hover:text-white';

  const hero = useMemo(() => {
    if (state.kind === 'loading') {
      return (
        <div className={heroShellClass}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(255,107,74,0.22),transparent_48%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(122,167,255,0.16),transparent_52%)]" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/72 to-transparent p-5 sm:p-6">
            <div className="h-8 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/10" />
            <div className="mt-5 h-11 w-44 animate-pulse rounded-full bg-white/10" />
          </div>
        </div>
      );
    }

    if (state.kind === 'cold_start') {
      const current = featured.length ? featured[slide % featured.length] : null;
      return (
        <div className={heroShellClass}>
          {Array.from({ length: slides }, (_, index) => (
            <img
              key={index}
              src={(featured[index] && getEventCoverImage(featured[index])) || FALLBACK_PHOTOS[index % FALLBACK_PHOTOS.length]}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 motion-reduce:transition-none ${
                index === slide % slides ? 'opacity-100' : 'opacity-0'
              }`}
              loading={index === 0 ? 'eager' : 'lazy'}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-5 pb-24 sm:p-6 sm:pb-28">
            {current ? (
              <button
                type="button"
                className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-left text-xs font-semibold text-white/90 backdrop-blur-sm"
                onClick={() => navigate(`/event/${current.id}`)}
              >
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-app-accent" aria-hidden="true" />
                <span className="truncate">
                  {getPrimaryArtistName(current)} · {formatShortDate(current.starts_at)}
                </span>
              </button>
            ) : null}
            <h2 className="font-display text-4xl font-bold leading-[0.95] text-white sm:text-5xl">
              Lo grabaste.
              <br />
              <span className="text-app-accent">Súbelo.</span>
            </h2>
            <p className="mt-3 max-w-xs text-sm text-white/75">
              Conciertos cerca de ti y lo que grabó el público, canción a canción.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                className={basePrimaryCtaClass}
                onClick={() => navigate('/tabs/map')}
              >
                Ver mapa
              </button>
              <button
                type="button"
                className={baseGhostCtaClass}
                onClick={() => navigate('/tabs/discover')}
              >
                Explorar
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (state.kind === 'upcoming') {
      const image = getEventCoverImage(state.event);
      const artist = getPrimaryArtistName(state.event);
      const venue = getVenueName(state.event);
      const date = formatShortDate(state.event.starts_at);
      return (
        <div className={heroShellClass}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(255,107,74,0.2),transparent_48%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_14%,rgba(122,167,255,0.16),transparent_54%)]" />
          {image ? (
            <img
              src={image}
              alt={state.event.name}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/58 to-black/22" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/65">
              Vas a ver a
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">{artist}</h2>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/82">{venue}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">{date}</p>
            <div className="mt-5">
              <button
                type="button"
                className={baseGhostCtaClass}
                onClick={() => navigate(`/event/${state.event.id}`)}
              >
                Ver concierto
              </button>
            </div>
          </div>
        </div>
      );
    }

    // just_attended
    const image = getEventCoverImage(state.event);
    const artist = getPrimaryArtistName(state.event);
    const venue = getVenueName(state.event);
    const date = formatShortDate(state.event.starts_at);
    return (
      <div className={heroShellClass}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(255,107,74,0.2),transparent_48%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_14%,rgba(122,167,255,0.16),transparent_54%)]" />
        {image ? (
          <img
            src={image}
            alt={state.event.name}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}
        {onDismissPendingMoments && (
          <button
            type="button"
            className="absolute right-4 top-4 z-10 rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur-sm"
            onClick={() => onDismissPendingMoments(state.event.id)}
          >
            Descartar
          </button>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/58 to-black/22" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/65">
            Anoche en {venue}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">{artist}</h2>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">{date}</p>
          <div className="mt-5">
            <button
              type="button"
              className={basePrimaryCtaClass}
              onClick={() => navigate(`/event/${state.event.id}`, { state: { openAddMoments: true } })}
            >
              Sube tus momentos
            </button>
          </div>
        </div>
      </div>
    );
  }, [baseGhostCtaClass, basePrimaryCtaClass, featured, heroShellClass, navigate, onDismissPendingMoments, slide, slides, state]);

  return <section>{hero}</section>;
};

export default TimelineHeroSection;
