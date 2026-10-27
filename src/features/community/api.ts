import { supabase } from '../../lib/supabase';

// Every count can be null: the database suppresses buckets under K people
// (k-anonymity) and the UI shows "<10" instead.
export type SuppressedCount = number | null;

export type IntentTrendPoint = {
  day: string;
  saves: SuppressedCount;
  going: SuppressedCount;
};

export type EventIntentRow = {
  event_id: string;
  name: string;
  starts_at: string;
  saves: SuppressedCount;
  going: SuppressedCount;
  attended: SuppressedCount;
};

export type EntityAudienceStats = {
  subject_id: string;
  type: 'artist' | 'venue';
  k: number;
  followers: SuppressedCount;
  totals: { saves: SuppressedCount; going: SuppressedCount; attended: SuppressedCount };
  events: EventIntentRow[];
  trend: IntentTrendPoint[];
  cities: { city: string; followers: number }[];
};

export type EventIntentStats = {
  event_id: string;
  k: number;
  saves: SuppressedCount;
  going: SuppressedCount;
  attended: SuppressedCount;
  trend: IntentTrendPoint[];
};

export const K_ANONYMITY = 10;

/** Postgres "insufficient_privilege": the caller is not a member. */
export const isForbidden = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '42501';

export const fetchEntityAudienceStats = async (subjectId: string) => {
  const { data, error } = await supabase.rpc('get_entity_audience_stats', { p_subject_id: subjectId });
  if (error) throw error;
  return data as EntityAudienceStats;
};

export const fetchEventIntentStats = async (eventId: string) => {
  const { data, error } = await supabase.rpc('get_event_intent_stats', { p_event_id: eventId });
  if (error) throw error;
  return data as EventIntentStats;
};

export type MomentLicence = {
  post_id: string;
  allow_reuse: boolean;
  is_owner: boolean;
  can_download: boolean;
  credit?: string;
  artist_name?: string;
  event_date?: string;
  media_url?: string | null;
  resource_type?: 'image' | 'video';
  format?: string | null;
};

export const fetchMomentLicence = async (postId: string) => {
  const { data, error } = await supabase.rpc('get_moment_licence', { p_post_id: postId });
  if (error) throw error;
  return data as MomentLicence;
};

export const setMomentAllowReuse = async (postId: string, allowReuse: boolean) => {
  const { data, error } = await supabase.rpc('set_moment_allow_reuse', {
    p_post_id: postId,
    p_allow_reuse: allowReuse,
  });
  if (error) throw error;
  return data as boolean;
};

export const VENUE_TAGS = [
  'sonido_bueno',
  'sonido_malo',
  'buena_visibilidad',
  'poca_visibilidad',
  'accesible',
  'colas_largas',
  'barra_rapida',
  'guardarropa',
] as const;

export type VenueTag = (typeof VENUE_TAGS)[number];

export const VENUE_TAG_LABELS: Record<VenueTag, string> = {
  sonido_bueno: 'Buen sonido',
  sonido_malo: 'Mal sonido',
  buena_visibilidad: 'Buena visibilidad',
  poca_visibilidad: 'Poca visibilidad',
  accesible: 'Accesible',
  colas_largas: 'Colas largas',
  barra_rapida: 'Barra rápida',
  guardarropa: 'Guardarropa',
};

// Picking one side of a pair drops the other: the table rejects both.
export const VENUE_TAG_OPPOSITES: Partial<Record<VenueTag, VenueTag>> = {
  sonido_bueno: 'sonido_malo',
  sonido_malo: 'sonido_bueno',
  buena_visibilidad: 'poca_visibilidad',
  poca_visibilidad: 'buena_visibilidad',
};

// Tags that warn rather than praise; the summary marks them in amber.
export const VENUE_TAG_WARNINGS: ReadonlySet<VenueTag> = new Set(['sonido_malo', 'poca_visibilidad', 'colas_largas']);

export const VENUE_FEEDBACK_MIN_VOTES = 5;

export type VenueTagSummary = { tag: VenueTag; votes: number; total: number };

export const fetchVenueFeedbackSummary = async (venuePlaceId: string) => {
  const { data, error } = await supabase.rpc('get_venue_feedback_summary', { p_venue_place_id: venuePlaceId });
  if (error) throw error;
  return ((data || []) as { tag: string; votes: number; total: number }[]).filter(
    (row): row is VenueTagSummary =>
      (VENUE_TAGS as readonly string[]).includes(row.tag) && row.votes >= VENUE_FEEDBACK_MIN_VOTES,
  );
};

export const fetchOwnVenueFeedback = async (eventId: string, profileId: string) => {
  const { data, error } = await supabase
    .from('venue_feedback')
    .select('id,tags')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; tags: VenueTag[] } | null;
};

export const submitVenueFeedback = async (input: {
  eventId: string;
  venuePlaceId: string;
  profileId: string;
  tags: VenueTag[];
}) => {
  const { error } = await supabase.from('venue_feedback').insert({
    event_id: input.eventId,
    venue_place_id: input.venuePlaceId,
    profile_id: input.profileId,
    tags: input.tags,
  });
  if (error) throw error;
};

export const reportVenueFeedback = async (venuePlaceId: string, reporterId: string) => {
  const { error } = await supabase.from('moderation_reports').insert({
    reporter_id: reporterId,
    target_type: 'venue',
    target_id: venuePlaceId,
    reason: 'venue_feedback',
    details: 'Las etiquetas de la sala no reflejan la realidad.',
  });
  if (error) throw error;
};
