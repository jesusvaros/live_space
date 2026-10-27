import { supabase } from '../../lib/supabase';
import type { MatchableEvent, MatchableSetlistItem, UserEventRelation } from './matchMoments';

// Supabase reads for the moment suggestions: the concerts a user marked and a
// concert's setlist, in the shapes matchMoments expects.

export type MomentEvent = MatchableEvent & {
  name: string;
  venueName: string | null;
  artistName: string | null;
  imageUrl: string | null;
};

const EVENT_SELECT = `
  id,name,starts_at,ends_at,latitude,longitude,image_url,
  venue_place:venue_places!events_venue_place_id_fkey (name,latitude,longitude),
  event_artists (
    billing_order,is_headliner,
    artist:artists!event_artists_artist_id_fkey (name)
  )
`;

const toNumber = (value: unknown) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

const coords = (lat: unknown, lng: unknown) => {
  const latitude = toNumber(lat);
  const longitude = toNumber(lng);
  return latitude == null || longitude == null ? null : { lat: latitude, lng: longitude };
};

// Headliner first, then billing order.
const headlinerName = (rows: any[] | null | undefined): string | null => {
  const sorted = [...(rows || [])].sort((left, right) =>
    Number(Boolean(right.is_headliner)) - Number(Boolean(left.is_headliner))
    || (left.billing_order ?? 0) - (right.billing_order ?? 0));
  return sorted.find(row => row.artist?.name)?.artist?.name ?? null;
};

const mapEvent = (row: any, relation: UserEventRelation, setlist: MatchableSetlistItem[] = []): MomentEvent => ({
  id: row.id,
  name: row.name,
  startsAt: row.starts_at,
  endsAt: row.ends_at ?? null,
  // The venue's pin is curated; the event's own coordinates are a fallback.
  venue: coords(row.venue_place?.latitude, row.venue_place?.longitude) ?? coords(row.latitude, row.longitude),
  venueName: row.venue_place?.name ?? null,
  artistName: headlinerName(row.event_artists),
  imageUrl: row.image_url ?? null,
  relation,
  setlist,
});

// Strongest relation wins: attended > going > saved.
const RELATION_RANK: Record<Exclude<UserEventRelation, null>, number> = { attended: 3, going: 2, saved: 1 };

const userRelations = async (userId: string) => {
  const [saves, attendance] = await Promise.all([
    supabase.from('event_saves').select('event_id').eq('profile_id', userId),
    supabase.from('event_attendance').select('event_id,status').eq('profile_id', userId).in('status', ['going', 'attended']),
  ]);
  if (saves.error) throw saves.error;
  if (attendance.error) throw attendance.error;

  const relations = new Map<string, Exclude<UserEventRelation, null>>();
  const add = (eventId: string, relation: Exclude<UserEventRelation, null>) => {
    const current = relations.get(eventId);
    if (!current || RELATION_RANK[relation] > RELATION_RANK[current]) relations.set(eventId, relation);
  };
  for (const row of saves.data || []) add(row.event_id, 'saved');
  for (const row of attendance.data || []) add(row.event_id, row.status as 'going' | 'attended');
  return relations;
};

// Concerts the user saved or said "Voy"/"Fui" to that start inside the range.
export const fetchUserMomentEvents = async (userId: string, range: { from: Date; to: Date }): Promise<MomentEvent[]> => {
  const relations = await userRelations(userId);
  if (relations.size === 0) return [];
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .in('id', [...relations.keys()])
    .gte('starts_at', range.from.toISOString())
    .lte('starts_at', range.to.toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => mapEvent(row, relations.get((row as any).id) ?? null));
};

export const fetchEventSetlist = async (eventId: string): Promise<MatchableSetlistItem[]> => {
  const { data, error } = await supabase
    .from('event_setlist_items')
    .select('id,position,title_override,performed_at_offset_seconds,song:songs (title)')
    .eq('event_id', eventId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    position: row.position,
    title: row.title_override || row.song?.title || `Canción ${row.position}`,
    offsetSec: row.performed_at_offset_seconds ?? null,
  }));
};

// One concert with its setlist, for /subir/sugerido. The relation is filled
// when the user marked it, so clips without GPS can still match.
export const fetchMomentEvent = async (eventId: string, userId: string | null): Promise<MomentEvent | null> => {
  const [{ data, error }, setlist, relations] = await Promise.all([
    supabase.from('events').select(EVENT_SELECT).eq('id', eventId).maybeSingle(),
    fetchEventSetlist(eventId),
    userId ? userRelations(userId) : Promise.resolve(new Map<string, Exclude<UserEventRelation, null>>()),
  ]);
  if (error) throw error;
  if (!data) return null;
  return mapEvent(data, relations.get(eventId) ?? null, setlist);
};
