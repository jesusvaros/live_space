#!/usr/bin/env node
/* global process, console, setTimeout, fetch, AbortSignal, URL */
// Looks for a contact e-mail on each venue's (or, with --artists, each
// artist's) own website — home page and a contact page if it links one — and
// writes a CSV to review by hand. Instagram is not read (it needs a login).
// Read-only: it never writes to the database; the reviewed rows go to
// public.contact_leads separately. Polite: one request at a time, a short
// pause between sites, a clear user agent, and only pages the site links.
//
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… node scripts/contacts/findVenueEmails.mjs out.csv
//   … node scripts/contacts/findVenueEmails.mjs --artists artist-emails.csv

const args = process.argv.slice(2);
const artists = args.includes('--artists');
const out = args.find(arg => !arg.startsWith('--')) ?? (artists ? 'artist-emails.csv' : 'venue-emails.csv');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY');
  process.exit(1);
}

const UA = 'LiveSpaceContactFinder/1.0 (contacto manual con salas y artistas)';
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK = /(\.(png|jpe?g|gif|webp|svg)$)|example\.|exemple@|sentry|wixpress|godaddy|dominio\.com|domain\.com|correo\.com|email\.com|@2x|u00|curriculum|cv\+|talentclue|objetosperdidos|accessibilitat|accesibilidad|financiero|rrhh|jobs?@|empleo/i;
// Best channel first: programming/booking, then general info.
const RANK = [/programaci|booking|contrataci|management|manager/i, /^(info|hola|contact|contacto|informacion|sala)@/i];
const rank = email => {
  const index = RANK.findIndex(pattern => pattern.test(email));
  return index === -1 ? RANK.length : index;
};
const MAX_PER_VENUE = 2;
const decodeEntities = text =>
  text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
const CONTACT_LINK = /href=["']([^"']*(contact|contacto|info|booking|programacion|about|nosotros)[^"']*)["']/gi;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const get = async target => {
  try {
    const res = await fetch(target, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null;
    return { html: (await res.text()).slice(0, 2_000_000), finalUrl: res.url };
  } catch {
    return null;
  }
};

const emailsIn = html => {
  const decoded = decodeEntities(html).replace(/\[at\]|\(at\)/gi, '@');
  const found = new Set();
  for (const match of decoded.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(decodeURIComponent(match[1]).toLowerCase());
  for (const match of decoded.matchAll(EMAIL)) found.add(match[0].toLowerCase());
  return [...found]
    .map(email => email.replace(/^https?:\/\//, '').replace(/[\\.,;:]+$/, ''))
    .filter(email => /^[^@\s/]+@[^@\s/]+\.[a-z]{2,}$/i.test(email) && !JUNK.test(email));
};

const sameSite = (link, base) => {
  try {
    const target = new URL(link, base);
    return target.host === new URL(base).host ? target.toString() : null;
  } catch {
    return null;
  }
};

const query = artists
  ? 'artists?select=id,name,city,website_url:external_links->>website&external_links->>website=not.is.null&order=name'
  : 'venue_places?select=id,name,city,website_url&website_url=not.is.null&order=name';
const venues = await (await fetch(`${url}/rest/v1/${query}`, { headers: { apikey: key, authorization: `Bearer ${key}` } })).json();

const rows = [[artists ? 'artist_id' : 'venue_place_id', artists ? 'artista' : 'sala', 'ciudad', 'email', 'fuente']];
for (const venue of venues) {
  const site = venue.website_url?.trim();
  if (!site || !/^https?:\/\//i.test(site)) continue;
  const home = await get(site);
  const hits = new Map();
  if (home) {
    emailsIn(home.html).forEach(email => hits.set(email, home.finalUrl));
    const links = [...home.html.matchAll(CONTACT_LINK)].map(m => sameSite(m[1], home.finalUrl)).filter(Boolean);
    for (const link of [...new Set(links)].slice(0, 2)) {
      if (hits.size) break;
      await sleep(800);
      const page = await get(link);
      if (page) emailsIn(page.html).forEach(email => hits.set(email, page.finalUrl));
    }
  }
  const best = [...hits].sort(([a], [b]) => rank(a) - rank(b)).slice(0, MAX_PER_VENUE);
  if (best.length === 0) rows.push([venue.id, venue.name, venue.city ?? '', '', home ? 'sin correo en la web' : 'web no responde']);
  for (const [email, source] of best) rows.push([venue.id, venue.name, venue.city ?? '', email, source]);
  process.stdout.write(`${venue.name}: ${best.length ? best.map(([email]) => email).join(', ') : '—'}\n`);
  await sleep(1200);
}

const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
const { writeFileSync } = await import('node:fs');
writeFileSync(out, csv + '\n');
console.log(`\n${rows.length - 1} filas → ${out}`);
