import type { SupabaseClient } from '@supabase/supabase-js';

import { dedupeArtist } from '../dedupe/dedupeArtist.js';
import type { ArtistRow, NormalizedArtist } from '../types/domain.js';
import { Logger } from '../utils/logger.js';

const ARTIST_SELECT = 'id,name,normalized_name,aliases,artist_type,city';

const dedupeAliases = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));

const detectArtistType = (displayName: string): 'solo' | 'band' => {
  return /\bband|trio|quartet|orquesta|orchestra|ensemble|collective\b/i.test(displayName)
    ? 'band'
    : 'solo';
};

export type UpsertArtistsResult = {
  rows: ArtistRow[];
  createdCount: number;
  updatedCount: number;
};

export const upsertArtists = async (
  supabase: SupabaseClient,
  artists: NormalizedArtist[],
  logger: Logger
): Promise<UpsertArtistsResult> => {
  const rows: ArtistRow[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const artist of artists) {
    const match = await dedupeArtist(supabase, artist);
    if (match.match) {
      const aliases = dedupeAliases([...(match.match.aliases || []), artist.rawName, artist.displayName]);
      const updates: Record<string, unknown> = {};

      if (!match.match.normalized_name) {
        updates.normalized_name = artist.normalizedName;
      }

      if (aliases.length !== (match.match.aliases || []).length) {
        updates.aliases = aliases;
      }

      if (Object.keys(updates).length === 0) {
        rows.push(match.match);
        continue;
      }

      const { data, error } = await supabase
        .from('artists')
        .update(updates)
        .eq('id', match.match.id)
        .select(ARTIST_SELECT)
        .single();

      if (error) {
        throw error;
      }

      updatedCount += 1;
      rows.push(data as ArtistRow);
      logger.info('Updated artist from scraper', {
        artistId: match.match.id,
        strategy: match.strategy,
      });
      continue;
    }

    const { data, error } = await supabase
      .from('artists')
      .insert({
        name: artist.displayName,
        artist_type: detectArtistType(artist.displayName),
        normalized_name: artist.normalizedName,
        aliases: dedupeAliases([artist.rawName, artist.displayName]),
      })
      .select(ARTIST_SELECT)
      .single();

    if (error) {
      throw error;
    }

    createdCount += 1;
    rows.push(data as ArtistRow);
    logger.info('Inserted artist from scraper', {
      artistId: (data as ArtistRow).id,
    });
  }

  return {
    rows,
    createdCount,
    updatedCount,
  };
};
