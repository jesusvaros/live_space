import type { SupabaseClient } from '@supabase/supabase-js';

export const upsertEventArtists = async (
  supabase: SupabaseClient,
  eventId: string,
  artistIds: string[]
): Promise<number> => {
  if (artistIds.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from('event_artists')
    .select('artist_entity_id')
    .eq('event_id', eventId);

  if (error) {
    throw error;
  }

  const existingIds = new Set(
    (data || [])
      .map((row) => (row as { artist_entity_id?: string | null }).artist_entity_id || null)
      .filter(Boolean) as string[]
  );

  const rowsToInsert = artistIds
    .filter((artistId) => !existingIds.has(artistId))
    .map((artistId) => ({
      event_id: eventId,
      artist_entity_id: artistId,
    }));

  if (rowsToInsert.length === 0) {
    return 0;
  }

  const { error: insertError } = await supabase.from('event_artists').insert(rowsToInsert);
  if (insertError) {
    throw insertError;
  }

  return rowsToInsert.length;
};
