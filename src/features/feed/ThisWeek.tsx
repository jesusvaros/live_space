import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CoverImage from '../../components/ui/CoverImage';
import GeneratedPoster from '../../components/ui/GeneratedPoster';
import { IconCalendar, IconPlay, IconUser } from '../../components/icons';
import HomeSectionHeader from '../events/sections/HomeSectionHeader';
import { useEventsList } from '../events/hooks/useEventsList';
import { inicioWindow } from '../events/inicioWindow';
import { getEventCoverSources, getPrimaryArtistName } from '../events/utils';
import { goingLabel, useGoingCounts } from '../events/goingCounts';
import type { EventListItem } from '../events/types';
import { THIS_WEEK_MAX_POSTERS, thisWeekEvents } from './thisWeekRules';

// «Momentos» while there are few clips: instead of a thin (or empty) feed,
// the week's concerts as posters, with the clips there are on top. The
// tab's name and icon stay; it becomes the clips feed once there are enough.

export type ThisWeekClip = {
  id: string;
  media_type?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  events?: { name?: string | null; cover_image_url?: string | null } | null;
};

const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace('.', '');
};

const clipImage = (clip: ThisWeekClip) =>
  clip.thumbnail_url || (clip.media_type === 'video' ? null : clip.media_url) || clip.events?.cover_image_url || null;

type ThisWeekProps = { city: string; clips: ThisWeekClip[] };

const ThisWeek: React.FC<ThisWeekProps> = ({ city, clips }) => {
  const navigate = useNavigate();
  const [{ startIso, endIso }] = React.useState(() => inicioWindow());
  const { events, loading } = useEventsList({ startIso, endIso, city });
  const all = useMemo(() => thisWeekEvents(events, Date.now()), [events]);
  const week = useMemo(() => all.slice(0, THIS_WEEK_MAX_POSTERS), [all]);
  const ids = useMemo(() => week.map(event => event.id), [week]);
  const going = useGoingCounts(ids);

  const open = (event: EventListItem) => navigate(`/event/${event.id}`);

  return (
    <div className="h-full overflow-y-auto bg-app-bg pb-[calc(110px+env(safe-area-inset-bottom,0px))] pt-[calc(18px+env(safe-area-inset-top,0px))]" data-scroll>
      <div className="px-4">
        <HomeSectionHeader
          title="Esta semana"
          kicker={all.length > 0 ? `${all.length} ${all.length === 1 ? 'concierto' : 'conciertos'} en ${city}` : city}
          icon={<IconCalendar size={20} />}
        />
      </div>

      {clips.length > 0 ? (
        <section aria-label="Lo último del público" className="pt-5">
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {clips.map(clip => {
              const image = clipImage(clip);
              return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => navigate(`/post/${clip.id}`)}
                  aria-label={`Momento de ${clip.events?.name || 'un concierto'}`}
                  className="relative h-[132px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-app-line bg-app-surface"
                >
                  {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : null}
                  {clip.media_type === 'video' ? (
                    <span className="absolute bottom-1.5 left-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                      <IconPlay size={14} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 pt-5">
        {loading && week.length === 0
          ? [0, 1, 2, 3].map(index => <div key={index} className="aspect-[3/4] animate-pulse rounded-2xl bg-app-surface" />)
          : week.map(event => {
              const artist = getPrimaryArtistName(event);
              const count = goingLabel(going.get(event.id));
              return (
                <button key={event.id} type="button" onClick={() => open(event)} className="min-w-0 text-left">
                  <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl border border-app-line bg-app-surface">
                    <CoverImage
                      sources={getEventCoverSources(event)}
                      className="absolute inset-0 h-full w-full object-cover"
                      fallback={<GeneratedPoster title={artist} variant="thumb" />}
                    />
                  </span>
                  <span className="mt-2 block font-mono text-[11px] font-semibold uppercase text-app-accent">{dayLabel(event.starts_at)}</span>
                  <span className="mt-0.5 block truncate font-display text-[15px] font-bold text-app-ink">{artist}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-white/55">
                    <span className="min-w-0 truncate">{event.venue_place?.name || event.address || city}</span>
                    {count ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-app-ink/75">
                        <IconUser size={11} />
                        {count}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
};

export default ThisWeek;
