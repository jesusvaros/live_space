import { supabase } from '../api';
import { isMissingRelation } from './claims.service';

export type ManagedEventType = 'artist' | 'venue';

export type ManagedEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  ticket_url: string | null;
  image_url: string | null;
  image_source: string | null;
  status: string;
  city: string;
  venue_place_id: string;
  venue_name: string | null;
  // Null when the migration that adds the column is not applied yet.
  manager_locked_fields: string[] | null;
  headliner: { id: string; name: string } | null;
};

export type SetlistSong = {
  key: string;
  title: string;
  songId: string | null;
};

const BASE_COLUMNS =
  'id,name,starts_at,ends_at,ticket_url,image_url,image_source,status,city,venue_place_id,venue:venue_places(name),lineup:event_artists(artist_id,is_headliner,billing_order,artist:artists(id,name))';

type EventRowWithJoins = Omit<ManagedEvent, 'venue_name' | 'headliner' | 'manager_locked_fields'> & {
  manager_locked_fields?: string[] | null;
  venue?: { name: string | null } | null;
  lineup?: Array<{ artist_id: string; is_headliner: boolean; billing_order: number; artist: { id: string; name: string } | null }>;
};

const mapEvent = (row: EventRowWithJoins): ManagedEvent => {
  const lineup = [...(row.lineup || [])].sort(
    (a, b) => Number(b.is_headliner) - Number(a.is_headliner) || a.billing_order - b.billing_order,
  );
  return {
    id: row.id,
    name: row.name,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    ticket_url: row.ticket_url,
    image_url: row.image_url ?? null,
    image_source: row.image_source ?? null,
    status: row.status,
    city: row.city,
    venue_place_id: row.venue_place_id,
    venue_name: row.venue?.name ?? null,
    manager_locked_fields: Array.isArray(row.manager_locked_fields) ? row.manager_locked_fields : null,
    headliner: lineup[0]?.artist ?? null,
  };
};

// Reads events with manager_locked_fields, falling back to the columns that
// exist before the 20261028000200 migration.
const selectEvents = async (build: (columns: string) => PromiseLike<{ data: unknown; error: any }>) => {
  const withLocks = await build(`${BASE_COLUMNS},manager_locked_fields`);
  if (!withLocks.error) return (withLocks.data || []) as EventRowWithJoins[];
  if (!isMissingRelation(withLocks.error)) throw withLocks.error;
  const plain = await build(BASE_COLUMNS);
  if (plain.error) throw plain.error;
  return (plain.data || []) as EventRowWithJoins[];
};

const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');

export const eventManagementService = {
  async listEvents(type: ManagedEventType, entityId: string): Promise<ManagedEvent[]> {
    if (type === 'venue') {
      const rows = await selectEvents(columns =>
        supabase.from('events').select(columns).eq('venue_place_id', entityId).order('starts_at', { ascending: true }).limit(300),
      );
      return rows.map(mapEvent);
    }
    const { data: links, error } = await supabase
      .from('event_artists')
      .select('event_id')
      .eq('artist_id', entityId)
      .limit(300);
    if (error) throw error;
    const ids = (links || []).map(link => link.event_id as string);
    if (!ids.length) return [];
    const rows = await selectEvents(columns =>
      supabase.from('events').select(columns).in('id', ids).order('starts_at', { ascending: true }),
    );
    return rows.map(mapEvent);
  },

  async getEvent(eventId: string): Promise<ManagedEvent | null> {
    const rows = await selectEvents(columns => supabase.from('events').select(columns).eq('id', eventId).limit(1));
    return rows[0] ? mapEvent(rows[0]) : null;
  },

  // normalized_name is left alone on purpose: the scraper still matches the
  // event by its original name after a manager renames it.
  async updateEvent(
    eventId: string,
    updates: Partial<Pick<ManagedEvent, 'name' | 'starts_at' | 'ticket_url' | 'image_url'>>,
  ): Promise<void> {
    const payload: Record<string, unknown> = { ...updates };
    if ('image_url' in updates) payload.image_source = updates.image_url ? 'manual' : null;
    const { error } = await supabase.from('events').update(payload).eq('id', eventId);
    if (error && /venue accepted this concert/i.test(error.message || '')) {
      throw new Error('La sala aceptó este concierto tal cual: pídele a la sala que lo cambie.');
    }
    if (error) throw error;
  },

  async getSetlist(eventId: string): Promise<SetlistSong[]> {
    const { data, error } = await supabase
      .from('event_setlist_items')
      .select('id,position,title_override,song_id,song:songs(id,title)')
      .eq('event_id', eventId)
      .order('position', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      key: row.id,
      title: row.song?.title ?? row.title_override ?? '',
      songId: row.song_id ?? null,
    }));
  },

  // Replaces the setlist. Every title gets a song of the performing artist so
  // that each fan video can later land on its song.
  async saveSetlist(eventId: string, performerArtistId: string | null, songs: SetlistSong[], userId: string) {
    const items: Array<{ song_id: string | null; title_override: string | null }> = [];
    let existing = new Map<string, string>();
    if (performerArtistId) {
      const { data, error } = await supabase
        .from('songs')
        .select('id,normalized_title')
        .eq('primary_artist_id', performerArtistId)
        .limit(1000);
      if (error) throw error;
      existing = new Map((data || []).map(row => [row.normalized_title as string, row.id as string]));
    }

    for (const song of songs) {
      const title = song.title.trim().replace(/\s+/g, ' ');
      if (!title) continue;
      if (!performerArtistId) {
        items.push({ song_id: null, title_override: title });
        continue;
      }
      const normalized = normalizeTitle(title);
      let songId = existing.get(normalized) ?? null;
      if (!songId) {
        const { data, error } = await supabase
          .from('songs')
          .insert({ title, normalized_title: normalized, primary_artist_id: performerArtistId })
          .select('id')
          .single();
        if (error) throw error;
        songId = data.id as string;
        existing.set(normalized, songId);
      }
      items.push({ song_id: songId, title_override: null });
    }

    const { error: deleteError } = await supabase.from('event_setlist_items').delete().eq('event_id', eventId);
    if (deleteError) throw deleteError;
    if (!items.length) return;
    const { error: insertError } = await supabase.from('event_setlist_items').insert(
      items.map((item, index) => ({
        event_id: eventId,
        position: index + 1,
        artist_id: performerArtistId,
        song_id: item.song_id,
        title_override: item.title_override,
        created_by: userId,
      })),
    );
    if (insertError) throw insertError;
  },

  // Returns the upload token for the event's QR, creating it on first use.
  // Null when the token table does not exist yet.
  async getOrCreateUploadToken(eventId: string, userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('event_upload_tokens')
      .select('token')
      .eq('event_id', eventId)
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    if (data?.token) return data.token as string;
    const { data: created, error: insertError } = await supabase
      .from('event_upload_tokens')
      .insert({ event_id: eventId, created_by: userId })
      .select('token')
      .single();
    if (insertError) {
      if (isMissingRelation(insertError)) return null;
      throw insertError;
    }
    return created.token as string;
  },

  // events.share_tag comes from another branch (social import); null until
  // that column exists.
  async getShareTag(eventId: string): Promise<string | null> {
    const { data, error } = await supabase.from('events').select('share_tag').eq('id', eventId).maybeSingle();
    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    const tag = (data as { share_tag?: string | null } | null)?.share_tag;
    return tag ? (tag.startsWith('#') ? tag : `#${tag}`) : null;
  },

  async resolveUploadToken(token: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('resolve_event_upload_token', { p_token: token });
    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    return (data as string | null) ?? null;
  },
};
