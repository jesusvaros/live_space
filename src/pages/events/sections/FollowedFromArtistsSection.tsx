import React from 'react';
import { useHistory } from 'react-router-dom';
import { EventListItem } from '../types';
import EventPosterTile from '../../../components/EventPosterTile';
import { formatDate, getEventCoverImage, getPrimaryArtistName } from '../utils';

type FollowedFromArtistsSectionProps = {
  visible: boolean;
  events: EventListItem[];
};

const FollowedFromArtistsSection: React.FC<FollowedFromArtistsSectionProps> = ({ visible, events }) => {
  const history = useHistory();
  if (!visible) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Following</p>
          <h3 className="mt-2 font-display text-xl text-slate-50">From artists you follow</h3>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
          onClick={() => history.push('/tabs/map')}
        >
          Explore
        </button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-200">No upcoming concerts from artists you follow</p>
          <p className="mt-1 text-xs text-slate-500">Explore the map to find something new.</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {events.map(event => (
            <EventPosterTile
              key={event.id}
              event={{ ...event, cover_image_url: getEventCoverImage(event) }}
              className="w-[220px] shrink-0"
              kicker={formatDate(event.starts_at)}
              title={getPrimaryArtistName(event)}
              subtitle={event.venue_place?.name || event.city}
              onSelect={selected => history.push(`/event/${selected.id}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default FollowedFromArtistsSection;
