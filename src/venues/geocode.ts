// Coordinates for venues that have none, so they show on the map. Venues
// discovered from OpenStreetMap come with them; venues added by hand or from
// agenda websites often don't. Pure helpers here; the network side is in
// src/scripts/geocodeVenues.ts.

export type NominatimResult = {
  lat: string;
  lon: string;
  type?: string;
  display_name?: string;
  address?: { road?: string; pedestrian?: string; house_number?: string; postcode?: string };
};

// OSM types a live-music venue is usually tagged with.
const VENUE_TYPES = new Set([
  'music_venue',
  'nightclub',
  'bar',
  'pub',
  'cafe',
  'theatre',
  'arts_centre',
  'events_venue',
  'restaurant',
  'community_centre',
]);

/** The first result that is a venue-like place in the right city, or null. */
export const pickVenueHit = (results: NominatimResult[], city: string): NominatimResult | null =>
  results.find(
    (result) => VENUE_TYPES.has(result.type ?? '') && (result.display_name ?? '').includes(city),
  ) ?? null;

/** Distance in kilometres between two points (haversine). */
export const distanceKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/**
 * Street names repeat across Spain («C/ Baix Vinalopó» exists in Valencia and
 * in Alicante): a position far from the venue's city is a wrong match.
 */
export const MAX_KM_FROM_CITY = 25;
export const isNearCity = (point: { lat: number; lon: number }, cityCentre: { lat: number; lon: number }) =>
  distanceKm(point, cityCentre) <= MAX_KM_FROM_CITY;

/** Street and number plus postcode, from a Nominatim address. */
export const formatAddress = (result: NominatimResult): string | null => {
  const address = result.address ?? {};
  const street = [address.road ?? address.pedestrian, address.house_number].filter(Boolean).join(' ');
  const parts = [street, address.postcode].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

const STREET = String.raw`(?:C\/|Calle|Carrer|C\.|Avda\.?|Avenida|Avinguda|Av\.|Pla[çc]a|Plaza|Pl\.|Paseo|Passeig|Ronda|Pol[ií]gono|Camino|Cam[ií])`;

/**
 * An address printed on a venue's own web page — street, number and, when it
 * follows close by, the postcode — or null.
 */
export const extractAddress = (pageText: string): string | null => {
  const text = pageText.replace(/\s+/g, ' ');
  const match = text.match(new RegExp(`(${STREET}[^|<>0-9–—·]{2,60}?,?\\s*\\d{1,4})(?:[^0-9|<>]{0,30}?\\b(\\d{5})\\b)?`, 'i'));
  if (!match) return null;
  const street = match[1].trim().replace(/\s+,/g, ',');
  return match[2] ? `${street}, ${match[2]}` : street;
};

const NAMED_ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', copy: '©', middot: '·', ndash: '–', mdash: '—' };
const ACCENTS: Record<string, string> = { acute: '\u0301', grave: '\u0300', tilde: '\u0303', uml: '\u0308', cedil: '\u0327', circ: '\u0302' };

/** Visible text of an HTML page (good enough to look for an address). */
export const htmlToText = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&([a-zA-Z])(acute|grave|tilde|uml|cedil|circ);/g, (_, letter: string, mark: string) => `${letter}${ACCENTS[mark]}`.normalize('NFC'))
    .replace(/&([a-z]+);/g, (entity, name: string) => NAMED_ENTITIES[name] ?? entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ');
