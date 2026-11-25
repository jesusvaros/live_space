// What a link sent with «¿Falta un concierto?» is when it is not one concert
// (docs/scraping.md, "Sugerencias de usuarios"). Deterministic, no AI:
//
//   classifyUrl  → from the address alone: an artist platform (Spotify,
//                  Apple Music, Bandcamp, SoundCloud) is an artist; a social
//                  profile (Instagram, TikTok, Facebook, YouTube, Linktree)
//                  could be a venue or an artist ('profile').
//   classifyPage → from the page: schema.org MusicGroup → artist;
//                  LocalBusiness/BarOrPub/NightClub/MusicVenue/Place… →
//                  venue; otherwise a score of venue signals (name says
//                  sala/bar/club…, «próximos eventos»/agenda, a postal
//                  address, a map or phone link, the site's home page) and
//                  artist signals (links to their Spotify/Bandcamp/Apple
//                  Music, «banda», «discografía»…).
//
// Ticket platforms are never read as a venue or an artist: a page there with
// no event on it is just a page we could not read.

import { toHttpUrl } from '../normalize/extractImage.js';
import { decodeEntities } from '../scraping/parsers/jsonLdAgendaParser.js';
import { jsonLdRecords, readOpenGraph, schemaTypes } from './eventLinkExtract.js';

export type CandidateKind = 'venue' | 'artist' | 'profile';

export type CandidateLinkKey =
  | 'website'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'spotify'
  | 'apple_music'
  | 'bandcamp'
  | 'soundcloud';

/** What the admin sees and the «Crear sala / Crear artista» buttons use. */
export type LinkCandidate = {
  kind: CandidateKind;
  name: string | null;
  city: string | null;
  address: string | null;
  /** The venue's or artist's own website (never a platform or ticket page). */
  website: string | null;
  links: Partial<Record<CandidateLinkKey, string>>;
  imageUrl: string | null;
  description: string | null;
  /** Why it was read this way, e.g. ['json-ld:BarOrPub'] or ['address', 'agenda']. */
  evidence: string[];
};

type JsonRecord = Record<string, unknown>;

// Ticket sellers and self-service ticketing: their pages are events or
// listings, never a venue's or an artist's own site.
export const TICKET_PLATFORM_HOSTS = [
  'dice.fm',
  'ticketmaster.es',
  'ticketmaster.com',
  'livenation.es',
  'seetickets.com',
  'entradas.com',
  'wegow.com',
  'feverup.com',
  'elcorteingles.es',
  'entradium.com',
  'eventbrite.es',
  'eventbrite.com',
  'universe.com',
  'enterticket.es',
  'giglon.com',
  'ticketea.com',
  'taquilla.com',
  'compralaentrada.com',
  'redentradas.com',
  'woutick.com',
  'bclever.tv',
  'tickettailor.com',
  'songkick.com',
  'bandsintown.com',
];

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

const onHost = (host: string, list: string[]) => list.some(item => host === item || host.endsWith(`.${item}`));

export const isTicketPlatform = (url: string) => onHost(hostOf(url), TICKET_PLATFORM_HOSTS);

const text = (value: unknown): string | null => {
  const out = typeof value === 'string' ? decodeEntities(value).replace(/\s+/g, ' ').trim() : '';
  return out || null;
};

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;

// --- From the address ----------------------------------------------------------

/** platform null: a map place (the link is not a profile to keep). */
export type UrlClass = { kind: CandidateKind; platform: CandidateLinkKey | null; handle: string | null };

const RESERVED_INSTAGRAM = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct']);
const RESERVED_FACEBOOK = new Set(['events', 'groups', 'watch', 'share', 'sharer', 'photo', 'photos', 'story.php', 'permalink.php', 'login']);
const RESERVED_SOUNDCLOUD = new Set(['discover', 'search', 'stream', 'upload', 'charts', 'you', 'pages']);

/** An artist platform or a social profile, from the address alone; null otherwise. */
export const classifyUrl = (rawUrl: string): UrlClass | null => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'open.spotify.com') {
    const index = parts.findIndex(part => part === 'artist');
    return index >= 0 && parts[index + 1] ? { kind: 'artist', platform: 'spotify', handle: null } : null;
  }
  if (host === 'music.apple.com') {
    return parts.includes('artist') ? { kind: 'artist', platform: 'apple_music', handle: null } : null;
  }
  if (host.endsWith('.bandcamp.com') && host !== 'daily.bandcamp.com') {
    // The artist's page (/, /music); an album or a track is still theirs.
    return { kind: 'artist', platform: 'bandcamp', handle: host.replace(/\.bandcamp\.com$/, '') };
  }
  if (host === 'soundcloud.com') {
    return parts.length >= 1 && !RESERVED_SOUNDCLOUD.has(parts[0]) ? { kind: 'artist', platform: 'soundcloud', handle: parts[0] } : null;
  }
  if (host === 'instagram.com') {
    return parts.length >= 1 && !RESERVED_INSTAGRAM.has(parts[0]) ? { kind: 'profile', platform: 'instagram', handle: parts[0] } : null;
  }
  if (host === 'tiktok.com') {
    return parts[0]?.startsWith('@') && parts[0].length > 1 ? { kind: 'profile', platform: 'tiktok', handle: parts[0].slice(1) } : null;
  }
  if (host === 'facebook.com') {
    return parts.length >= 1 && !RESERVED_FACEBOOK.has(parts[0]) && parts[0] !== 'profile.php'
      ? { kind: 'profile', platform: 'facebook', handle: parts[0] }
      : null;
  }
  if (host === 'youtube.com') {
    if (parts[0]?.startsWith('@') && parts[0].length > 1) return { kind: 'profile', platform: 'youtube', handle: parts[0].slice(1) };
    if (['channel', 'c', 'user'].includes(parts[0] ?? '') && parts[1]) return { kind: 'profile', platform: 'youtube', handle: parts[0] === 'channel' ? null : parts[1] };
    return null;
  }
  // A place on Google Maps («Compartir» on a bar): /maps/place/El+Bar+Mutante/@…
  if (/^(?:maps\.)?google\.[a-z.]+$/.test(host) && parts[0] === 'maps' && parts[1] === 'place' && parts[2]) {
    let name = parts[2];
    try {
      name = decodeURIComponent(name.replace(/\+/g, ' '));
    } catch {
      name = name.replace(/\+/g, ' ');
    }
    return { kind: 'venue', platform: null, handle: name.trim() || null };
  }
  if (host === 'linktr.ee') {
    return parts.length === 1 ? { kind: 'profile', platform: 'website', handle: parts[0] } : null;
  }
  return null;
};

// --- Names ------------------------------------------------------------------------

const PLATFORM_NAMES = /^(instagram|facebook|tiktok|youtube|spotify|apple music|bandcamp|soundcloud|linktree|log in|login|iniciar sesi[oó]n|inicio|home|bienvenid[oa]s?)$/i;

/**
 * A display name from a page title: «Name (@handle) • Instagram photos…» →
 * «Name»; «Name on Apple Music» → «Name»; «El Bar Mutante – Bar y espacio…»
 * → «El Bar Mutante». Null when what is left is the platform itself.
 */
export const cleanName = (raw: string | null | undefined): string | null => {
  let name = text(raw);
  if (!name) return null;
  name = name
    .replace(/\s*\(@[^)]*\)/g, '')
    .split(/\s+[|•·–—]\s+|\s+-\s+/)[0]
    .replace(/\s+(?:on|en)\s+(?:Apple Music|Spotify|SoundCloud|YouTube|Bandcamp|Instagram|Facebook|TikTok)$/i, '')
    .replace(/^(?:Music|Música) by\s+/i, '')
    .replace(/\s*\|\s*Spotify$/i, '')
    .trim();
  if (!name || name.length > 120 || PLATFORM_NAMES.test(name)) return null;
  return name;
};

// --- From the page ------------------------------------------------------------------

const VENUE_TYPES = new Set([
  'LocalBusiness',
  'BarOrPub',
  'NightClub',
  'MusicVenue',
  'EventVenue',
  'Place',
  'PerformingArtsTheater',
  'EntertainmentBusiness',
  'CafeOrCoffeeShop',
  'Restaurant',
  'StadiumOrArena',
  'CivicStructure',
]);
const ARTIST_TYPES = new Set(['MusicGroup', 'PerformingGroup', 'DanceGroup', 'TheaterGroup']);

const ARTIST_PLATFORM_LINK: Array<[CandidateLinkKey, RegExp]> = [
  ['spotify', /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?artist\/[A-Za-z0-9]+/i],
  ['apple_music', /^https?:\/\/music\.apple\.com\/[a-z]{2}\/artist\/[^\s"'?#]+/i],
  ['bandcamp', /^https?:\/\/(?!daily\.)[a-z0-9-]+\.bandcamp\.com\/?/i],
  ['soundcloud', /^https?:\/\/(?:www\.)?soundcloud\.com\/[^/\s"'?#]+\/?$/i],
];
const SOCIAL_LINK: Array<[CandidateLinkKey, RegExp]> = [
  ['instagram', /^https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel|explore|stories)[A-Za-z0-9._]+\/?/i],
  ['facebook', /^https?:\/\/(?:www\.|m\.)?facebook\.com\/(?!sharer|share|events|groups|watch|dialog|plugins|tr\b)[^/\s"'?#]+\/?/i],
  ['tiktok', /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/\s"'?#]+/i],
  ['youtube', /^https?:\/\/(?:www\.)?youtube\.com\/(?:@[^/\s"'?#]+|channel\/[^/\s"'?#]+|c\/[^/\s"'?#]+|user\/[^/\s"'?#]+)/i],
];

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

const pageLinks = (html: string, pageUrl: string): string[] =>
  Array.from(html.matchAll(HREF_RE), match => toHttpUrl(decodeEntities(match[1]), pageUrl) ?? decodeEntities(match[1]));

/** Visible text: no scripts, styles or tags. */
export const visibleText = (html: string): string =>
  decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

const firstMatchingLinks = (links: string[], patterns: Array<[CandidateLinkKey, RegExp]>) => {
  const found: Partial<Record<CandidateLinkKey, string>> = {};
  for (const link of links) {
    for (const [key, pattern] of patterns) {
      if (!found[key] && pattern.test(link)) found[key] = link.replace(/[?#].*$/, '');
    }
  }
  return found;
};

// «Calle Fresa 15, Alameda de Hércules 41002, Sevilla» → 41002 + Sevilla.
const POSTAL_RE = /\b((?:0[1-9]|[1-4]\d|5[0-2])\d{3})\s*[,.]?\s+([A-ZÁÉÍÓÚÑ][\p{L}'’.-]+(?:\s+(?:de\s+|del\s+|la\s+|el\s+)?[A-ZÁÉÍÓÚÑ][\p{L}'’.-]+){0,3})/u;
const STREET_RE = /\b(?:C\/|Calle|Avda\.?|Avenida|Plaza|Pza\.?|Paseo|Ronda|Camino|Carrer|Travesía|Glorieta)\s+[^,.;]{2,60}/i;

const VENUE_WORDS = /\b(sala|bar|pub|club|caf[eé]|teatro|auditorio|espacio|tablao|garito|discoteca|taberna|cervecer[ií]a|local de conciertos|music hall|live music|m[uú]sica en directo|centro cultural|ateneo)\b/i;
const AGENDA_WORDS = /\b(pr[oó]ximos (?:eventos|conciertos|shows)|agenda|programaci[oó]n|cartelera|calendario de (?:eventos|conciertos)|conciertos)\b/i;
const ARTIST_WORDS = /\b(banda|grupo|cantante|cantautor[a]?|rapero|dj|discograf[ií]a|nuevo (?:single|disco|[aá]lbum)|gira|tour|official (?:site|website)|web oficial|press kit|booking)\b/i;
const MONTHS_RE = /\b(\d{1,2}\s+(?:de\s+)?(?:ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)|(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{1,2})\b/gi;

const isHomePage = (pageUrl: string) => {
  try {
    return new URL(pageUrl).pathname.split('/').filter(Boolean).length <= 1;
  } catch {
    return false;
  }
};

const originOf = (pageUrl: string) => {
  try {
    return `${new URL(pageUrl).origin}/`;
  } catch {
    return null;
  }
};

const readAddress = (value: unknown) => {
  const address = asRecord(value);
  const raw = typeof value === 'string' ? text(value) : null;
  const street = text(address?.streetAddress) ?? raw;
  const locality = text(address?.addressLocality) ?? (raw ? (raw.match(POSTAL_RE)?.[2] ?? null) : null);
  return { street, city: locality };
};

const sameAsLinks = (record: JsonRecord): string[] => {
  const value = record.sameAs;
  return (Array.isArray(value) ? value : [value]).flatMap(item => (typeof item === 'string' ? [item] : []));
};

const fromJsonLd = (record: JsonRecord, kind: 'venue' | 'artist', type: string, pageUrl: string, fallback: LinkCandidate): LinkCandidate => {
  const address = readAddress(record.address);
  const links = {
    ...fallback.links,
    ...firstMatchingLinks(sameAsLinks(record), [...ARTIST_PLATFORM_LINK, ...SOCIAL_LINK]),
  };
  const ownUrl = text(record.url);
  const website = ownUrl && !classifyUrl(ownUrl) && !isTicketPlatform(ownUrl) ? (toHttpUrl(ownUrl, pageUrl) ?? fallback.website) : fallback.website;
  return {
    ...fallback,
    kind,
    name: cleanName(text(record.name)) ?? fallback.name,
    city: address.city ?? fallback.city,
    address: address.street ?? fallback.address,
    website,
    links,
    evidence: [`json-ld:${type}`],
  };
};

export type PageClass = { kind: 'venue' | 'artist'; candidate: LinkCandidate } | null;

/**
 * A venue's or an artist's own page, or null when the page does not say
 * clearly enough (the suggestion then waits for a person, as before).
 */
export const classifyPage = (html: string, pageUrl: string): PageClass => {
  if (isTicketPlatform(pageUrl)) return null;
  const openGraph = readOpenGraph(html, pageUrl);
  const links = pageLinks(html, pageUrl);
  const body = visibleText(html);
  const siteName = cleanName(openGraph.siteName) ?? cleanName(openGraph.title);
  const titleLine = [openGraph.title, openGraph.siteName, openGraph.description].filter(Boolean).join(' · ');
  const socials = firstMatchingLinks(links, SOCIAL_LINK);
  const platforms = firstMatchingLinks(links, ARTIST_PLATFORM_LINK);
  const postal = body.match(POSTAL_RE);

  const base: LinkCandidate = {
    kind: 'venue',
    name: siteName,
    city: postal?.[2] ?? null,
    address: body.match(STREET_RE)?.[0]?.trim() ?? null,
    website: isHomePage(pageUrl) ? originOf(pageUrl) : null,
    links: { ...socials },
    imageUrl: openGraph.imageUrl ?? null,
    description: openGraph.description?.slice(0, 500) ?? null,
    evidence: [],
  };

  // 1. The page says what it is.
  for (const record of jsonLdRecords(html)) {
    const types = schemaTypes(record);
    const artistType = types.find(type => ARTIST_TYPES.has(type));
    if (artistType) return { kind: 'artist', candidate: fromJsonLd(record, 'artist', artistType, pageUrl, { ...base, links: { ...socials, ...platforms } }) };
    const venueType = types.find(type => VENUE_TYPES.has(type));
    if (venueType) return { kind: 'venue', candidate: fromJsonLd(record, 'venue', venueType, pageUrl, base) };
  }

  // 2. Signals.
  const venueEvidence: string[] = [];
  let venueScore = 0;
  if (VENUE_WORDS.test(titleLine)) {
    venueScore += 2;
    venueEvidence.push('name');
  }
  if (AGENDA_WORDS.test(body) || AGENDA_WORDS.test(titleLine)) {
    venueScore += 1;
    venueEvidence.push('agenda');
  }
  if (postal) {
    venueScore += 2;
    venueEvidence.push('address');
  } else if (base.address) {
    venueScore += 1;
    venueEvidence.push('street');
  }
  if (links.some(link => /google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(link))) {
    venueScore += 1;
    venueEvidence.push('map');
  }
  if (links.some(link => /^tel:/i.test(link))) {
    venueScore += 1;
    venueEvidence.push('phone');
  }
  if ((body.match(MONTHS_RE) ?? []).length >= 3) {
    venueScore += 1;
    venueEvidence.push('dates');
  }
  if (isHomePage(pageUrl)) venueScore += 1;

  const platformCount = Object.keys(platforms).length;
  const artistEvidence: string[] = Object.keys(platforms).map(key => `link:${key}`);
  let artistScore = platformCount * 2;
  if (ARTIST_WORDS.test(titleLine)) {
    artistScore += 2;
    artistEvidence.push('name');
  } else if (ARTIST_WORDS.test(body.slice(0, 3000))) {
    artistScore += 1;
    artistEvidence.push('words');
  }

  // A venue page links to the artists it books, so an address beats
  // platform links; an artist's site rarely has a postal address.
  if (venueScore >= 5 && (postal || venueScore > artistScore)) {
    return { kind: 'venue', candidate: { ...base, evidence: venueEvidence } };
  }
  if (artistScore >= 3 && venueScore < 5) {
    return {
      kind: 'artist',
      candidate: { ...base, kind: 'artist', city: null, address: null, links: { ...socials, ...platforms }, evidence: artistEvidence },
    };
  }
  return null;
};

/** A candidate from an artist platform or social profile link (page optional: it may not load). */
export const candidateFromUrl = (urlClass: UrlClass, url: string, html: string | null): LinkCandidate => {
  const openGraph = html ? readOpenGraph(html, url) : {};
  // A map place is named in its address; a profile's page title is better
  // than its handle.
  const name = urlClass.platform
    ? (cleanName(openGraph.title) ?? cleanName(openGraph.siteName) ?? urlClass.handle)
    : (urlClass.handle ?? cleanName(openGraph.title));
  return {
    kind: urlClass.kind,
    name,
    city: null,
    address: null,
    website: null,
    links: urlClass.platform ? { [urlClass.platform]: url.replace(/[?#].*$/, '') } : {},
    imageUrl: openGraph.imageUrl ?? null,
    description: openGraph.description?.slice(0, 500) ?? null,
    evidence: [`url:${urlClass.platform ?? 'map'}`],
  };
};
