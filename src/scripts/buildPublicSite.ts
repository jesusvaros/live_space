import '../config/loadEnv.js';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { FESTIVALS, festivalPath } from '../landing/festivals.js';
import { eventJsonLd, itemListJsonLd, placeJsonLd, type SeoArtist, type SeoEvent, type SeoVenue } from '../seo/jsonLd.js';
import { PUBLIC_CITIES, publicPath } from '../seo/slug.js';

// Prerenders the public agenda into dist/ after `vite build`: one static page
// per upcoming concert, venue and artist plus city listings, each with title,
// description, canonical, Open Graph and JSON-LD. The SPA mounts over it.
// Uses only the anon key; RLS limits it to published rows.

const DIST = path.resolve(process.env.PUBLIC_SITE_DIST || 'dist');
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://livespace.pages.dev').replace(/\/+$/, '');
const TIME_ZONE = 'Europe/Madrid';

const readEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const supabase = createClient(readEnv('VITE_SUPABASE_URL'), readEnv('VITE_SUPABASE_ANON_KEY'), {
  auth: { persistSession: false },
});

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// JSON-LD lives inside <script>: "</" must not close it early.
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

const madridDay = (value: string | Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(value),
  );

const formatWhen = (value: string) =>
  new Intl.DateTimeFormat('es-ES', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const formatDay = (day: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${day}T12:00:00Z`),
  );

const venueLine = (venue: SeoVenue) =>
  [venue.address, venue.postal_code, venue.city].filter(Boolean).join(', ');

type Page = {
  path: string;
  title: string;
  description: string;
  body: string;
  jsonLd: unknown[];
};

const template = readFileSync(path.join(DIST, 'index.html'), 'utf8');

const renderPage = (page: Page) => {
  const canonical = `${SITE_URL}${page.path}`;
  const head = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Live Space" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    ...page.jsonLd.map((item) => `<script type="application/ld+json">${jsonForScript(item)}</script>`),
  ].join('\n    ');

  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${escapeHtml(page.description)}" />`,
    )
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${page.body}</div>`);

  const directory = path.join(DIST, page.path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'index.html'), html);
};

const fetchCatalogue = async () => {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: eventRows, error: eventsError } = await supabase
    .from('events')
    .select(
      'id,name,description,starts_at,ends_at,ticket_url,price_tiers,is_free,status,venue_place_id,event_artists(artist_id,is_headliner)',
    )
    .eq('status', 'published')
    .gte('starts_at', since)
    .order('starts_at', { ascending: true });
  if (eventsError) throw eventsError;

  const { data: venueRows, error: venuesError } = await supabase
    .from('venue_places')
    .select('id,name,city,address,postal_code,latitude,longitude,website_url,status');
  if (venuesError) throw venuesError;

  const { data: artistRows, error: artistsError } = await supabase
    .from('artists')
    .select('id,name,genres')
    .eq('status', 'published');
  if (artistsError) throw artistsError;

  const venues = new Map((venueRows || []).map((venue) => [venue.id as string, venue as SeoVenue & { status: string }]));
  const artists = new Map((artistRows || []).map((artist) => [artist.id as string, artist as SeoArtist]));
  const events: SeoEvent[] = [];
  for (const row of eventRows || []) {
    const venue = venues.get(row.venue_place_id);
    if (!venue) continue;
    const links = (row.event_artists || []) as Array<{ artist_id: string; is_headliner: boolean }>;
    events.push({
      ...(row as Omit<SeoEvent, 'venue' | 'artists'>),
      price_tiers: Array.isArray(row.price_tiers) ? row.price_tiers : [],
      venue,
      artists: links
        .sort((a, b) => Number(b.is_headliner) - Number(a.is_headliner))
        .map((link) => artists.get(link.artist_id))
        .filter((artist): artist is SeoArtist => Boolean(artist)),
    });
  }
  return { events, venues, artists };
};

const run = async () => {
  const { events, venues } = await fetchCatalogue();
  const publishedVenues = [...venues.values()].filter((venue) => venue.status === 'published');
  const publishedVenueIds = new Set(publishedVenues.map((venue) => venue.id));

  // Directory-style paths with a trailing slash, as Cloudflare Pages serves
  // them, so internal links never pay a redirect hop.
  const eventPath = (event: SeoEvent) =>
    `${publicPath.event(`${event.name} ${event.venue.name} ${madridDay(event.starts_at)}`, event.id)}/`;
  const venuePath = (venue: SeoVenue) =>
    publishedVenueIds.has(venue.id) ? `${publicPath.venue(venue.name, venue.id)}/` : undefined;
  const artistsWithEvents = new Map<string, SeoArtist>();
  for (const event of events) for (const artist of event.artists) artistsWithEvents.set(artist.id, artist);
  const artistPath = (artist: SeoArtist) =>
    artistsWithEvents.has(artist.id) ? `${publicPath.artist(artist.name, artist.id)}/` : undefined;

  const eventItem = (event: SeoEvent) => {
    const venueHref = venuePath(event.venue);
    const venue = venueHref
      ? `<a href="${venueHref}">${escapeHtml(event.venue.name)}</a>`
      : escapeHtml(event.venue.name);
    return `<li><a href="${eventPath(event)}">${escapeHtml(event.name)}</a> · ${venue} · <time datetime="${event.starts_at}">${escapeHtml(formatWhen(event.starts_at))}</time></li>`;
  };
  const eventList = (items: SeoEvent[], empty: string) =>
    items.length > 0 ? `<ul>${items.map(eventItem).join('')}</ul>` : `<p>${escapeHtml(empty)}</p>`;

  const pages: Page[] = [];
  const redirects: string[] = [];

  for (const event of events) {
    const pagePath = eventPath(event);
    const venueHref = venuePath(event.venue);
    const lineup = event.artists
      .map((artist) => {
        const href = artistPath(artist);
        return href ? `<a href="${href}">${escapeHtml(artist.name)}</a>` : escapeHtml(artist.name);
      })
      .join(', ');
    const when = formatWhen(event.starts_at);
    const lowest = event.price_tiers.length > 0 ? Math.min(...event.price_tiers.map((tier) => tier.price)) : null;
    const price = event.is_free ? 'Gratis' : lowest !== null ? `Desde ${lowest} €` : null;
    pages.push({
      path: pagePath,
      title: `${event.name} en ${event.venue.name} (${event.venue.city}) · ${when} · Live Space`,
      description: `${event.name} en ${event.venue.name}, ${event.venue.city}, el ${when}.${
        event.ticket_url ? ' Enlace a la venta oficial de entradas.' : ''
      }`.slice(0, 300),
      body: [
        `<main>`,
        `<h1>${escapeHtml(event.name)} en ${escapeHtml(event.venue.name)}</h1>`,
        `<p><time datetime="${event.starts_at}">${escapeHtml(when)}</time></p>`,
        `<p>${venueHref ? `<a href="${venueHref}">${escapeHtml(event.venue.name)}</a>` : escapeHtml(event.venue.name)}${
          venueLine(event.venue) ? ` · ${escapeHtml(venueLine(event.venue))}` : ''
        }</p>`,
        lineup ? `<p>Cartel: ${lineup}</p>` : '',
        price ? `<p>${escapeHtml(price)}</p>` : '',
        event.ticket_url
          ? `<p><a href="${escapeHtml(event.ticket_url)}" rel="noopener nofollow">Entradas</a></p>`
          : '',
        event.description ? `<p>${escapeHtml(event.description.slice(0, 600))}</p>` : '',
        `</main>`,
      ].join(''),
      jsonLd: [
        eventJsonLd(event, {
          event: `${SITE_URL}${pagePath}`,
          venue: venueHref ? `${SITE_URL}${venueHref}` : undefined,
          artist: (artist) => {
            const href = artistPath(artist);
            return href ? `${SITE_URL}${href}` : undefined;
          },
        }),
      ],
    });
    redirects.push(`/event/${event.id} ${pagePath} 301`);
  }

  for (const venue of publishedVenues) {
    const pagePath = `${publicPath.venue(venue.name, venue.id)}/`;
    const upcoming = events.filter((event) => event.venue.id === venue.id);
    pages.push({
      path: pagePath,
      title: `${venue.name} (${venue.city}): conciertos y agenda · Live Space`,
      description: `Próximos conciertos en ${venue.name}, ${venue.city}${
        upcoming.length > 0 ? `: ${upcoming.length} fechas confirmadas` : ''
      }. Agenda actualizada cada día.`,
      body: [
        `<main>`,
        `<h1>${escapeHtml(venue.name)}</h1>`,
        venueLine(venue) ? `<p>${escapeHtml(venueLine(venue))}</p>` : '',
        `<h2>Próximos conciertos</h2>`,
        eventList(upcoming, 'No hay conciertos anunciados ahora mismo.'),
        `</main>`,
      ].join(''),
      jsonLd: [{ '@context': 'https://schema.org', ...placeJsonLd(venue, `${SITE_URL}${pagePath}`) }],
    });
    redirects.push(`/tabs/venue/${venue.id} ${pagePath} 301`, `/venue/${venue.id} ${pagePath} 301`);
  }

  for (const artist of artistsWithEvents.values()) {
    const pagePath = `${publicPath.artist(artist.name, artist.id)}/`;
    const upcoming = events.filter((event) => event.artists.some((item) => item.id === artist.id));
    pages.push({
      path: pagePath,
      title: `${artist.name}: conciertos en España · Live Space`,
      description: `Próximos conciertos de ${artist.name}: ${upcoming
        .slice(0, 3)
        .map((event) => `${event.venue.name} (${event.venue.city})`)
        .join(', ')}.`.slice(0, 300),
      body: [
        `<main>`,
        `<h1>${escapeHtml(artist.name)}</h1>`,
        artist.genres?.length ? `<p>${escapeHtml(artist.genres.join(', '))}</p>` : '',
        `<h2>Próximos conciertos</h2>`,
        eventList(upcoming, 'No hay conciertos anunciados ahora mismo.'),
        `</main>`,
      ].join(''),
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'MusicGroup',
          name: artist.name,
          url: `${SITE_URL}${pagePath}`,
          ...(artist.genres?.length ? { genre: artist.genres } : {}),
        },
      ],
    });
    redirects.push(`/tabs/artist/${artist.id} ${pagePath} 301`, `/artist/${artist.id} ${pagePath} 301`);
  }

  const today = madridDay(new Date());
  const weekEnd = madridDay(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
  for (const [citySlug, city] of Object.entries(PUBLIC_CITIES)) {
    const cityEvents = events.filter((event) => event.venue.city === city);
    const listings = [
      { suffix: '', heading: `Conciertos en ${city}`, items: cityEvents },
      {
        suffix: 'hoy/',
        heading: `Conciertos hoy en ${city}, ${formatDay(today)}`,
        items: cityEvents.filter((event) => madridDay(event.starts_at) === today),
      },
      {
        suffix: 'esta-semana/',
        heading: `Conciertos esta semana en ${city}, del ${formatDay(today)} al ${formatDay(weekEnd)}`,
        items: cityEvents.filter((event) => {
          const day = madridDay(event.starts_at);
          return day >= today && day <= weekEnd;
        }),
      },
    ];
    for (const listing of listings) {
      const pagePath = `/${citySlug}/conciertos/${listing.suffix}`;
      pages.push({
        path: pagePath,
        title: `${listing.heading} · Live Space`,
        description: `${listing.items.length} conciertos. ${listing.heading}, con la agenda de las salas actualizada cada día.`,
        body: [
          `<main>`,
          `<h1>${escapeHtml(listing.heading)}</h1>`,
          `<nav><a href="/${citySlug}/conciertos/hoy/">Hoy</a> · <a href="/${citySlug}/conciertos/esta-semana/">Esta semana</a> · <a href="/${citySlug}/conciertos/">Todos</a></nav>`,
          eventList(
            listing.items,
            `No hay conciertos anunciados para estas fechas. Mira la agenda completa de ${city}.`,
          ),
          `</main>`,
        ].join(''),
        jsonLd: [
          itemListJsonLd(listing.items.map((event) => ({ url: `${SITE_URL}${eventPath(event)}`, name: event.name }))),
        ],
      });
    }
  }

  for (const festival of FESTIVALS) {
    const pagePath = festivalPath(festival);
    const where = festival.dates ? `${festival.place}, ${festival.dates}` : festival.place;
    pages.push({
      path: pagePath,
      title: `¿Estuviste en ${festival.name}? Sube tus vídeos · Live Space`,
      description: `Sube tus fotos y vídeos de ${festival.name} (${where}). Cada concierto del cartel tiene su página en Live Space.`.slice(0, 300),
      body: [
        `<main>`,
        `<h1>¿Estuviste en ${escapeHtml(festival.name)}?</h1>`,
        `<p>${escapeHtml(where)}</p>`,
        `<p>Sube lo que grabaste. Cada concierto del cartel tiene su página.</p>`,
        festival.lineup?.length ? `<ul>${festival.lineup.map((band) => `<li>${escapeHtml(band)}</li>`).join('')}</ul>` : '',
        `</main>`,
      ].join(''),
      jsonLd: [],
    });
  }

  for (const page of pages) renderPage(page);

  const lastmod = new Date().toISOString();
  writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      // The landing is the SPA shell itself (dist/index.html), so it is listed but not prerendered.
      `  <url><loc>${escapeHtml(`${SITE_URL}/`)}</loc><lastmod>${lastmod}</lastmod></url>`,
      ...pages.map((page) => `  <url><loc>${escapeHtml(`${SITE_URL}${page.path}`)}</loc><lastmod>${lastmod}</lastmod></url>`),
      '</urlset>',
      '',
    ].join('\n'),
  );
  writeFileSync(
    path.join(DIST, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /tabs/',
      'Disallow: /admin',
      'Disallow: /profile/',
      'Disallow: /welcome',
      'Disallow: /reset',
      'Disallow: /upload',
      'Disallow: /create-event',
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      '',
    ].join('\n'),
  );
  // Cloudflare Pages: legacy UUID URLs move to the canonical page, then the
  // SPA fallback serves every other client-side route.
  writeFileSync(path.join(DIST, '_redirects'), [...redirects, '/* /index.html 200', ''].join('\n'));
  writeFileSync(
    path.join(DIST, '_headers'),
    [
      '/assets/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      pages: pages.length,
      events: events.length,
      venues: publishedVenues.length,
      artists: artistsWithEvents.size,
      redirects: redirects.length,
      eventsWithAddress: events.filter((event) => event.venue.address).length,
    }),
  );
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
