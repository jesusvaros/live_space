import React from 'react';
import { IonSpinner } from '@ionic/react';
import { MapContainer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { VenuePlace } from '../../../lib/types';
import MapLibreLayer from '../../MapLibreLayer';
import MapResizeObserver from '../../MapResizeObserver';
import { MapBoundsWatcher, MapFocus, VenueMapClick } from './MapHelpers';

export type VenueMarker = {
  venue: VenuePlace;
  position: [number, number];
  icon: L.DivIcon;
};

type CreateEventVenueStepProps = {
  venueMode: 'existing' | 'new';
  onToggleVenueMode: () => void;
  venueSearch: string;
  onVenueSearchChange: (value: string) => void;
  mapCenter: [number, number];
  venueMarkers: VenueMarker[];
  newVenueIcon: L.DivIcon;
  visibleVenues: VenuePlace[];
  venuesLoading: boolean;
  selectedVenue: VenuePlace | null;
  onSelectVenue: (venue: VenuePlace) => void;
  onClearVenue: () => void;
  onBoundsChange: (bounds: L.LatLngBounds) => void;
  onMapSelect: (lat: number, lng: number) => void;
  venueLat: number | null;
  venueLng: number | null;
  newVenueName: string;
  newVenueCity: string;
  newVenueAddress: string;
  newVenueLat: string;
  newVenueLng: string;
  onNewVenueNameChange: (value: string) => void;
  onNewVenueCityChange: (value: string) => void;
  onNewVenueAddressChange: (value: string) => void;
  onNewVenueLatChange: (value: string) => void;
  onNewVenueLngChange: (value: string) => void;
};

const CreateEventVenueStep: React.FC<CreateEventVenueStepProps> = ({
  venueMode,
  onToggleVenueMode,
  venueSearch,
  onVenueSearchChange,
  mapCenter,
  venueMarkers,
  newVenueIcon,
  visibleVenues,
  venuesLoading,
  selectedVenue,
  onSelectVenue,
  onClearVenue,
  onBoundsChange,
  onMapSelect,
  venueLat,
  venueLng,
  newVenueName,
  newVenueCity,
  newVenueAddress,
  newVenueLat,
  newVenueLng,
  onNewVenueNameChange,
  onNewVenueCityChange,
  onNewVenueAddressChange,
  onNewVenueLatChange,
  onNewVenueLngChange,
}) => {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.45)] h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-[0.3em] text-slate-400">Venue</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full  text-sm font-semibold text-[#ffd1c4]"
          onClick={onToggleVenueMode}
        >
          {venueMode === 'existing' ? 'New venue' : 'Use existing'}
        </button>
      </div>

      <input
        type="search"
        className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 shadow-[0_16px_32px_rgba(0,0,0,0.4)] placeholder:text-slate-500"
        placeholder="Search venues"
        value={venueSearch}
        onChange={e => onVenueSearchChange(e.target.value)}
      />

      <div className="h-[220px] overflow-hidden rounded-2xl border border-white/10">
        <MapContainer
          center={mapCenter}
          zoom={12}
          className="h-full w-full"
          zoomControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <MapLibreLayer />
          <MapResizeObserver />
          {venueMode === 'existing' &&
            venueMarkers.map(marker => (
              <Marker
                key={marker.venue.id}
                position={marker.position}
                icon={marker.icon}
                eventHandlers={{
                  click: () => onSelectVenue(marker.venue),
                }}
              />
            ))}
          {venueMode === 'new' && venueLat !== null && venueLng !== null && (
            <Marker position={[venueLat, venueLng]} icon={newVenueIcon} />
          )}
          <MapFocus center={mapCenter} />
          <MapBoundsWatcher onChange={onBoundsChange} />
          <VenueMapClick enabled={venueMode === 'new'} onSelect={onMapSelect} />
        </MapContainer>
      </div>

      {venueMode === 'existing' && (
        <>
          {venuesLoading ? (
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <IonSpinner name="crescent" />
              Loading venues...
            </div>
          ) : visibleVenues.length === 0 ? (
            <p className="h-[250px] text-sm text-slate-500">
              No venues found. Switch to &quot;New venue&quot; to add one.
            </p>
          ) : (
            <div className="overflow-auto pr-1 max-h-[250px]" >
              <div className="space-y-3">
                {visibleVenues.map(venue => (
                  <div
                    key={venue.id}
                    className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
                      selectedVenue?.id === venue.id
                        ? 'border-orange-400/60 bg-gradient-to-r from-orange-500/20 to-orange-600/10 text-orange-100 shadow-lg shadow-orange-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                    onClick={() => onSelectVenue(venue)}
                  >
                    {/* Venue Image */}
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-slate-700 to-slate-800 flex-shrink-0">
                      {venue.photos && venue.photos.length > 0 ? (
                        <img 
                          src={venue.photos[0]} 
                          alt={venue.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      )}
                    </div>
                    
                    {/* Venue Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-50 mb-1">
                        {venue.name}
                      </h3>
                      <p className="text-xs text-slate-400 mb-1">
                        {venue.city}
                        {venue.address ? ` · ${venue.address}` : ''}
                      </p>
                      {venue.venue_type && (
                        <p className="text-xs text-slate-500">
                          {venue.venue_type}
                          {venue.capacity ? ` · Capacity: ${venue.capacity}` : ''}
                        </p>
                      )}
                    </div>
                    
                    {/* Selection Indicator */}
                    {selectedVenue?.id === venue.id && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white flex-shrink-0">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </>
      )}

      {venueMode === 'new' && (
        <div className="space-y-3">
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Venue name
            </span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
              value={newVenueName}
              onChange={e => onNewVenueNameChange(e.target.value)}
              placeholder="Venue name"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">City</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
              value={newVenueCity}
              onChange={e => onNewVenueCityChange(e.target.value)}
              placeholder="City"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Address</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
              value={newVenueAddress}
              onChange={e => onNewVenueAddressChange(e.target.value)}
              placeholder="Street address"
            />
          </label>
        </div>
      )}
    </section>
  );
};

export default CreateEventVenueStep;
