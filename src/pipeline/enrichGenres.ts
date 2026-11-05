import type { SupabaseClient } from '@supabase/supabase-js';

import { Logger } from '../utils/logger.js';
import { DeezerClient } from './deezerArtists.js';
import { type Style, stylesFromDeezerGenres, stylesInText, tagsFromPayload, topStyles } from './genres.js';

// Fills artists.genres and events.genres with the app's styles (genres.ts),
// which is what "Para ti", the taste picker and the style filters read.
// Idempotent: it only writes rows whose genres are still empty.
//
// 1. Artists matched on Deezer: the genres of their albums.
// 2. Upcoming concerts: the tags their venue gave the listing, plus the
//    styles of their artists; the description only when neither says
//    anything.
// 3. Artists still without a style (local acts Deezer does not know): the
//    styles of the nights they headline or play alone, from the venue's
//    tags and description, never from other artists.

export type EnrichGenresOptions = {
  dryRun?: boolean;
  artistLimit?: number;
  now?: Date;
};

export type EnrichGenresSummary = {
  artistsFromDeezer: number;
  deezerChecked: number;
  eventsTagged: number;
  eventsChecked: number;
  artistsFromEvents: number;
};

const PAGE_SIZE = 500;
const ID_BATCH = 100;

type ArtistRow = { id: string; name: string; genres: string[] | null; external_ids: Record<string, unknown> | null };
type EventRow = { id: string; name: string; description: string | null };
type LineupRow = { event_id: string; artist_id: string; is_headliner: boolean };

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
};

const fetchAll = async <T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
};

const isEmpty = (genres: string[] | null | undefined) => !genres || genres.length === 0;

export const enrichGenres = async (
  supabase: SupabaseClient,
  options: EnrichGenresOptions,
  logger: Logger,
  deezer = new DeezerClient(),
): Promise<EnrichGenresSummary> => {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const summary: EnrichGenresSummary = {
    artistsFromDeezer: 0,
    deezerChecked: 0,
    eventsTagged: 0,
    eventsChecked: 0,
    artistsFromEvents: 0,
  };

  const artists = await fetchAll<ArtistRow>((from, to) =>
    supabase.from('artists').select('id,name,genres,external_ids').order('id').range(from, to),
  );
  const artistStyles = new Map<string, string[]>(artists.map((artist) => [artist.id, artist.genres || []]));

  const setArtistGenres = async (artistId: string, styles: Style[]) => {
    artistStyles.set(artistId, styles);
    if (dryRun) return;
    const { error } = await supabase.from('artists').update({ genres: styles }).eq('id', artistId).eq('genres', '{}');
    if (error) throw error;
  };

  // 1. Deezer discographies.
  const deezerArtists = artists
    .filter((artist) => isEmpty(artist.genres) && artist.external_ids?.deezer != null)
    .slice(0, options.artistLimit ?? 600);
  for (const artist of deezerArtists) {
    summary.deezerChecked += 1;
    try {
      const styles = stylesFromDeezerGenres(await deezer.albumGenreIds(String(artist.external_ids?.deezer)));
      if (styles.length === 0) continue;
      await setArtistGenres(artist.id, styles);
      summary.artistsFromDeezer += 1;
      logger.debug('Artist styles from Deezer', { artist: artist.name, styles });
    } catch (error) {
      logger.warn('Deezer genres failed', { artist: artist.name, error: String(error) });
    }
  }

  // 2. Upcoming concerts.
  const events = await fetchAll<EventRow>((from, to) =>
    supabase
      .from('events')
      .select('id,name,description')
      .eq('status', 'published')
      .eq('genres', '{}')
      .gte('starts_at', now.toISOString())
      .order('starts_at')
      .range(from, to),
  );
  summary.eventsChecked = events.length;

  const lineups = new Map<string, LineupRow[]>();
  const tagStyles = new Map<string, Style[]>();
  for (const batch of chunks(events.map((event) => event.id), ID_BATCH)) {
    const [{ data: lineupRows, error: lineupError }, { data: stagingRows, error: stagingError }] = await Promise.all([
      supabase.from('event_artists').select('event_id,artist_id,is_headliner').in('event_id', batch),
      supabase.from('staging_events').select('published_event_id,raw_payload').in('published_event_id', batch),
    ]);
    if (lineupError) throw lineupError;
    if (stagingError) throw stagingError;
    for (const row of (lineupRows || []) as LineupRow[]) {
      lineups.set(row.event_id, [...(lineups.get(row.event_id) || []), row]);
    }
    for (const row of (stagingRows || []) as Array<{ published_event_id: string; raw_payload: unknown }>) {
      const payload = (row.raw_payload as { payload?: unknown } | null)?.payload;
      const styles = stylesInText(tagsFromPayload(payload).join(' · '));
      if (styles.length) tagStyles.set(row.published_event_id, [...new Set([...(tagStyles.get(row.published_event_id) || []), ...styles])]);
    }
  }

  // What the venue said about each night, kept apart from the artists' own
  // styles so step 3 does not copy one artist's style onto another.
  const nightStyles = new Map<string, Style[]>();
  for (const event of events) {
    const fromTags = tagStyles.get(event.id) || [];
    nightStyles.set(event.id, fromTags.length ? fromTags : stylesInText(`${event.name} ${event.description || ''}`).slice(0, 2));
  }

  // 3. Local acts: the nights they lead.
  const ledNights = new Map<string, Style[][]>();
  for (const [eventId, lineup] of lineups) {
    const styles = nightStyles.get(eventId) || [];
    if (!styles.length) continue;
    const leaders = lineup.length === 1 ? lineup : lineup.filter((entry) => entry.is_headliner);
    for (const entry of leaders) ledNights.set(entry.artist_id, [...(ledNights.get(entry.artist_id) || []), styles]);
  }
  for (const [artistId, nights] of ledNights) {
    if (!isEmpty(artistStyles.get(artistId))) continue;
    const styles = topStyles(nights, 2);
    if (!styles.length) continue;
    await setArtistGenres(artistId, styles);
    summary.artistsFromEvents += 1;
    logger.debug('Artist styles from their nights', { artistId, styles });
  }

  for (const event of events) {
    const fromArtists = (lineups.get(event.id) || []).map((entry) => (artistStyles.get(entry.artist_id) || []) as Style[]);
    const fromTags = tagStyles.get(event.id) || [];
    let styles = topStyles([fromTags, fromTags, ...fromArtists], 3);
    if (!styles.length) styles = nightStyles.get(event.id) || [];
    if (!styles.length) continue;
    summary.eventsTagged += 1;
    logger.debug('Concert styles', { event: event.name, styles, fromTags });
    if (dryRun) continue;
    const { error } = await supabase.from('events').update({ genres: styles }).eq('id', event.id).eq('genres', '{}');
    if (error) throw error;
  }

  logger.info('Genre enrichment completed', { dryRun, ...summary });
  return summary;
};
