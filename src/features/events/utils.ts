import { EventListItem } from './types';

export const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const calculateDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const formatDate = (iso: string) => {
  const date = new Date(iso);
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
};

export const formatDistance = (km: number) => {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(0)} km`;
};

export const getPrimaryArtistName = (event: EventListItem) => {
  const first = (event.event_artists || []).find(entry => entry.artist?.name)?.artist?.name;
  return first || event.name;
};

export const getEventCoverImage = (event: EventListItem) =>
  (event as any).cover_image_url ||
  (event.event_artists || []).find(entry => entry.artist?.avatar_url)?.artist?.avatar_url ||
  null;
