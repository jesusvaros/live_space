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
    <section className="app-card space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-[0.3em] text-slate-400">Venue</p>
        </div>
        <button
          type="button"
          className="app-button app-button--ghost app-button--small"
          onClick={onToggleVenueMode}
        >
          {venueMode === 'existing' ? 'New venue' : 'Use existing'}
        </button>
      </div>

      <input
        type="search"
        className="app-search"
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
          {venueMarkers.map(marker => (
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
            <p className="text-sm text-slate-500 h-[72px] ">
              No venues found. Switch to &quot;New venue&quot; to add one.
            </p>
          ) : (
            <div className="grid h-[72px] grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-auto pr-1">
              {visibleVenues.map(venue => (
                <div
                  key={venue.id}
                  className={`flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-left text-[11px] font-semibold text-slate-100 transition ${
                    selectedVenue?.id === venue.id
                      ? 'border-orange-400/60 bg-orange-500/20 text-orange-100'
                      : 'border-white/10 bg-white/5'
                  }`}
                  onClick={() => onSelectVenue(venue)}
                >
                  <span className="truncate text-slate-50">{venue.name}</span>
                  <span className="text-[10px] text-slate-400">{venue.city}</span>
                </div>
              ))}
            </div>
          )}

          {selectedVenue ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div>
                <p className="text-sm text-slate-50">{selectedVenue.name}</p>
                <p className="text-xs text-slate-400">
                  {selectedVenue.city}
                  {selectedVenue.address ? ` · ${selectedVenue.address}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="app-button app-button--ghost app-button--small"
                onClick={onClearVenue}
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"> 
                <p className="text-sm text-slate-50">Select a venue to continue</p>
            </div>
          )}
        </>
      )}

      {venueMode === 'new' && (
        <div className="space-y-3">
          <label className="app-field">
            <span className="app-label">Venue name</span>
            <input
              className="app-input"
              value={newVenueName}
              onChange={e => onNewVenueNameChange(e.target.value)}
              placeholder="Venue name"
            />
          </label>
          <label className="app-field">
            <span className="app-label">City</span>
            <input
              className="app-input"
              value={newVenueCity}
              onChange={e => onNewVenueCityChange(e.target.value)}
              placeholder="City"
            />
          </label>
          <label className="app-field">
            <span className="app-label">Address</span>
            <input
              className="app-input"
              value={newVenueAddress}
              onChange={e => onNewVenueAddressChange(e.target.value)}
              placeholder="Street address"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="app-field">
              <span className="app-label">Latitude</span>
              <input
                className="app-input"
                value={newVenueLat}
                onChange={e => onNewVenueLatChange(e.target.value)}
                placeholder="41.3874"
              />
            </label>
            <label className="app-field">
              <span className="app-label">Longitude</span>
              <input
                className="app-input"
                value={newVenueLng}
                onChange={e => onNewVenueLngChange(e.target.value)}
                placeholder="2.1686"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">Tap the map to set the venue coordinates.</p>
        </div>
      )}
    </section>
  );
};

export default CreateEventVenueStep;
