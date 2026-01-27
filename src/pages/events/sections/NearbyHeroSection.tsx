import React from 'react';
import { IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { NearbyEventListItem } from '../types';
import { formatDate, formatDistance, getEventCoverImage, getPrimaryArtistName } from '../utils';
import EventPosterTile from '../../../components/EventPosterTile';

type NearbyHeroSectionProps = {
  canCreateEvent: boolean;
  loading: boolean;
  loadError: string;
  location: { lat: number; lng: number } | null;
  locationLoading: boolean;
  locationError: string;
  onRequestLocation: () => void;
  nearbyUpcoming: NearbyEventListItem[];
};

const NearbyHeroSection: React.FC<NearbyHeroSectionProps> = ({
  canCreateEvent,
  loading,
  loadError,
  location,
  locationLoading,
  locationError,
  onRequestLocation,
  nearbyUpcoming,
}) => {
  const history = useHistory();

  return (
    <section className="animate-fade-up motion-reduce:animate-none space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Concerts near you</p>
          <p className="mt-2 text-sm text-white/55">Today + the next two weeks.</p>
        </div>
        {canCreateEvent && (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
              onClick={() => history.push('/create-event')}
            >
              Create event
            </button>
          </div>
        )}
      </div>

      {locationError && <p className="text-xs text-rose-400">{locationError}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <IonSpinner name="crescent" />
        </div>
      ) : (
        <>
          {loadError && <p className="text-sm text-rose-400">{loadError}</p>}

          {!location ? (
            <div className="bg-white/5 p-5">
              <p className="text-sm font-semibold text-white/90">See concerts near you</p>
              <p className="mt-1 text-xs text-white/55">Use your location to get nearby events and distances.</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="bg-white/10 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={onRequestLocation}
                  disabled={locationLoading}
                >
                  Use my location
                </button>
                <button
                  type="button"
                  className="bg-white/10 px-4 py-2 text-sm font-semibold text-white/90"
                  onClick={() => history.push('/tabs/map')}
                >
                  Explore map
                </button>
              </div>
            </div>
          ) : nearbyUpcoming.length === 0 ? (
            <div className="bg-white/5 p-5">
              <p className="text-sm font-semibold text-white/90">No concerts nearby today</p>
              <p className="mt-1 text-xs text-white/55">Try the map to explore what’s happening around you.</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => history.push('/tabs/map')}
                >
                  Explore map
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {nearbyUpcoming.slice(0, 10).map(event => {
                return (
                  <EventPosterTile
                    key={event.id}
                    event={{ ...event, cover_image_url: getEventCoverImage(event) }}
                    className="w-[220px] shrink-0"
                    kicker={formatDate(event.starts_at)}
                    title={getPrimaryArtistName(event)}
                    subtitle={event.venue_place?.name || event.city}
                    badge={formatDistance(event.distanceKm)}
                    onSelect={selected => history.push(`/event/${selected.id}`)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default NearbyHeroSection;
