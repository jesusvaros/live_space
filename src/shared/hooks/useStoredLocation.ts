import { useState } from 'react';

const locationStorageKey = 'live_space.last_location';

export type StoredLocation = { lat: number; lng: number };

export const readStoredLocation = (): StoredLocation | null => {
  try {
    const raw = window.localStorage.getItem(locationStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown; ts?: unknown };
    const lat = typeof parsed.lat === 'number' ? parsed.lat : Number(parsed.lat);
    const lng = typeof parsed.lng === 'number' ? parsed.lng : Number(parsed.lng);
    const ts = typeof parsed.ts === 'number' ? parsed.ts : Number(parsed.ts);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(ts)) return null;
    const ageMs = Date.now() - ts;
    if (ageMs < 0 || ageMs > 1000 * 60 * 60 * 24 * 30) return null;
    return { lat, lng };
  } catch {
    return null;
  }
};

export const useStoredLocation = () => {
  // Read on the first render, so screens that key their queries on it do not
  // load once without a position and again with it.
  const [location] = useState<StoredLocation | null>(readStoredLocation);
  return location;
};

export const persistStoredLocation = (next: StoredLocation) => {
  try {
    window.localStorage.setItem(locationStorageKey, JSON.stringify({ ...next, ts: Date.now() }));
  } catch {
    // ignore storage failures
  }
};

