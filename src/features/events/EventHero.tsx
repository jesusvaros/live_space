import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconFlag } from '../../components/icons';
import Avatar from '../../components/ui/Avatar';
import CoverImage from '../../components/ui/CoverImage';
import GeneratedPoster from '../../components/ui/GeneratedPoster';
import { eventCoverSources } from '../../lib/eventCover';
import type { Artist, Event, VenuePlace } from '../../lib/types';

// The top of the concert page: the poster with the date, the headliner and
// the tour, then the festival link and the line-up and venue chips. The
// same before the concert and after it (where the full-screen player sits
// right below).

type EventHeroProps = {
  event: Event;
  title: string;
  tourName: string;
  kicker: string | null;
  artists: Artist[];
  venue: VenuePlace | null;
  festival: { id: string; name: string } | null;
  isFollowing: (subjectId: string) => boolean;
};

const EventHero: React.FC<EventHeroProps> = ({ event, title, tourName, kicker, artists, venue, festival, isFollowing }) => {
  const navigate = useNavigate();
  return (
    <>
      <section className="relative h-[380px] overflow-hidden">
        <CoverImage
          sources={eventCoverSources(event, 'card')}
          eager
          className="absolute inset-0 h-full w-full object-cover"
          fallback={<GeneratedPoster title={title} variant="hero" />}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,#0d0e12_4%,rgba(13,14,18,0.3)_55%,rgba(13,14,18,0.55))]" />
        <div className="absolute inset-x-4 bottom-1.5">
          {kicker ? <p className="font-mono text-[12px] font-semibold tracking-[0.06em] text-app-accent">{kicker}</p> : null}
          <h1 className={`mt-1.5 font-poster leading-[0.86] text-app-ink ${title.length > 14 ? 'text-[46px]' : 'text-[64px]'}`}>
            {title}
          </h1>
          {tourName ? <p className="mt-1.5 line-clamp-2 text-[15px] text-[#e4e0d8]">{tourName}</p> : null}
        </div>
      </section>

      {festival || venue || artists.length ? (
        <div className="flex flex-col gap-3 px-4 pt-3.5">
          {festival ? (
            <button
              type="button"
              onClick={() => navigate(`/tabs/festival/${festival.id}`)}
              className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-app-accent/50 bg-app-accent/10 px-3.5 text-left"
            >
              <IconFlag size={18} className="text-app-accent" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-app-accent">Parte del festival</span>
                <span className="block truncate font-display text-[15px] font-bold text-app-ink">{festival.name}</span>
              </span>
            </button>
          ) : null}
          {venue || artists.length ? (
            <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none]">
              {artists.map(artist => (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() => navigate(`/tabs/artist/${artist.id}`)}
                  className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 text-center"
                >
                  <Avatar name={artist.name} src={artist.avatar_url} kind="artist" className="h-[76px] w-[76px] text-2xl" />
                  <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-app-ink">{artist.name}</span>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-app-accent">
                    {artist.subject_id && isFollowing(artist.subject_id) ? 'Lo sigues' : 'Artista'}
                  </span>
                </button>
              ))}
              {venue ? (
                <button
                  type="button"
                  onClick={() => navigate(`/tabs/venue/${venue.id}`)}
                  className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 text-center"
                >
                  <Avatar
                    name={venue.name}
                    src={venue.cover_image_url || (venue.photos || [])[0]}
                    kind="venue"
                    className="h-[76px] w-[76px] text-2xl"
                  />
                  <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-app-ink">{venue.name}</span>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#a9a59d]">
                    {venue.city || 'Sala'}
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

export default EventHero;
