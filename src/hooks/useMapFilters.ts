import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Artist, Event, VenuePlace } from '../lib/types';

type EventWithVenue = Event & { venue_place?: VenuePlace | null };
type AttendanceStatus = 'going' | 'attended';

type UseMapFiltersParams = {
  events: (EventWithVenue & {
    event_artists?: { artist: Artist | null }[];
  })[];
  venues: VenuePlace[];
  userId?: string | null;
};

export const useMapFilters = ({ events, venues, userId }: UseMapFiltersParams) => {
  const [search, setSearch] = useState('');
  const [showEvents, setShowEvents] = useState(true);
  const [showVenues, setShowVenues] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [showPast, setShowPast] = useState(true);
  const [filterToday, setFilterToday] = useState(false);
  const [filterTomorrow, setFilterTomorrow] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [filterNow, setFilterNow] = useState(false);
  const [filterFree, setFilterFree] = useState(false);
  const [filterGenres, setFilterGenres] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [filterDayPart, setFilterDayPart] = useState<'day' | 'night' | ''>('');
  const [filterBandOnly, setFilterBandOnly] = useState(false);
  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
  const [filterGoing, setFilterGoing] = useState(false);
  const [filterAttended, setFilterAttended] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});

  useEffect(() => {
    if (!userId || (!filterGoing && !filterAttended)) {
      setAttendanceMap({});
      return;
    }
    const loadAttendance = async () => {
      const { data } = await supabase
        .from('event_attendance')
        .select('event_id, status')
        .eq('user_id', userId);
      const nextMap: Record<string, AttendanceStatus> = {};
      (data || []).forEach((row: any) => {
        if (row?.event_id && row?.status) {
          nextMap[row.event_id] = row.status as AttendanceStatus;
        }
      });
      setAttendanceMap(nextMap);
    };
    loadAttendance();
  }, [userId, filterGoing, filterAttended]);

  const filteredEvents = useMemo(() => {
    if (!showEvents) return [];

    const query = search.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);

    const genreFilters = filterGenres
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean);

    const minPrice = priceMin.trim() ? Number(priceMin) : null;
    const maxPrice = priceMax.trim() ? Number(priceMax) : null;

    return events.filter(event => {
      if (
        query &&
        !(
          event.name.toLowerCase().includes(query) ||
          event.city.toLowerCase().includes(query) ||
          event.venue_place?.name?.toLowerCase().includes(query) ||
          event.venue_place?.city?.toLowerCase().includes(query) ||
          event.address?.toLowerCase().includes(query)
        )
      ) {
        return false;
      }

      const startsAt = new Date(event.starts_at);
      const endsAt = event.ends_at ? new Date(event.ends_at) : null;
      const endForScope = endsAt ?? startsAt;
      const isPastEvent = endForScope < now;

      if (!showUpcoming && !showPast) {
        return false;
      }
      if (showUpcoming !== showPast) {
        if (showPast && !isPastEvent) return false;
        if (showUpcoming && isPastEvent) return false;
      }

      if (filterToday && (startsAt < startOfToday || startsAt > endOfToday)) {
        return false;
      }
      if (filterTomorrow && (startsAt < startOfTomorrow || startsAt > endOfTomorrow)) {
        return false;
      }
      if (filterDate) {
        const selectedDate = new Date(`${filterDate}T00:00:00`);
        const selectedEnd = new Date(selectedDate);
        selectedEnd.setHours(23, 59, 59, 999);
        if (startsAt < selectedDate || startsAt > selectedEnd) {
          return false;
        }
      }
      if (filterNow) {
        if (startsAt > now) return false;
        if (endsAt && endsAt < now) return false;
      }
      if (filterFree && event.is_free === false) {
        return false;
      }
      if (filterDayPart) {
        const hour = startsAt.getHours();
        const isDay = hour >= 6 && hour < 18;
        if (filterDayPart === 'day' && !isDay) return false;
        if (filterDayPart === 'night' && isDay) return false;
      }
      if (filterBandOnly) {
        const hasBand =
          Array.isArray((event as any).event_artists) &&
          (event as any).event_artists.some(
            (item: any) => item?.artist?.artist_type === 'band'
          );
        if (!hasBand) return false;
      }
      if (selectedArtistIds.length > 0) {
        const hasSelected =
          Array.isArray((event as any).event_artists) &&
          (event as any).event_artists.some(
            (item: any) => item?.artist?.id && selectedArtistIds.includes(item.artist.id)
          );
        if (!hasSelected) return false;
      }
      if (genreFilters.length > 0) {
        const eventGenres = (event.genres || []).map(item => item.toLowerCase());
        if (!genreFilters.some(filterItem => eventGenres.includes(filterItem))) {
          return false;
        }
      }
      if (minPrice !== null || maxPrice !== null) {
        const tiers = (event.price_tiers || []) as { price: number }[];
        const prices = tiers.map(tier => Number(tier.price)).filter(price => Number.isFinite(price));
        const eventIsFree = event.is_free !== false;
        const eventMin = eventIsFree ? 0 : prices.length > 0 ? Math.min(...prices) : null;
        const eventMax = eventIsFree ? 0 : prices.length > 0 ? Math.max(...prices) : null;
        if (eventMin === null || eventMax === null) {
          return false;
        }
        if (minPrice !== null && eventMax < minPrice) return false;
        if (maxPrice !== null && eventMin > maxPrice) return false;
      }
      if (filterGoing || filterAttended) {
        const status = attendanceMap[event.id];
        if (filterGoing && status === 'going') return true;
        if (filterAttended && status === 'attended') return true;
        return false;
      }

      return true;
    });
  }, [
    events,
    search,
    showUpcoming,
    showPast,
    filterToday,
    filterTomorrow,
    filterDate,
    filterNow,
    filterFree,
    filterGenres,
    priceMin,
    priceMax,
    filterDayPart,
    filterBandOnly,
    selectedArtistIds,
    filterGoing,
    filterAttended,
    attendanceMap,
    showEvents,
  ]);

  const filteredVenues = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return venues;
    return venues.filter(venue =>
      venue.name.toLowerCase().includes(query) ||
      venue.city.toLowerCase().includes(query) ||
      venue.address?.toLowerCase().includes(query)
    );
  }, [venues, search]);

  const toggleToday = () => {
    setFilterToday(prev => {
      const next = !prev;
      if (next) {
        setFilterTomorrow(false);
        setFilterDate('');
      }
      return next;
    });
  };

  const toggleTomorrow = () => {
    setFilterTomorrow(prev => {
      const next = !prev;
      if (next) {
        setFilterToday(false);
        setFilterDate('');
      }
      return next;
    });
  };

  const setFilterDateValue = (value: string) => {
    setFilterDate(value);
    if (value) {
      setFilterToday(false);
      setFilterTomorrow(false);
    }
  };

  const clearExtraFilters = () => {
    setFilterGenres('');
    setPriceMin('');
    setPriceMax('');
    setFilterDayPart('');
    setFilterBandOnly(false);
    setSelectedArtistIds([]);
    setFilterGoing(false);
    setFilterAttended(false);
  };

  return {
    search,
    setSearch,
    showEvents,
    setShowEvents,
    showVenues,
    setShowVenues,
    showUpcoming,
    setShowUpcoming,
    showPast,
    setShowPast,
    filterToday,
    filterTomorrow,
    filterDate,
    filterNow,
    filterFree,
    filterGenres,
    priceMin,
    priceMax,
    filterDayPart,
    setFilterDayPart,
    filterBandOnly,
    setFilterBandOnly,
    selectedArtistIds,
    setSelectedArtistIds,
    filterGoing,
    filterAttended,
    toggleToday,
    toggleTomorrow,
    setFilterDate: setFilterDateValue,
    setFilterNow,
    setFilterFree,
    setFilterGenres,
    setPriceMin,
    setPriceMax,
    setFilterGoing,
    setFilterAttended,
    clearExtraFilters,
    filteredEvents,
    filteredVenues,
  };
};
