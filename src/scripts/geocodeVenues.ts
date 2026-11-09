// Fills in coordinates (and the address when missing) for published venues
// that have none, so they show on the map.
//
//   npm run venues:geocode            → dry run: prints what it would write
//   npm run venues:geocode -- --apply → writes, only rows still without coordinates
//
// Lookup order: OpenStreetMap by "name, city" (venue-like places only), then
// the venue's stored address, then the address printed on its website.
// Nominatim allows 1 request per second with an identifying User-Agent.

import { env } from '../config/env.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { Logger } from '../utils/logger.js';
import { extractAddress, formatAddress, htmlToText, isNearCity, pickVenueHit, type NominatimResult } from '../venues/geocode.js';

const logger = new Logger(env.logLevel, { script: 'geocodeVenues' });
const supabase = getSupabaseAdmin();
const apply = process.argv.includes('--apply');
const USER_AGENT = 'LiveSpaceVenueGeocode/0.1 (catalogue maintenance)';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url: string, init: RequestInit = {}, ms = 20_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const nominatim = async (query: string): Promise<NominatimResult[]> => {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'es');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '3');
  try {
    const response = await fetchWithTimeout(url.toString(), { headers: { 'user-agent': USER_AGENT } });
    return response.ok ? ((await response.json()) as NominatimResult[]) : [];
  } catch {
    return [];
  } finally {
    await sleep(1_100);
  }
};

const cityCentres = new Map<string, { lat: number; lon: number } | null>();
const cityCentre = async (city: string) => {
  if (!cityCentres.has(city)) {
    const [hit] = await nominatim(`${city}, España`);
    cityCentres.set(city, hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null);
  }
  return cityCentres.get(city) ?? null;
};

type Venue = { id: string; name: string; city: string; address: string | null; website_url: string | null };
type Found = { latitude: number; longitude: number; address: string | null; via: string };

const locateAnywhere = async (venue: Venue): Promise<Found | null> => {
  const byName = pickVenueHit(await nominatim(`${venue.name}, ${venue.city}, España`), venue.city);
  if (byName) {
    return { latitude: Number(byName.lat), longitude: Number(byName.lon), address: formatAddress(byName), via: 'osm-nombre' };
  }
  let address = venue.address;
  let via = 'direccion';
  if (!address && venue.website_url) {
    try {
      const response = await fetchWithTimeout(venue.website_url, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (response.ok) address = extractAddress(htmlToText(await response.text()));
      via = 'web';
    } catch {
      // Unreachable website: nothing more to try.
    }
  }
  if (!address) return null;
  const [hit] = await nominatim(`${address}, ${venue.city}, España`);
  return hit ? { latitude: Number(hit.lat), longitude: Number(hit.lon), address, via } : null;
};

// Only positions near the venue's city count.
const locate = async (venue: Venue): Promise<Found | null> => {
  const found = await locateAnywhere(venue);
  if (!found) return null;
  const centre = await cityCentre(venue.city);
  if (!centre || isNearCity({ lat: found.latitude, lon: found.longitude }, centre)) return found;
  logger.warn('Venue match too far from its city, ignored', { city: venue.city, name: venue.name, ...found });
  return null;
};

const run = async () => {
  const { data, error } = await supabase
    .from('venue_places')
    .select('id,name,city,address,website_url')
    .eq('status', 'published')
    .is('latitude', null);
  if (error) throw error;
  const venues = (data ?? []) as Venue[];
  logger.info('Venues without coordinates', { count: venues.length, apply });

  let located = 0;
  for (const venue of venues) {
    const found = await locate(venue);
    if (!found) {
      logger.warn('Venue not located', { city: venue.city, name: venue.name });
      continue;
    }
    located += 1;
    logger.info(apply ? 'Venue located' : 'Venue located (dry run)', { city: venue.city, name: venue.name, ...found });
    if (!apply) continue;
    const { error: updateError } = await supabase
      .from('venue_places')
      .update({
        latitude: found.latitude,
        longitude: found.longitude,
        ...(venue.address ? {} : { address: found.address }),
      })
      .eq('id', venue.id)
      .is('latitude', null);
    if (updateError) throw updateError;
  }
  logger.info('Venue geocoding finished', { total: venues.length, located, apply });
};

run().catch((error) => {
  logger.error('Venue geocoding failed', error);
  process.exitCode = 1;
});
