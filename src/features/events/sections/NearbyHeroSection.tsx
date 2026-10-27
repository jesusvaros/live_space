import React from 'react';
import { Spinner } from '../../../components/ui/AppPrimitives';
import { useNavigate } from 'react-router-dom';
import { NearbyEventListItem } from '../types';
import { formatDate, formatDistance, getEventCoverImage, getPrimaryArtistName } from '../utils';
import EventPosterTile from '../components/EventPosterTile';

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
  const navigate = useNavigate();

  return (
    <section className="animate-fade-up space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 motion-reduce:animate-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">Conciertos cerca de ti</p>
          <p className="mt-2 text-sm text-white/65">Hoy y las próximas dos semanas.</p>
        </div>
        {canCreateEvent && (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-app-accent/40 bg-app-accent/20 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-app-accent/30"
              onClick={() => navigate('/create-event')}
            >
              Crear evento
            </button>
          </div>
        )}
      </div>

      {locationError && <p className="text-xs text-rose-400">{locationError}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          {loadError && <p className="text-sm text-rose-400">{loadError}</p>}

          {!location ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white/90">Mira los conciertos cerca de ti</p>
              <p className="mt-1 text-xs text-white/55">Usa tu ubicación para ver eventos cercanos y distancias.</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  onClick={onRequestLocation}
                  disabled={locationLoading}
                >
                  Usar mi ubicación
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90"
                  onClick={() => navigate('/tabs/map')}
                >
                  Explorar mapa
                </button>
              </div>
            </div>
          ) : nearbyUpcoming.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white/90">Hoy no hay conciertos cerca</p>
              <p className="mt-1 text-xs text-white/55">Mira el mapa para ver qué se mueve a tu alrededor.</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => navigate('/tabs/map')}
                >
                  Explorar mapa
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {nearbyUpcoming.slice(0, 10).map(event => {
                return (
                  <div key={event.id} className="w-[220px] shrink-0 overflow-hidden rounded-2xl border border-white/10">
                    <EventPosterTile
                      event={{ ...event, cover_image_url: getEventCoverImage(event) }}
                      className="w-full"
                      kicker={formatDate(event.starts_at)}
                      title={getPrimaryArtistName(event)}
                      subtitle={event.venue_place?.name || event.city}
                      badge={formatDistance(event.distanceKm)}
                      onSelect={selected => navigate(`/event/${selected.id}`)}
                    />
                  </div>
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
