import { useMemo } from 'react';
import { useQuery } from '../../../shared/hooks/useQuery';
import { fetchEventCards } from '../../../data/eventQueries';
import { EventListItem } from '../types';

const EMPTY: EventListItem[] = [];
const KM_PER_DEGREE = 111.32;

/**
 * Concerts whose venue is inside the box around the position (the caller
 * trims it to the radius). Only asked for when the listings of the chosen
 * city do not already cover the radius; null location = nothing to fetch.
 */
export const useNearbyEvents = (options: {
  location: { lat: number; lng: number } | null;
  radiusKm: number;
  startIso: string;
  endIso: string;
}) => {
  const { location, radiusKm, startIso, endIso } = options;
  // ~1 km steps: a GPS jitter does not refetch.
  const lat = location ? Math.round(location.lat * 100) / 100 : null;
  const lng = location ? Math.round(location.lng * 100) / 100 : null;

  const bounds = useMemo(() => {
    if (lat === null || lng === null) return null;
    const dLat = radiusKm / KM_PER_DEGREE;
    const dLng = radiusKm / (KM_PER_DEGREE * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
  }, [lat, lng, radiusKm]);

  const queryKey = useMemo(() => ['events:nearby', startIso, endIso, lat, lng, radiusKm] as const, [endIso, lat, lng, radiusKm, startIso]);
  const { data } = useQuery<EventListItem[]>(
    queryKey,
    () => (bounds ? fetchEventCards({ startIso, endIso, bounds }) : Promise.resolve(EMPTY)),
    { enabled: Boolean(bounds), ttlMs: 60_000, initialData: EMPTY },
  );
  return bounds ? data || EMPTY : EMPTY;
};
