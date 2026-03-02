import React from 'react';
import { useHistory } from 'react-router-dom';
import { EventListItem } from '../types';
import EventPosterTile from '../components/EventPosterTile';
import { formatDate, getEventCoverImage, getPrimaryArtistName } from '../utils';

type FollowedFromArtistsSectionProps = {
  visible: boolean;
  events: EventListItem[];
};

const FollowedFromArtistsSection: React.FC<FollowedFromArtistsSectionProps> = ({ visible, events }) => {
  const history = useHistory();
  if (!visible) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">Following</p>
          <h3 className="mt-2 font-display text-xl font-bold text-white">From artists you follow</h3>
        </div>
        <button
          type="button"
          className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80 transition-colors hover:text-white"
          onClick={() => history.push('/tabs/map')}
        >
          Explore
        </button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-semibold text-white/90">No upcoming shows from artists you follow</p>
          <p className="mt-1 text-xs text-white/55">Open the map to find something new.</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {events.map(event => (
            <div key={event.id} className="w-[220px] shrink-0 overflow-hidden rounded-2xl border border-white/10">
              <EventPosterTile
                event={{ ...event, cover_image_url: getEventCoverImage(event) }}
                className="w-full"
                kicker={formatDate(event.starts_at)}
                title={getPrimaryArtistName(event)}
                subtitle={event.venue_place?.name || event.city}
                onSelect={selected => history.push(`/event/${selected.id}`)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default FollowedFromArtistsSection;
