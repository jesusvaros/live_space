import React, { useEffect, useMemo, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../../lib/supabase';
import { Profile, ProfileRole, VenuePlace } from '../../lib/types';
import MapLibreLayer from '../MapLibreLayer';
import MapResizeObserver from '../MapResizeObserver';

type ArtistOption = Pick<Profile, 'id' | 'display_name' | 'username' | 'role'>;
type PriceTier = { label: string; price: number };

type CreateEventModalProps = {
  onDismiss: () => void;
  onCreated?: (eventId: string) => void;
  userId?: string | null;
  profileRole?: ProfileRole | null;
  profileCity?: string | null;
  profileName?: string | null;
};

const defaultCenter: [number, number] = [41.3874, 2.1686];

const formatLocalDateTime = (value: Date) => {
  const offset = value.getTimezoneOffset();
  const adjusted = new Date(value.getTime() - offset * 60000);
  return adjusted.toISOString().slice(0, 16);
};

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildPinIcon = (variant: 'venue', label: string, imageUrl?: string | null) => {
  const safeUrl = imageUrl ? encodeURI(imageUrl).replace(/'/g, '%27') : '';
  const avatar = imageUrl
    ? `<div class="map-pin-avatar" style="background-image:url('${safeUrl}')"></div>`
    : '<div class="map-pin-avatar map-pin-avatar--empty"></div>';
  const html = `
    <div class="map-pin map-pin--${variant}">
      ${avatar}
      <span class="map-pin-label">${label}</span>
    </div>
  `;
  return L.divIcon({
    className: 'map-pin-wrapper',
    html,
    iconSize: [52, 60],
    iconAnchor: [26, 60],
    popupAnchor: [0, -54],
  });
};

const MapFocus: React.FC<{ center: [number, number] | null }> = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    map.setView(center);
  }, [center, map]);

  return null;
};

const VenueMapClick: React.FC<{ enabled: boolean; onSelect: (lat: number, lng: number) => void }> = ({
  enabled,
  onSelect,
}) => {
  useMapEvents({
    click: event => {
      if (!enabled) return;
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
};

const CreateEventModal: React.FC<CreateEventModalProps> = ({
  onDismiss,
  onCreated,
  userId,
  profileRole,
  profileCity,
  profileName,
}) => {
  const [venues, setVenues] = useState<VenuePlace[]>([]);
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [venueSearch, setVenueSearch] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<VenuePlace | null>(null);
  const [venueMode, setVenueMode] = useState<'existing' | 'new'>('existing');
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueCity, setNewVenueCity] = useState(profileCity || '');
  const [newVenueAddress, setNewVenueAddress] = useState('');
  const [newVenueLat, setNewVenueLat] = useState('');
  const [newVenueLng, setNewVenueLng] = useState('');

  const [eventName, setEventName] = useState('');
  const [eventStart, setEventStart] = useState(formatLocalDateTime(new Date()));
  const [eventEnd, setEventEnd] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventUrl, setEventUrl] = useState('');
  const [eventCoverUrl, setEventCoverUrl] = useState('');
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [eventGenres, setEventGenres] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [isFree, setIsFree] = useState(true);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [tierLabel, setTierLabel] = useState('');
  const [tierPrice, setTierPrice] = useState('');

  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(defaultCenter);

  const organizerAllowed = Boolean(profileRole && ['artist', 'venue', 'label'].includes(profileRole));

  useEffect(() => {
    setError('');
    setVenueSearch('');
    setSelectedVenue(null);
    setVenueMode('existing');
    setNewVenueName('');
    setNewVenueCity(profileCity || '');
    setNewVenueAddress('');
    setNewVenueLat('');
    setNewVenueLng('');
    setEventName('');
    setEventStart(formatLocalDateTime(new Date()));
    setEventEnd('');
    setEventDescription('');
    setEventUrl('');
    setEventCoverUrl('');
    setPosterFile(null);
    setPosterPreview(null);
    setEventGenres('');
    setShowOptional(false);
    setIsFree(true);
    setPriceTiers([]);
    setTierLabel('');
    setTierPrice('');
    setSelectedArtistId(null);
    setMapCenter(defaultCenter);
  }, [profileCity]);

  useEffect(() => {
    const loadVenues = async () => {
      setVenuesLoading(true);
      const { data, error: venueError } = await supabase
        .from('venue_places')
        .select('id, name, city, address, latitude, longitude, website_url, photos')
        .order('name', { ascending: true });
      if (venueError) {
        setError('Unable to load venues.');
        setVenues([]);
      } else {
        setVenues((data || []) as VenuePlace[]);
      }
      setVenuesLoading(false);
    };

    const loadArtists = async () => {
      if (profileRole === 'artist') return;
      setArtistsLoading(true);
      const { data, error: artistError } = await supabase
        .from('profiles')
        .select('id, display_name, username, role')
        .eq('role', 'artist')
        .order('display_name', { ascending: true });
      if (artistError) {
        setError('Unable to load artists.');
        setArtists([]);
      } else {
        setArtists((data || []) as ArtistOption[]);
      }
      setArtistsLoading(false);
    };

    loadVenues();
    loadArtists();
  }, [profileRole]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      position => {
        setMapCenter([position.coords.latitude, position.coords.longitude]);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    if (!posterFile) {
      setPosterPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(posterFile);
    setPosterPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [posterFile]);

  const filteredVenues = useMemo(() => {
    const query = venueSearch.trim().toLowerCase();
    if (!query) return venues;
    return venues.filter(venue => {
      return (
        venue.name.toLowerCase().includes(query) ||
        venue.city.toLowerCase().includes(query) ||
        venue.address?.toLowerCase().includes(query)
      );
    });
  }, [venues, venueSearch]);

  const selectVenue = (venue: VenuePlace) => {
    setSelectedVenue(venue);
    setVenueMode('existing');
    const lat = toNumber(venue.latitude);
    const lng = toNumber(venue.longitude);
    if (lat !== null && lng !== null) {
      setMapCenter([lat, lng]);
    }
  };

  const handleMapSelect = (lat: number, lng: number) => {
    setVenueMode('new');
    setSelectedVenue(null);
    setNewVenueLat(lat.toFixed(6));
    setNewVenueLng(lng.toFixed(6));
    setMapCenter([lat, lng]);
  };

  const venueCity = venueMode === 'existing' ? selectedVenue?.city || '' : newVenueCity.trim();
  const venueAddress = venueMode === 'existing' ? selectedVenue?.address || '' : newVenueAddress.trim();
  const venueLat = venueMode === 'existing' ? toNumber(selectedVenue?.latitude) : toNumber(newVenueLat);
  const venueLng = venueMode === 'existing' ? toNumber(selectedVenue?.longitude) : toNumber(newVenueLng);

  const getArtistLabel = (artist: ArtistOption) =>
    artist.display_name || artist.username || 'Artist';

  const addPriceTier = () => {
    setError('');
    const label = tierLabel.trim();
    const priceValue = Number(tierPrice);
    if (!label) {
      setError('Price tier name is required.');
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setError('Enter a valid price.');
      return;
    }
    setPriceTiers(prev => [...prev, { label, price: priceValue }]);
    setTierLabel('');
    setTierPrice('');
  };

  const removePriceTier = (index: number) => {
    setPriceTiers(prev => prev.filter((_, idx) => idx !== index));
  };

  const sanitizeFilename = (value: string) =>
    value.replace(/[^a-zA-Z0-9._-]/g, '-');

  const handleCreate = async () => {
    if (!organizerAllowed) {
      setError('Only artists, venues, and labels can create events.');
      return;
    }
    if (!userId) {
      setError('Sign in to create events.');
      return;
    }
    if (!eventName.trim()) {
      setError('Event name is required.');
      return;
    }
    if (!eventStart) {
      setError('Start time is required.');
      return;
    }
    if (!isFree && priceTiers.length === 0) {
      setError('Add at least one price tier.');
      return;
    }
    if (venueMode === 'existing' && !selectedVenue) {
      setError('Select a venue place.');
      return;
    }
    if (venueMode === 'new') {
      if (!newVenueName.trim()) {
        setError('Venue name is required.');
        return;
      }
      if (!newVenueCity.trim()) {
        setError('Venue city is required.');
        return;
      }
      if (venueLat === null || venueLng === null) {
        setError('Select a location on the map.');
        return;
      }
    }
    const artistId = selectedArtistId || (profileRole === 'artist' ? userId : null);
    if (!artistId) {
      setError('Select an artist.');
      return;
    }

    const startAt = new Date(eventStart);
    if (Number.isNaN(startAt.getTime())) {
      setError('Invalid start time.');
      return;
    }

    let endAtIso: string | null = null;
    if (eventEnd) {
      const endDate = new Date(eventEnd);
      if (Number.isNaN(endDate.getTime())) {
        setError('Invalid end time.');
        return;
      }
      if (endDate < startAt) {
        setError('End time must be after the start time.');
        return;
      }
      endAtIso = endDate.toISOString();
    }

    setSaving(true);
    setError('');

    try {
      let coverImageUrl = eventCoverUrl.trim() || null;
      let venuePlaceId = selectedVenue?.id || null;

      if (posterFile) {
        const safeName = sanitizeFilename(posterFile.name || 'poster');
        const posterPath = `event-posters/${userId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(posterPath, posterFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: posterFile.type || 'image/*',
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicData } = supabase.storage.from('media').getPublicUrl(posterPath);
        coverImageUrl = publicData.publicUrl;
      }

      if (venueMode === 'new') {
        const { data: newVenue, error: venueError } = await supabase
          .from('venue_places')
          .insert({
            name: newVenueName.trim(),
            city: newVenueCity.trim(),
            address: newVenueAddress.trim() || null,
            latitude: venueLat,
            longitude: venueLng,
            created_by: userId,
          })
          .select('id, name, city, address, latitude, longitude')
          .single();

        if (venueError) {
          throw venueError;
        }
        venuePlaceId = (newVenue as VenuePlace).id;
      }

      if (!venuePlaceId) {
        throw new Error('Venue is required.');
      }

      const genres = eventGenres
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert({
          organizer_id: userId,
          venue_id: profileRole === 'venue' ? userId : null,
          venue_place_id: venuePlaceId,
          name: eventName.trim(),
          description: eventDescription.trim() || null,
          event_url: eventUrl.trim() || null,
          city: venueCity || (profileCity || ''),
          address: venueAddress || null,
          latitude: venueLat,
          longitude: venueLng,
          genres,
          cover_image_url: coverImageUrl,
          is_free: isFree,
          price_tiers: isFree ? [] : priceTiers,
          starts_at: startAt.toISOString(),
          ends_at: endAtIso,
          is_public: true,
        })
        .select('id')
        .single();

      if (eventError || !eventData) {
        throw eventError || new Error('Event creation failed.');
      }

      const { error: artistError } = await supabase.from('event_artists').insert({
        event_id: eventData.id,
        artist_id: artistId,
      });

      if (artistError) {
        await supabase.from('events').delete().eq('id', eventData.id);
        throw artistError;
      }

      onCreated?.(eventData.id);
      onDismiss();
    } catch (err: any) {
      setError(err?.message || 'Unable to create event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal">
      <div className="app-modal-header">
        <h2 className="app-modal-title">Create event</h2>
        <button
          type="button"
          className="app-button app-button--ghost app-button--small"
          onClick={onDismiss}
          disabled={saving}
        >
          Close
        </button>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <section className="app-card space-y-4 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Venue</p>
                <p className="mt-2 text-sm text-slate-500">
                  Pick a venue place or drop a pin to add a new one.
                </p>
              </div>
              <button
                type="button"
                className="app-button app-button--ghost app-button--small"
                onClick={() =>
                  setVenueMode(prev => (prev === 'existing' ? 'new' : 'existing'))
                }
              >
                {venueMode === 'existing' ? 'New venue' : 'Use existing'}
              </button>
            </div>

            <input
              type="search"
              className="app-search"
              placeholder="Search venues"
              value={venueSearch}
              onChange={e => setVenueSearch(e.target.value)}
            />

            <div className="venue-map">
              <MapContainer
                center={mapCenter}
                zoom={12}
                className="venue-map-inner"
                zoomControl={false}
              >
                <MapLibreLayer />
                <MapResizeObserver />
                {filteredVenues.map(venue => {
                  const lat = toNumber(venue.latitude);
                  const lng = toNumber(venue.longitude);
                  if (lat === null || lng === null) return null;
                  const icon = buildPinIcon('venue', 'SALA', venue.photos?.[0] || null);
                  return (
                    <Marker
                      key={venue.id}
                      position={[lat, lng]}
                      icon={icon}
                      eventHandlers={{
                        click: () => selectVenue(venue),
                      }}
                    />
                  );
                })}
                {venueMode === 'new' && venueLat !== null && venueLng !== null && (
                  <Marker position={[venueLat, venueLng]} icon={buildPinIcon('venue', 'SALA')} />
                )}
                <MapFocus center={mapCenter} />
                <VenueMapClick enabled={venueMode === 'new'} onSelect={handleMapSelect} />
              </MapContainer>
            </div>

            {venueMode === 'existing' && (
              <>
                {venuesLoading ? (
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <IonSpinner name="crescent" />
                    Loading venues...
                  </div>
                ) : filteredVenues.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No venues found. Switch to &quot;New venue&quot; to add one.
                  </p>
                ) : (
                  <div className="venue-results max-h-64 overflow-y-auto pr-1">
                    {filteredVenues.map(venue => (
                      <button
                        key={venue.id}
                        type="button"
                        className={`venue-option ${
                          selectedVenue?.id === venue.id ? 'is-active' : ''
                        }`}
                        onClick={() => selectVenue(venue)}
                      >
                        <span className="venue-option-name">{venue.name}</span>
                        <span className="venue-option-meta">{venue.city}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedVenue && (
                  <div className="venue-selected">
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
                      onClick={() => setSelectedVenue(null)}
                    >
                      Clear
                    </button>
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
                    onChange={e => setNewVenueName(e.target.value)}
                    placeholder="Venue name"
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">City</span>
                  <input
                    className="app-input"
                    value={newVenueCity}
                    onChange={e => setNewVenueCity(e.target.value)}
                    placeholder="City"
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">Address</span>
                  <input
                    className="app-input"
                    value={newVenueAddress}
                    onChange={e => setNewVenueAddress(e.target.value)}
                    placeholder="Street address"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="app-field">
                    <span className="app-label">Latitude</span>
                    <input
                      className="app-input"
                      value={newVenueLat}
                      onChange={e => setNewVenueLat(e.target.value)}
                      placeholder="41.3874"
                    />
                  </label>
                  <label className="app-field">
                    <span className="app-label">Longitude</span>
                    <input
                      className="app-input"
                      value={newVenueLng}
                      onChange={e => setNewVenueLng(e.target.value)}
                      placeholder="2.1686"
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  Tap the map to set the venue coordinates.
                </p>
              </div>
            )}
          </section>

          <section className="app-card space-y-3 p-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Artist</p>
              <p className="mt-2 text-sm text-slate-500">One artist per event.</p>
            </div>
            {profileRole === 'artist' ? (
              <div className="venue-selected">
                <div>
                  <p className="text-sm text-slate-50">
                    {profileName || 'Your artist profile'}
                  </p>
                  <p className="text-xs text-slate-400">Artist</p>
                </div>
              </div>
            ) : (
              <label className="app-field">
                <span className="app-label">Select artist</span>
                {artistsLoading ? (
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <IonSpinner name="crescent" />
                    Loading artists...
                  </div>
                ) : (
                  <select
                    className="app-select"
                    value={selectedArtistId || ''}
                    onChange={e => setSelectedArtistId(e.target.value || null)}
                  >
                    <option value="" disabled>
                      Choose an artist
                    </option>
                    {artists.map(artist => (
                      <option key={artist.id} value={artist.id}>
                        {getArtistLabel(artist)}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}
          </section>

          <section className="app-card space-y-3 p-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Event</p>
              <p className="mt-2 text-sm text-slate-500">Share the essentials first.</p>
            </div>
            <label className="app-field">
              <span className="app-label">Event name</span>
              <input
                className="app-input"
                value={eventName}
                onChange={e => setEventName(e.target.value)}
                placeholder="Night Session"
              />
            </label>
            <label className="app-field">
              <span className="app-label">Starts at</span>
              <input
                className="app-input"
                type="datetime-local"
                value={eventStart}
                onChange={e => setEventStart(e.target.value)}
              />
            </label>
            <label className="app-field">
              <span className="app-label">Event link</span>
              <input
                className="app-input"
                value={eventUrl}
                onChange={e => setEventUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>

            <label className="app-toggle">
              <input
                type="checkbox"
                checked={isFree}
                onChange={e => {
                  setIsFree(e.target.checked);
                  setError('');
                }}
              />
              <span>{isFree ? 'Free event' : 'Paid event'}</span>
            </label>

            {!isFree && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="app-field">
                    <span className="app-label">Tier name</span>
                    <input
                      className="app-input"
                      value={tierLabel}
                      onChange={e => setTierLabel(e.target.value)}
                      placeholder="Presale"
                    />
                  </label>
                  <label className="app-field">
                    <span className="app-label">Price</span>
                    <input
                      className="app-input"
                      value={tierPrice}
                      onChange={e => setTierPrice(e.target.value)}
                      placeholder="12"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="app-button app-button--ghost app-button--small"
                  onClick={addPriceTier}
                >
                  Add tier
                </button>

                {priceTiers.length > 0 && (
                  <div className="price-tier-list">
                    {priceTiers.map((tier, index) => (
                      <div key={`${tier.label}-${index}`} className="price-tier-row">
                        <div>
                          <p className="price-tier-label">{tier.label}</p>
                          <p className="price-tier-meta">${tier.price.toFixed(2)}</p>
                        </div>
                        <button
                          type="button"
                          className="app-button app-button--ghost app-button--small"
                          onClick={() => removePriceTier(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="app-button app-button--ghost app-button--small"
              onClick={() => setShowOptional(prev => !prev)}
            >
              {showOptional ? 'Hide optional' : 'Optional details'}
            </button>

            {showOptional && (
              <div className="space-y-3">
                <label className="app-field">
                  <span className="app-label">Ends at</span>
                  <input
                    className="app-input"
                    type="datetime-local"
                    value={eventEnd}
                    onChange={e => setEventEnd(e.target.value)}
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">Genres</span>
                  <input
                    className="app-input"
                    value={eventGenres}
                    onChange={e => setEventGenres(e.target.value)}
                    placeholder="Jazz, Experimental"
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">Poster upload</span>
                  <input
                    className="app-input"
                    type="file"
                    accept="image/*"
                    onChange={e => setPosterFile(e.target.files?.[0] || null)}
                  />
                </label>
                {posterPreview && (
                  <div className="event-poster-preview">
                    <img src={posterPreview} alt="Event poster preview" />
                  </div>
                )}
                {posterFile && (
                  <button
                    type="button"
                    className="app-button app-button--ghost app-button--small"
                    onClick={() => setPosterFile(null)}
                  >
                    Remove poster
                  </button>
                )}
                <label className="app-field">
                  <span className="app-label">Poster URL (optional)</span>
                  <input
                    className="app-input"
                    value={eventCoverUrl}
                    onChange={e => setEventCoverUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">Description</span>
                  <textarea
                    className="app-textarea"
                    value={eventDescription}
                    onChange={e => setEventDescription(e.target.value)}
                    placeholder="Optional details..."
                  />
                </label>
              </div>
            )}
          </section>

      <button
        type="button"
        className="app-button app-button--block"
        onClick={handleCreate}
        disabled={saving || !organizerAllowed}
      >
        {saving ? 'Creating...' : 'Create event'}
      </button>
    </div>
  );
};

export default CreateEventModal;
