import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CoverImage from '../../components/ui/CoverImage';
import GeneratedPoster from '../../components/ui/GeneratedPoster';
import { getEventCoverSources, getPrimaryArtistName } from '../events/utils';
import type { EventListItem } from '../events/types';
import { concertDateLabel, splitConcerts } from './profileLayout';

// Past concerts show three rows of posters until «Ver todos».
const PAST_COLLAPSED = 9;

type PosterProps = {
  event: EventListItem;
  badge?: string | null;
  size: 'carousel' | 'grid';
  onSelect: () => void;
};

const Poster: React.FC<PosterProps> = ({ event, badge, size, onSelect }) => {
  const title = getPrimaryArtistName(event);
  const venue = event.venue_place?.name || event.city;
  const date = concertDateLabel(event.starts_at);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={[title, venue, date].filter(Boolean).join(', ')}
      className={`${size === 'carousel' ? 'w-[148px] shrink-0' : 'w-full'} text-left`}
    >
      <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-app-surface ring-1 ring-white/5">
        <CoverImage
          sources={getEventCoverSources(event, 'thumb')}
          className="absolute inset-0 h-full w-full object-cover"
          fallback={<GeneratedPoster title={title} variant={size === 'grid' ? 'thumb' : 'tile'} />}
        />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        {badge ? (
          <span className="absolute left-2 top-2 rounded-full bg-app-accent px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#14151a]">
            {badge}
          </span>
        ) : null}
        <span className="absolute inset-x-2 bottom-2">
          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-app-accent">{date}</span>
          <span
            className={`block font-display font-bold leading-tight text-white line-clamp-2 ${size === 'grid' ? 'text-[13px]' : 'text-[15px]'}`}
          >
            {title}
          </span>
          {size === 'carousel' && venue ? <span className="block truncate text-[12px] text-white/70">{venue}</span> : null}
        </span>
      </span>
    </button>
  );
};

type ConcertPostersProps = {
  events: EventListItem[];
  /** A small tag on an upcoming poster («Voy», «Guardado»). */
  badgeFor?: (event: EventListItem) => string | null;
};

// The concerts of the profile as posters: what is coming up in a carousel,
// what the user already lived as a wall of posters.
const ConcertPosters: React.FC<ConcertPostersProps> = ({ events, badgeFor }) => {
  const navigate = useNavigate();
  const { upcoming, past } = useMemo(() => splitConcerts(events), [events]);
  const [showAll, setShowAll] = useState(false);
  const shownPast = showAll ? past : past.slice(0, PAST_COLLAPSED);
  const open = (event: EventListItem) => navigate(`/event/${event.id}`);

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 ? (
        <section aria-labelledby="perfil-proximos" className="flex flex-col gap-2.5">
          <h3 id="perfil-proximos" className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
            Próximos · {upcoming.length}
          </h3>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {upcoming.map(event => (
              <Poster
                key={event.id}
                event={event}
                size="carousel"
                badge={badgeFor?.(event) ?? null}
                onSelect={() => open(event)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-labelledby="perfil-vividos" className="flex flex-col gap-2.5 px-4">
          <h3 id="perfil-vividos" className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
            Vividos · {past.length}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {shownPast.map(event => (
              <Poster key={event.id} event={event} size="grid" onSelect={() => open(event)} />
            ))}
          </div>
          {past.length > PAST_COLLAPSED ? (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll(value => !value)}
              className="min-h-10 self-start text-sm font-semibold text-app-accent"
            >
              {showAll ? 'Ver menos' : `Ver los ${past.length}`}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

export default ConcertPosters;
