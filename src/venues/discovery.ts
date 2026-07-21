import { createDeterministicHash } from '../utils/hash.js';

export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

export type VenueCandidate = {
  provider: 'openstreetmap';
  provider_id: string;
  scope: string;
  name: string;
  normalized_name: string;
  city: string;
  country_code: 'ES';
  address: string | null;
  website_url: string | null;
  latitude: number | null;
  longitude: number | null;
  source_url: string;
  evidence_type: string;
  confidence: number;
  lifecycle_status: 'discovered' | 'ready_for_probe';
  tags: Record<string, string>;
};

const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const absoluteWebsite = (tags: Record<string, string>): string | null => {
  const value = tags.website || tags['contact:website'] || null;
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const evidence = (tags: Record<string, string>): { type: string; confidence: number } | null => {
  if (tags.amenity === 'music_venue') return { type: 'amenity=music_venue', confidence: 0.97 };
  if (tags.live_music === 'yes') return { type: 'live_music=yes', confidence: 0.82 };
  if (tags.amenity === 'theatre' && tags['theatre:type'] === 'concert_hall') {
    return { type: 'theatre:type=concert_hall', confidence: 0.9 };
  }
  return null;
};

export type BoundingBox = [south: number, west: number, north: number, east: number];

export const buildOverpassQuery = (scope: string, bbox?: BoundingBox): string => {
  const location = bbox
    ? `(${bbox.join(',')})`
    : `(area.searchArea)`;
  const area = bbox
    ? ''
    : `area["name"="${scope.replace(/["\\]/g, '')}"]["boundary"="administrative"]["admin_level"="8"]->.searchArea;\n`;
  return `[out:json][timeout:60];
${area}(
  nwr["amenity"="music_venue"]${location};
  nwr["live_music"="yes"]${location};
  nwr["amenity"="theatre"]["theatre:type"="concert_hall"]${location};
);
out center tags;`;
};

export const parseOsmCandidates = (scope: string, elements: OsmElement[]): VenueCandidate[] => {
  const unique = new Map<string, VenueCandidate>();

  for (const element of elements) {
    const tags = element.tags || {};
    const name = tags.name?.trim();
    const signal = evidence(tags);
    if (!name || !signal) continue;

    const providerId = `${element.type}/${element.id}`;
    const website = absoluteWebsite(tags);
    const address = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ') || null;
    unique.set(providerId, {
      provider: 'openstreetmap',
      provider_id: providerId,
      scope,
      name,
      normalized_name: normalizeName(name),
      city: scope,
      country_code: 'ES',
      address,
      website_url: website,
      latitude: element.lat ?? element.center?.lat ?? null,
      longitude: element.lon ?? element.center?.lon ?? null,
      source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      evidence_type: signal.type,
      confidence: signal.confidence,
      lifecycle_status: website ? 'ready_for_probe' : 'discovered',
      tags,
    });
  }

  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
};

export const candidateSnapshotHash = (candidates: VenueCandidate[]): string =>
  createDeterministicHash(candidates.map(({ provider_id, name, evidence_type }) => ({ provider_id, name, evidence_type })));
