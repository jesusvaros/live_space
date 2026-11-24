#!/usr/bin/env node
/* global process, console, fetch */
// How ready each artist and venue profile is before we contact them, first
// those with concerts in the next 60 days. Read-only (anon key), writes CSVs.
//
// Artist is «listo» with: photo, bio, genres, a listening link (Spotify,
// Apple Music, Bandcamp or YouTube) and a social/web link.
// Venue is «lista» with: photo, address, capacity and website.
//
//   node --env-file=.env scripts/profiles/readiness.mjs out-dir

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? '.';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY');
  process.exit(1);
}

const PAGE = 1000;
const DAY = 86_400_000;
const LISTEN = ['spotify', 'apple_music', 'bandcamp', 'youtube'];
const SOCIAL = ['instagram', 'tiktok', 'website'];

const getAll = async query => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: key, authorization: `Bearer ${key}`, range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
};

const now = new Date();
const until = new Date(now.getTime() + 60 * DAY);
const [artists, venues, events] = await Promise.all([
  getAll('artists?select=id,name,city,bio,genres,image_url,external_links&order=name'),
  getAll('venue_places?select=id,name,city,address,capacity,website_url,image_url&order=name'),
  getAll(
    `events?select=id,venue_place_id,status,event_artists(artist_id)&starts_at=gte.${now.toISOString()}&starts_at=lt.${until.toISOString()}`,
  ),
]);

const upcomingArtist = new Map();
const upcomingVenue = new Map();
for (const event of events) {
  if (event.status && event.status !== 'published') continue;
  if (event.venue_place_id) upcomingVenue.set(event.venue_place_id, (upcomingVenue.get(event.venue_place_id) ?? 0) + 1);
  for (const { artist_id: id } of event.event_artists ?? []) upcomingArtist.set(id, (upcomingArtist.get(id) ?? 0) + 1);
}

const has = value => (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && String(value).trim() !== '');

const artistRows = artists.map(artist => {
  const links = artist.external_links ?? {};
  const checks = {
    foto: has(artist.image_url),
    bio: has(artist.bio),
    generos: has(artist.genres),
    escuchar: LISTEN.some(name => has(links[name])),
    redes: SOCIAL.some(name => has(links[name])),
  };
  return { kind: 'artista', id: artist.id, name: artist.name, city: artist.city ?? '', upcoming: upcomingArtist.get(artist.id) ?? 0, checks };
});

const venueRows = venues.map(venue => ({
  kind: 'sala',
  id: venue.id,
  name: venue.name,
  city: venue.city ?? '',
  upcoming: upcomingVenue.get(venue.id) ?? 0,
  checks: { foto: has(venue.image_url), direccion: has(venue.address), aforo: has(venue.capacity), web: has(venue.website_url) },
}));

const score = row => Object.values(row.checks).filter(Boolean).length;
const missing = row => Object.entries(row.checks).filter(([, ok]) => !ok).map(([name]) => name).join(' ');
const sorted = rows =>
  [...rows].sort((a, b) => (b.upcoming > 0) - (a.upcoming > 0) || score(a) - score(b) || b.upcoming - a.upcoming || a.name.localeCompare(b.name));

const csv = rows =>
  [['tipo', 'id', 'nombre', 'ciudad', 'conciertos_60d', 'puntos', 'total', 'listo', 'falta']]
    .concat(
      rows.map(row => {
        const total = Object.keys(row.checks).length;
        return [row.kind, row.id, row.name, row.city, row.upcoming, score(row), total, score(row) === total ? 'si' : 'no', missing(row)];
      }),
    )
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n') + '\n';

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'artistas-listos.csv'), csv(sorted(artistRows)));
writeFileSync(join(outDir, 'salas-listas.csv'), csv(sorted(venueRows)));

const summary = (label, rows) => {
  const active = rows.filter(row => row.upcoming > 0);
  const ready = rows.filter(row => score(row) === Object.keys(row.checks).length);
  const gaps = {};
  for (const row of active) for (const [name, ok] of Object.entries(row.checks)) if (!ok) gaps[name] = (gaps[name] ?? 0) + 1;
  console.log(
    `${label}: ${rows.length} · listos ${ready.length} · con conciertos en 60 días ${active.length} (listos ${active.filter(row => ready.includes(row)).length})`,
  );
  console.log(`  les falta (de los que tienen conciertos): ${Object.entries(gaps).map(([name, count]) => `${name} ${count}`).join(' · ')}`);
};
summary('Artistas', artistRows);
summary('Salas', venueRows);
