import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserConcertHeroState } from '../hooks/useUserConcertHero';
import { getEventCoverImage, getPrimaryArtistName } from '../utils';
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

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const dayLabel = (iso: string) =>
  isToday(iso)
    ? 'Hoy'
    : new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');

const Chip: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => {
  const className =
    'inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-app-bg/70 px-2.5 py-[5px] font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-app-ink';
  const content = (
    <>
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-app-accent" aria-hidden />
      <span className="truncate">{children}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={className}>{content}</span>
  );
};

// Small photo hero: the hook ("Lo grabaste. Súbelo.") or the user's own next
// or last concert.
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

  const shell = 'relative mx-4 h-[200px] overflow-hidden rounded-[20px] bg-app-surface';
  const shade = <div className="absolute inset-0 bg-gradient-to-t from-app-bg/95 to-app-bg/20" />;
  const body = 'absolute inset-x-4 bottom-4 flex flex-col gap-2.5';
  const title = 'm-0 font-poster text-[46px] leading-[0.88] text-app-ink';

  if (state.kind === 'loading') {
    return <section className={`${shell} animate-pulse`} aria-hidden />;
  }

  if (state.kind === 'cold_start') {
    const current = featured.length ? featured[slide % featured.length] : null;
    return (
      <section className={shell}>
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
        {shade}
        <div className={body}>
          {current ? (
            <Chip onClick={() => navigate(`/event/${current.id}`)}>
              {dayLabel(current.starts_at)} · {getPrimaryArtistName(current)} · {getVenueName(current)}
            </Chip>
          ) : null}
          <h1 className={title}>
            Lo grabaste.
            <br />
            <span className="text-app-accent">Súbelo.</span>
          </h1>
        </div>
      </section>
    );
  }

  const image = getEventCoverImage(state.event) || FALLBACK_PHOTOS[0];
  const artist = getPrimaryArtistName(state.event);
  const venue = getVenueName(state.event);

  if (state.kind === 'upcoming') {
    return (
      <section className={shell}>
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {shade}
        <button type="button" className={`${body} text-left`} onClick={() => navigate(`/event/${state.event.id}`)}>
          <Chip>Vas · {dayLabel(state.event.starts_at)} · {venue}</Chip>
          <span className={`${title} line-clamp-2`}>{artist}</span>
        </button>
      </section>
    );
  }

  // just_attended
  return (
    <section className={shell}>
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {shade}
      {onDismissPendingMoments ? (
        <button
          type="button"
          className="absolute right-3 top-3 z-10 min-h-9 rounded-full border border-white/20 bg-black/40 px-3 text-xs font-semibold text-white/85 backdrop-blur-sm"
          onClick={() => onDismissPendingMoments(state.event.id)}
        >
          Descartar
        </button>
      ) : null}
      <div className={body}>
        <Chip>Anoche · {artist} · {venue}</Chip>
        <h1 className={title}>
          Lo grabaste.
          <br />
          <button
            type="button"
            className="text-app-accent underline-offset-4 hover:underline"
            onClick={() => navigate(`/tabs/upload?event=${state.event.id}`)}
          >
            Súbelo.
          </button>
        </h1>
      </div>
    </section>
  );
};

export default TimelineHeroSection;
