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
    .select('artist_id')
    .eq('event_id', eventId);

  if (error) {
    throw error;
  }

  const existingIds = new Set(
    (data || [])
      .map((row) => (row as { artist_id?: string | null }).artist_id || null)
      .filter(Boolean) as string[]
  );

  const rowsToInsert = artistIds
    .filter((artistId) => !existingIds.has(artistId))
    .map((artistId) => ({
      event_id: eventId,
      artist_id: artistId,
      billing_order: artistIds.indexOf(artistId),
      is_headliner: artistIds.indexOf(artistId) === 0,
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
