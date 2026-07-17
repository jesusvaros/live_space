import type { AiExtractionPayload, NormalizedArtist, NormalizedEvent, EventType } from '../types/domain.js';
import type { ScrapeSource, StagingEventRecord } from '../types/scrape.js';
import { normalizeArtistNames } from './normalizeArtist.js';
import { cleanupDisplayText, hasExcessiveNoise, normalizeForMatching } from './normalizeText.js';
import { normalizeVenue } from './normalizeVenue.js';

export type EventNormalizationResult = {
  normalizedEvent: NormalizedEvent;
  needsAi: boolean;
  aiReasons: string[];
};

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  june: 5,
  july: 6,
  august: 7,
  october: 9,
  november: 10,
  december: 11,
};

const SPAIN_TIMEZONE = 'Europe/Madrid';

const getTimeZoneOffset = (date: Date, timeZone: string): number => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
};

const buildMadridDate = (
  year: number,
  month: number,
  day: number,
  hour = 20,
  minute = 0
): Date => {
  const seed = new Date(Date.UTC(year, month, day, hour, minute, 0));
  const offset = getTimeZoneOffset(seed, SPAIN_TIMEZONE);
  return new Date(seed.getTime() - offset);
};

const parseTime = (value: string): { hour: number; minute: number } => {
  const timeMatch = value.match(/(\d{1,2})[:.h](\d{2})/i);
  if (!timeMatch) {
    return { hour: 20, minute: 0 };
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  return {
    hour: Number.isFinite(hour) ? hour : 20,
    minute: Number.isFinite(minute) ? minute : 0,
  };
};

export const parseDateTextToIso = (
  input: string | undefined | null,
  referenceDate = new Date()
): string | null => {
  const value = cleanupDisplayText(input);
  if (!value) {
    return null;
  }

  // The built-in parser is intentionally limited to ISO-like input here.
  // Runtime-dependent parsing of localized strings such as
  // "10 diciembre 2026" can silently produce a different valid date.
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    const directDate = new Date(value);
    if (!Number.isNaN(directDate.getTime())) {
      return directDate.toISOString();
    }
  }

  const monthNameMatch = value
    .toLowerCase()
    .match(/(\d{1,2})\s*(?:de)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|june|july|august|october|november|december)(?:\s*(?:de)?\s*(\d{4}))?/i);

  if (monthNameMatch) {
    const { hour, minute } = parseTime(value);
    const day = Number(monthNameMatch[1]);
    const month = MONTHS[monthNameMatch[2].toLowerCase()];
    const year = monthNameMatch[3] ? Number(monthNameMatch[3]) : referenceDate.getUTCFullYear();
    let parsed = buildMadridDate(year, month, day, hour, minute);
    if (!monthNameMatch[3] && parsed.getTime() < referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000) {
      parsed = buildMadridDate(year + 1, month, day, hour, minute);
    }

    return parsed.toISOString();
  }

  const numericMatch = value.match(/(?:^|\D)(\d{1,2})[/. -](\d{1,2})(?:[/. -](\d{2,4}))?(?=\D|$)/);
  if (numericMatch) {
    const { hour, minute } = parseTime(value);
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]) - 1;
    let year = numericMatch[3] ? Number(numericMatch[3]) : referenceDate.getUTCFullYear();
    if (year < 100) {
      year += 2000;
    }

    let parsed = buildMadridDate(year, month, day, hour, minute);
    if (!numericMatch[3] && parsed.getTime() < referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000) {
      parsed = buildMadridDate(year + 1, month, day, hour, minute);
    }

    return parsed.toISOString();
  }

  return null;
};

const detectEventType = (source: ScrapeSource, title: string, description?: string): EventType => {
  const haystack = `${title} ${description || ''}`.toLowerCase();
  if (source.source_type === 'festival' || /\bfestival|lineup|cartel\b/.test(haystack)) {
    return 'festival';
  }

  if (/\bsession|sesion|sesión|club|after|all night|dj set\b/.test(haystack)) {
    return 'session';
  }

  if (title) {
    return 'concert';
  }

  return 'unknown';
};

const buildCanonicalName = (title: string | undefined, artists: NormalizedArtist[]): string => {
  if (title) {
    return title;
  }

  if (artists.length > 0) {
    return artists.map((artist) => artist.displayName).join(' + ');
  }

  return 'Untitled event';
};

export const mergeAiExtraction = (
  baseEvent: NormalizedEvent,
  aiPayload: AiExtractionPayload,
  source: ScrapeSource
): NormalizedEvent => {
  const aiArtists = aiPayload.artists
    .map((artist) => {
      const displayName = cleanupDisplayText(artist.name);
      const normalizedName = normalizeForMatching(displayName);
      if (!displayName || !normalizedName) {
        return null;
      }

      return {
        rawName: artist.name,
        displayName,
        normalizedName,
        role: artist.role,
        confidence: artist.confidence,
      };
    })
    .filter(Boolean) as NormalizedArtist[];

  const venue = normalizeVenue({
    name: aiPayload.venue_name || baseEvent.venue.name || source.name,
    city: aiPayload.city || baseEvent.venue.city || source.city,
    sourceUrl: baseEvent.venue.sourceUrl || source.base_url,
    websiteUrl: baseEvent.venue.websiteUrl,
  });

  const startsAt = baseEvent.startsAt || parseDateTextToIso(aiPayload.starts_at_text);
  const canonicalName = cleanupDisplayText(aiPayload.canonical_event_name) || baseEvent.canonicalName;

  return {
    ...baseEvent,
    canonicalName,
    normalizedName: normalizeForMatching(canonicalName),
    startsAt,
    city: cleanupDisplayText(aiPayload.city) || baseEvent.city,
    eventType: aiPayload.event_type || baseEvent.eventType,
    artists: aiArtists.length > 0 ? aiArtists : baseEvent.artists,
    venue,
    confidence: Math.max(baseEvent.confidence, aiPayload.confidence),
  };
};

export const normalizeStagingEvent = (
  record: StagingEventRecord,
  source: ScrapeSource
): EventNormalizationResult => {
  const title = cleanupDisplayText(record.extracted_title);
  const rawPayload =
    record.raw_payload && typeof record.raw_payload === 'object'
      ? (record.raw_payload as Record<string, unknown>)
      : {};
  const description = cleanupDisplayText(
    typeof rawPayload.description === 'string' ? rawPayload.description : undefined,
  );
  const artistResult = normalizeArtistNames(record.extracted_artist_names, title);
  const startsAt = record.extracted_starts_at || parseDateTextToIso(record.extracted_date_text || description || title);
  const venue = normalizeVenue({
    name: record.extracted_venue_name || source.name,
    city: record.extracted_city || source.city,
    sourceUrl: source.base_url,
    websiteUrl: typeof source.metadata.officialWebsite === 'string' ? source.metadata.officialWebsite : null,
  });
  const eventType = detectEventType(source, title || '', description);
  const canonicalName = buildCanonicalName(title, artistResult.artists);
  const normalizedName = normalizeForMatching(canonicalName);

  const aiReasons = [...artistResult.reasons];
  if (!startsAt) {
    aiReasons.push('date-unparsed');
  }
  if (title && hasExcessiveNoise(title)) {
    aiReasons.push('title-noisy');
  }
  if (eventType === 'festival') {
    aiReasons.push('festival-like-title');
  }

  const confidencePieces = [
    startsAt ? 1 : 0.35,
    venue.confidence,
    artistResult.artists.length > 0
      ? artistResult.artists.reduce((sum, artist) => sum + artist.confidence, 0) / artistResult.artists.length
      : 0.2,
    normalizedName ? 0.95 : 0.25,
  ];

  return {
    normalizedEvent: {
      canonicalName,
      normalizedName,
      description: description || undefined,
      startsAt,
      city: cleanupDisplayText(record.extracted_city) || source.city || venue.city,
      eventType,
      sourceUrl: record.source_url || source.base_url,
      sourceExternalId: record.source_event_id || undefined,
      artists: artistResult.artists,
      venue,
      confidence:
        confidencePieces.reduce((sum, value) => sum + value, 0) / confidencePieces.length,
    },
    needsAi: aiReasons.length > 0,
    aiReasons: Array.from(new Set(aiReasons)),
  };
};
