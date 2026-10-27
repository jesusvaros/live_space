import { supabase } from '../api';
import { fetchEventCards } from '../data/eventQueries';
import type { EventListItem } from '../features/events/types';
import { normalizeForMatching } from '../normalize/normalizeText';
import { isMissingRelation } from './claims.service';

export type Festival = {
  id: string;
  subjectId: string;
  name: string;
  editionYear: number | null;
  startsOn: string;
  endsOn: string;
  city: string;
  venuePlaceId: string | null;
  description: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  coverImageUrl: string | null;
  coverCredit: string | null;
  setCount: number;
};

const FESTIVAL_COLUMNS =
  'festival_id,subject_id,name,edition_year,starts_on,ends_on,city,venue_place_id,description,website_url,instagram_url,cover_image_url,cover_credit,set_count';

const mapFestival = (row: any): Festival => ({
  id: row.festival_id,
  subjectId: row.subject_id,
  name: row.name,
  editionYear: row.edition_year ?? null,
  startsOn: row.starts_on,
  endsOn: row.ends_on,
  city: row.city,
  venuePlaceId: row.venue_place_id ?? null,
  description: row.description ?? null,
  websiteUrl: row.website_url ?? null,
  instagramUrl: row.instagram_url ?? null,
  coverImageUrl: row.cover_image_url ?? null,
  coverCredit: row.cover_credit ?? null,
  setCount: row.set_count ?? 0,
});

const madridToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

// "12–14 JUN" or "30 JUN – 2 JUL" (Madrid dates, no time).
export const festivalDateRange = (festival: Pick<Festival, 'startsOn' | 'endsOn'>) => {
  const toDate = (value: string) => new Date(`${value}T12:00:00`);
  const start = toDate(festival.startsOn);
  const end = toDate(festival.endsOn);
  const month = (date: Date) => date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toUpperCase();
  if (festival.startsOn === festival.endsOn) return `${start.getDate()} ${month(start)}`;
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ${month(end)}`;
  return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
};

export const festivalService = {
  async get(id: string): Promise<Festival | null> {
    const { data, error } = await supabase.from('v_subject_festivals').select(FESTIVAL_COLUMNS).eq('festival_id', id).maybeSingle();
    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    return data ? mapFestival(data) : null;
  },

  // Festivals not over yet, soonest first. Empty until the migration runs.
  async listUpcoming(limit = 12): Promise<Festival[]> {
    const { data, error } = await supabase
      .from('v_subject_festivals')
      .select(FESTIVAL_COLUMNS)
      .eq('status', 'published')
      .gte('ends_on', madridToday())
      .order('starts_on', { ascending: true })
      .limit(limit);
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    return (data || []).map(mapFestival);
  },

  async listSets(festivalId: string): Promise<EventListItem[]> {
    return fetchEventCards({ festivalId });
  },

  async canManage(festivalId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_manage_festival', { p_festival_id: festivalId });
    if (error) return false;
    return data === true;
  },

  async saveSet(input: {
    festivalId: string;
    eventId?: string | null;
    artistName: string;
    startsAt: string;
    endsAt?: string | null;
    stage?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('festival_save_performance', {
      p_festival_id: input.festivalId,
      p_event_id: input.eventId ?? null,
      p_artist_name: input.artistName.trim(),
      p_artist_normalized: normalizeForMatching(input.artistName),
      p_starts_at: input.startsAt,
      p_stage: input.stage?.trim() || null,
      p_ends_at: input.endsAt ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  async cancelSet(eventId: string): Promise<void> {
    const { error } = await supabase.rpc('festival_cancel_performance', { p_event_id: eventId });
    if (error) throw error;
  },

  // The festival an event belongs to, for the chip on the event page.
  async forEvent(eventId: string): Promise<Pick<Festival, 'id' | 'name'> | null> {
    const { data, error } = await supabase
      .from('events')
      .select('festival:festivals!events_festival_id_fkey (id,name)')
      .eq('id', eventId)
      .maybeSingle();
    if (error) return null;
    const festival = (data as any)?.festival;
    return festival ? { id: festival.id, name: festival.name } : null;
  },
};
