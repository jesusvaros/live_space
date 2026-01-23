import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { supabase } from '../lib/supabase';
import { ProfileRole, VenuePlace } from '../lib/types';
import { buildPinIcon } from '../components/event/create/MapHelpers';

export type ArtistOption = {
  id: string;
  display_name: string | null;
  username: string | null;
  role: ProfileRole;
  avatar_url?: string | null;
};

export type PriceTier = { label: string; price: number };

type UseCreateEventFormOptions = {
  userId?: string | null;
  profileRole?: ProfileRole | null;
  profileCity?: string | null;
  defaultArtistId?: string | null;
  defaultArtistName?: string | null;
  initialCenter?: [number, number] | null;
};

const defaultCenter: [number, number] = [41.3874, 2.1686];
const lastCenterKey = 'createEvent:lastMapCenter';

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

const sanitizeFilename = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '-');

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Please try again.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
};

export const useCreateEventForm = ({
  userId,
  profileRole,
  profileCity,
  defaultArtistId = null,
  defaultArtistName = null,
  initialCenter = null,
}: UseCreateEventFormOptions) => {
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
  const [isFree, setIsFree] = useState(true);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [tierLabel, setTierLabel] = useState('');
  const [tierPrice, setTierPrice] = useState('');

  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>(defaultArtistId ? [defaultArtistId] : []);
  const [artistMode, setArtistMode] = useState<'existing' | 'new'>('existing');
  const [newArtistName, setNewArtistName] = useState('');
  const [newArtistUsername, setNewArtistUsername] = useState('');
  const [artistSearch, setArtistSearch] = useState('');
  const [artistSearchCount, setArtistSearchCount] = useState<number | null>(null);
  const loadStoredCenter = (): [number, number] | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(lastCenterKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length === 2 &&
        Number.isFinite(Number(parsed[0])) &&
        Number.isFinite(Number(parsed[1]))
      ) {
        return [Number(parsed[0]), Number(parsed[1])];
      }
    } catch {
      return null;
    }
    return null;
  };

  const storedCenter = useMemo(() => loadStoredCenter(), [initialCenter]);
  const preferredCenter = storedCenter || initialCenter || null;

  const [mapCenter, setMapCenter] = useState<[number, number]>(preferredCenter || defaultCenter);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);

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
    setIsFree(true);
    setPriceTiers([]);
    setTierLabel('');
    setTierPrice('');
    setSelectedArtistIds(defaultArtistId ? [defaultArtistId] : []);
    setArtistSearch('');
    setArtistSearchCount(null);
    if (preferredCenter) {
      setMapCenter(preferredCenter);
    } else {
      setMapCenter(defaultCenter);
    }
  }, [profileCity, defaultArtistId, preferredCenter]);

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

    loadVenues();
  }, []);

  useEffect(() => {
    const query = artistSearch.trim();
    setArtistSearchCount(null);
    if (!query) {
      const baseList = defaultArtistId
        ? [
            {
              id: defaultArtistId,
              display_name: defaultArtistName || 'Your artist profile',
              username: null,
              role: 'artist' as ProfileRole,
            },
          ]
        : [];
      setArtists(baseList);
      setArtistsLoading(false);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setArtistsLoading(true);
      const artistQuery = supabase
        .from('artists')
        .select('id, name, avatar_url')
        .order('name', { ascending: true });

      const { data, error: artistError } = await artistQuery.ilike('name', `%${query}%`);

      if (cancelled) {
        return;
      }

      if (artistError) {
        setError('Unable to load artists.');
        setArtists([]);
        setArtistSearchCount(0);
      } else {
        const artistOptions = (data || []).map(row => ({
          id: row.id,
          display_name: row.name,
          username: null,
          role: 'artist' as ProfileRole,
          avatar_url: row.avatar_url ?? null,
        })) as ArtistOption[];
        setArtistSearchCount(artistOptions.length);
        const hasDefault = defaultArtistId
          ? artistOptions.some(artist => artist.id === defaultArtistId)
          : false;
        const withDefault =
          defaultArtistId && !hasDefault
            ? [
                {
                  id: defaultArtistId,
                  display_name: defaultArtistName || 'Your artist profile',
                  username: null,
                  role: 'artist' as ProfileRole,
                },
                ...artistOptions,
              ]
            : artistOptions;
        setArtists(withDefault);
      }
      setArtistsLoading(false);
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [artistSearch, defaultArtistId, defaultArtistName]);

  useEffect(() => {
    if (defaultArtistId && selectedArtistIds.length === 0) {
      setSelectedArtistIds([defaultArtistId]);
    }
  }, [defaultArtistId, selectedArtistIds.length]);

  const persistCenter = useCallback((center: [number, number]) => {
    setMapCenter(center);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(lastCenterKey, JSON.stringify(center));
    }
  }, []);

  const persistCenterOnly = useCallback((center: [number, number]) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(lastCenterKey, JSON.stringify(center));
    }
  }, []);

  useEffect(() => {
    if (initialCenter && !storedCenter) {
      persistCenter(initialCenter);
    }
  }, [initialCenter, storedCenter, persistCenter]);

  useEffect(() => {
    if (preferredCenter) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      position => {
        persistCenter([position.coords.latitude, position.coords.longitude]);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [preferredCenter, persistCenter]);

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

  const visibleVenues = useMemo(() => {
    if (!mapBounds) return filteredVenues;
    return filteredVenues.filter(venue => {
      const lat = toNumber(venue.latitude);
      const lng = toNumber(venue.longitude);
      if (lat === null || lng === null) return false;
      return mapBounds.contains(L.latLng(lat, lng));
    });
  }, [filteredVenues, mapBounds]);

  const venueMarkers = useMemo(() => {
    return visibleVenues
      .map(venue => {
        const lat = toNumber(venue.latitude);
        const lng = toNumber(venue.longitude);
        if (lat === null || lng === null) return null;
        return {
          venue,
          position: [lat, lng] as [number, number],
          icon: buildPinIcon('venue', 'SALA', venue.photos?.[0] || null),
        };
      })
      .filter(Boolean) as { venue: VenuePlace; position: [number, number]; icon: L.DivIcon }[];
  }, [visibleVenues]);

  const handleBoundsChange = useCallback((bounds: L.LatLngBounds) => {
    setMapBounds(bounds);
    const center = bounds.getCenter();
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      persistCenterOnly([center.lat, center.lng]);
    }
  }, [persistCenterOnly]);

  const selectVenue = useCallback((venue: VenuePlace) => {
    setSelectedVenue(venue);
    setVenueMode('existing');
    const lat = toNumber(venue.latitude);
    const lng = toNumber(venue.longitude);
    if (lat !== null && lng !== null) {
      persistCenter([lat, lng]);
    }
  }, [persistCenter]);

  const handleMapSelect = useCallback((lat: number, lng: number) => {
    setVenueMode('new');
    setSelectedVenue(null);
    setNewVenueLat(lat.toFixed(6));
    setNewVenueLng(lng.toFixed(6));
    persistCenter([lat, lng]);
  }, [persistCenter]);

  const venueCity = venueMode === 'existing' ? selectedVenue?.city || '' : newVenueCity.trim();
  const venueAddress = venueMode === 'existing' ? selectedVenue?.address || '' : newVenueAddress.trim();
  const venueLat = venueMode === 'existing' ? toNumber(selectedVenue?.latitude) : toNumber(newVenueLat);
  const venueLng = venueMode === 'existing' ? toNumber(selectedVenue?.longitude) : toNumber(newVenueLng);

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

  const handleCreate = async () => {
    if (!userId) {
      setError('Sign in to create events.');
      return null;
    }
    if (!eventName.trim()) {
      setError('Event name is required.');
      return null;
    }
    if (!eventStart) {
      setError('Start time is required.');
      return null;
    }
    if (!isFree && priceTiers.length === 0) {
      setError('Add at least one price tier.');
      return null;
    }
    if (venueMode === 'existing' && !selectedVenue) {
      setError('Select a venue place.');
      return null;
    }
    if (venueMode === 'new') {
      if (!newVenueName.trim()) {
        setError('Venue name is required.');
        return null;
      }
      if (!newVenueCity.trim()) {
        setError('Venue city is required.');
        return null;
      }
      if (venueLat === null || venueLng === null) {
        setError('Select a location on the map.');
        return null;
      }
    }
    const fallbackArtistIds =
      defaultArtistId && profileRole === 'artist' ? [defaultArtistId] : [];
    const artistIds =
      selectedArtistIds.length > 0
        ? selectedArtistIds
        : fallbackArtistIds;
    if (artistIds.length === 0) {
      setError('Select at least one artist.');
      return null;
    }

    const startAt = new Date(eventStart);
    if (Number.isNaN(startAt.getTime())) {
      setError('Invalid start time.');
      return null;
    }

    let endAtIso: string | null = null;
    if (eventEnd) {
      const endDate = new Date(eventEnd);
      if (Number.isNaN(endDate.getTime())) {
        setError('Invalid end time.');
        return null;
      }
      if (endDate < startAt) {
        setError('End time must be after the start time.');
        return null;
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
        const { error: uploadError } = await withTimeout(
          supabase.storage
            .from('media')
            .upload(posterPath, posterFile, {
              cacheControl: '3600',
              upsert: false,
              contentType: posterFile.type || 'image/*',
            }),
          45_000,
          'Poster upload'
        );

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicData } = supabase.storage.from('media').getPublicUrl(posterPath);
        coverImageUrl = publicData.publicUrl;
      }

      if (venueMode === 'new') {
        const { data: newVenue, error: venueError } = await withTimeout(
          supabase
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
            .single(),
          20_000,
          'Venue create'
        );

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

      const { data: eventData, error: eventError } = await withTimeout(
        supabase
          .from('events')
          .insert({
            organizer_id: userId,
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
          .single(),
        20_000,
        'Event create'
      );

      if (eventError || !eventData) {
        throw eventError || new Error('Event creation failed.');
      }

      // Insert artist relationships
      for (const artistId of artistIds) {
        const { error: artistError } = await withTimeout(
          supabase.from('event_artists').insert({
            event_id: eventData.id,
            artist_entity_id: artistId,
          }),
          20_000,
          'Lineup create'
        );

        if (artistError) {
          await withTimeout(
            supabase.from('events').delete().eq('id', eventData.id),
            20_000,
            'Rollback'
          );
          throw artistError;
        }
      }

      return eventData.id;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

      
  return {
    artists,
    artistsLoading,
    venuesLoading,
    error,
    saving,
    venueSearch,
    venueMode,
    selectedVenue,
    newVenueName,
    newVenueCity,
    newVenueAddress,
    newVenueLat,
    newVenueLng,
    eventName,
    eventStart,
    eventEnd,
    eventDescription,
    eventUrl,
    eventCoverUrl,
    posterFile,
    posterPreview,
    eventGenres,
    isFree,
    priceTiers,
    tierLabel,
    tierPrice,
    selectedArtistIds,
    artistMode,
    newArtistName,
    newArtistUsername,
    artistSearch,
    artistSearchCount,
    mapCenter,
    mapBounds,
    visibleVenues,
    venueMarkers,
    venueLat,
    venueLng,
    setVenueSearch,
    setVenueMode,
    setSelectedVenue,
    setNewVenueName,
    setNewVenueCity,
    setNewVenueAddress,
    setNewVenueLat,
    setNewVenueLng,
    setEventName,
    setEventStart,
    setEventEnd,
    setEventDescription,
    setEventUrl,
    setEventCoverUrl,
    setPosterFile,
    setEventGenres,
    setIsFree,
    setTierLabel,
    setTierPrice,
    setSelectedArtistIds,
    setArtistMode,
    setNewArtistName,
    setNewArtistUsername,
    setArtistSearch,
    setError,
    handleBoundsChange,
    addPriceTier,
    removePriceTier,
    selectVenue,
    handleMapSelect,
    handleCreate,
  };
};
