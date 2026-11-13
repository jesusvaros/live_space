import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CoverImage from '../../components/ui/CoverImage';
import GeneratedPoster from '../../components/ui/GeneratedPoster';
import VideoThumb from '../../components/ui/VideoThumb';
import { IconChevronRight, IconPlay } from '../../components/icons';
import { getEventCoverSources } from '../events/utils';
import type { EventListItem } from '../events/types';
import { concertDateLabel, groupMomentsByConcert, lineupLabel, type MomentConcert, type ProfileMoment } from './profileLayout';

// A group shows two rows until it is opened.
const COLLAPSED = 6;

const MomentTile: React.FC<{ moment: ProfileMoment; onSelect: () => void }> = ({ moment, onSelect }) => {
  const isVideo = moment.media_type === 'video';
  const still = moment.thumbnail_url || (!isVideo ? moment.media_url : null);
  const label = moment.caption || (isVideo ? 'Vídeo' : 'Foto');
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative aspect-[3/4] overflow-hidden rounded-xl bg-app-surface"
    >
      {still ? (
        <img src={still} alt={label} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <VideoThumb src={moment.media_url} label={label} />
      )}
      {isVideo ? (
        <span aria-hidden className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
          <IconPlay size={12} />
        </span>
      ) : null}
    </button>
  );
};

const ConcertHeader: React.FC<{ concert: MomentConcert; count: number; onSelect: () => void }> = ({ concert, count, onSelect }) => {
  const title = lineupLabel(concert.artists, concert.name);
  const meta = [concertDateLabel(concert.startsAt), concert.venueName || concert.city].filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 text-left">
      <span className="relative h-[52px] w-[42px] shrink-0 overflow-hidden rounded-lg bg-app-surface">
        <CoverImage
          sources={concert.card ? getEventCoverSources(concert.card, 'thumb') : []}
          className="absolute inset-0 h-full w-full object-cover"
          fallback={<GeneratedPoster title={title} variant="thumb" />}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-bold leading-tight text-app-ink">{title}</span>
        {meta ? (
          <span className="mt-0.5 block truncate font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-app-accent">
            {meta}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-xs text-white/55">
        {count} {count === 1 ? 'momento' : 'momentos'}
        <IconChevronRight size={16} />
      </span>
    </button>
  );
};

type MomentsByConcertProps = {
  moments: ProfileMoment[];
  /** Concert cards by id: lineup and poster for each header. */
  cards?: ReadonlyMap<string, EventListItem>;
};

// The user's moments as a gallery, one block per concert, the latest concert first.
const MomentsByConcert: React.FC<MomentsByConcertProps> = ({ moments, cards }) => {
  const navigate = useNavigate();
  const groups = useMemo(() => groupMomentsByConcert(moments, cards), [moments, cards]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  return (
    <div className="flex flex-col gap-6 px-4">
      {groups.map(group => {
        const expanded = open.has(group.concert.id);
        const shown = expanded ? group.moments : group.moments.slice(0, COLLAPSED);
        const hidden = group.moments.length - shown.length;
        return (
          <section key={group.concert.id} aria-label={lineupLabel(group.concert.artists, group.concert.name)} className="flex flex-col gap-2.5">
            <ConcertHeader
              concert={group.concert}
              count={group.moments.length}
              onSelect={() => navigate(`/event/${group.concert.id}`)}
            />
            <div className="grid grid-cols-3 gap-1.5">
              {shown.map(moment => (
                <MomentTile key={moment.id} moment={moment} onSelect={() => navigate(`/post/${moment.id}`)} />
              ))}
            </div>
            {hidden > 0 || expanded ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() =>
                  setOpen(current => {
                    const next = new Set(current);
                    if (next.has(group.concert.id)) next.delete(group.concert.id);
                    else next.add(group.concert.id);
                    return next;
                  })
                }
                className="min-h-10 self-start text-sm font-semibold text-app-accent"
              >
                {expanded ? 'Ver menos' : `Ver ${hidden} más`}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
};

export default MomentsByConcert;
