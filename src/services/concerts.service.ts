import { supabase } from '../api';
import { normalizeForMatching } from '../normalize/normalizeText';
import { isMissingRelation } from './claims.service';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type ProposalReviewer = 'venue' | 'moderation';

export type ConcertProposal = {
  id: string;
  event_id: string;
  venue_place_id: string;
  artist_id: string | null;
  reviewer: ProposalReviewer;
  status: ProposalStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  event: {
    id: string;
    name: string;
    starts_at: string;
    ticket_url: string | null;
    image_url: string | null;
    lineup: string[];
  } | null;
  venue: { id: string; name: string; city: string | null } | null;
  artist: { id: string; name: string } | null;
};

export type VenueOption = { id: string; name: string; city: string | null };
export type ArtistPick = { id: string | null; name: string };

export type CreateConcertInput = {
  venueId: string;
  startsAt: Date;
  name: string;
  lineup: ArtistPick[];
  ticketUrl?: string | null;
  imageUrl?: string | null;
  // The artist the caller acts for when they do not manage the venue.
  asArtistId?: string | null;
};

export type CreateConcertResult = {
  eventId: string;
  status: 'published' | 'review';
  reviewer: ProposalReviewer | null;
};

const PROPOSAL_COLUMNS =
  'id,event_id,venue_place_id,artist_id,reviewer,status,review_note,created_at,reviewed_at,' +
  'event:events(id,name,starts_at,ticket_url,image_url,lineup:event_artists(billing_order,artist:artists(name))),' +
  'venue:venue_places(id,name,city),artist:artists(id,name)';

const mapProposal = (row: any): ConcertProposal => ({
  id: row.id,
  event_id: row.event_id,
  venue_place_id: row.venue_place_id,
  artist_id: row.artist_id ?? null,
  reviewer: row.reviewer,
  status: row.status,
  review_note: row.review_note ?? null,
  created_at: row.created_at,
  reviewed_at: row.reviewed_at ?? null,
  event: row.event
    ? {
        id: row.event.id,
        name: row.event.name,
        starts_at: row.event.starts_at,
        ticket_url: row.event.ticket_url ?? null,
        image_url: row.event.image_url ?? null,
        lineup: [...(row.event.lineup || [])]
          .sort((a: any, b: any) => a.billing_order - b.billing_order)
          .map((item: any) => item.artist?.name)
          .filter(Boolean),
      }
    : null,
  venue: row.venue ?? null,
  artist: row.artist ?? null,
});

// Proposal lists are empty until the concert_proposals migration is applied.
const listProposals = async (
  build: (query: any) => any,
): Promise<ConcertProposal[]> => {
  const { data, error } = await build(supabase.from('event_proposals').select(PROPOSAL_COLUMNS));
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data || []).map(mapProposal);
};

// Strips characters that would break a PostgREST or() filter.
const cleanSearch = (value: string) => value.replace(/[,()%*\\]/g, ' ').trim();

// Before the migration: the event goes to review as it always did.
const createConcertLegacy = async (input: CreateConcertInput, userId: string): Promise<CreateConcertResult> => {
  const { data: venue, error: venueError } = await supabase
    .from('venue_places')
    .select('id,city,address,latitude,longitude')
    .eq('id', input.venueId)
    .single();
  if (venueError) throw venueError;

  const artistIds: string[] = [];
  for (const pick of input.lineup) {
    let id = pick.id;
    if (!id) {
      const key = normalizeForMatching(pick.name);
      const { data: existing } = await supabase.from('artists').select('id').eq('normalized_name', key).neq('status', 'archived').limit(1);
      id = existing?.[0]?.id ?? null;
      if (!id) {
        const { data: created, error } = await supabase
          .from('artists')
          .insert({ name: pick.name.trim(), normalized_name: key, status: 'published', created_by: userId })
          .select('id')
          .single();
        if (error) throw error;
        id = created.id as string;
      }
    }
    if (id && !artistIds.includes(id)) artistIds.push(id);
  }
  if (input.asArtistId && !artistIds.includes(input.asArtistId)) artistIds.unshift(input.asArtistId);

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      venue_place_id: venue.id,
      name: input.name.trim(),
      normalized_name: normalizeForMatching(input.name),
      starts_at: input.startsAt.toISOString(),
      city: venue.city,
      address: venue.address,
      latitude: venue.latitude,
      longitude: venue.longitude,
      ticket_url: input.ticketUrl || null,
      image_url: input.imageUrl || null,
      image_source: input.imageUrl ? 'manual' : null,
      status: 'review',
      created_by: userId,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (artistIds.length) {
    const { error: lineupError } = await supabase.from('event_artists').insert(
      artistIds.map((artistId, index) => ({
        event_id: event.id,
        artist_id: artistId,
        billing_order: index,
        is_headliner: index === 0,
      })),
    );
    if (lineupError) throw lineupError;
  }
  return { eventId: event.id as string, status: 'review', reviewer: 'moderation' };
};

const CREATE_ERRORS: Array<[RegExp, string]> = [
  [/already in the agenda/i, 'Ese concierto ya está en la agenda.'],
  [/Only venue or artist managers/i, 'Solo quien gestiona la sala o el artista puede añadir conciertos.'],
  [/Venue not found/i, 'No encontramos esa sala.'],
  [/Artist not found/i, 'Uno de los artistas ya no existe.'],
  [/Invalid ticket link/i, 'El enlace de entradas tiene que empezar por https://'],
  [/must end after/i, 'La hora de fin debe ser posterior a la de inicio.'],
];

const REVIEW_ERRORS: Array<[RegExp, string]> = [
  [/already reviewed|no longer waiting/i, 'Esta propuesta ya se ha resuelto.'],
  [/Only the venue managers/i, 'Solo quien gestiona la sala puede decidir.'],
  [/Reason too long/i, 'El motivo es demasiado largo (máx. 280).'],
];

const friendly = (error: { message?: string } | null | undefined, table: Array<[RegExp, string]>) => {
  const message = error?.message || '';
  const match = table.find(([pattern]) => pattern.test(message));
  return new Error(match ? match[1] : message || 'Ha ocurrido un error inesperado.');
};

export const concertsService = {
  async searchVenues(query: string): Promise<VenueOption[]> {
    const term = cleanSearch(query);
    if (term.length < 2) return [];
    const { data, error } = await supabase
      .from('v_subject_venues')
      .select('venue_place_id,name,city')
      .or(`name.ilike.%${term}%,city.ilike.%${term}%`)
      .order('name', { ascending: true })
      .limit(12);
    if (error) throw error;
    return (data || []).map((row: any) => ({ id: row.venue_place_id, name: row.name, city: row.city ?? null }));
  },

  async searchArtists(query: string): Promise<Array<{ id: string; name: string; avatar_url: string | null }>> {
    const term = cleanSearch(query);
    if (term.length < 2) return [];
    const { data, error } = await supabase
      .from('v_subject_artists')
      .select('artist_id,name,avatar_url')
      .ilike('name', `%${term}%`)
      .order('name', { ascending: true })
      .limit(8);
    if (error) throw error;
    return (data || []).map((row: any) => ({ id: row.artist_id, name: row.name, avatar_url: row.avatar_url ?? null }));
  },

  // create_concert() decides in the database whether the concert is published
  // (the caller manages the venue) or proposed to the venue.
  async createConcert(input: CreateConcertInput, userId: string): Promise<CreateConcertResult> {
    const { data, error } = await supabase.rpc('create_concert', {
      p_venue_place_id: input.venueId,
      p_starts_at: input.startsAt.toISOString(),
      p_name: input.name.trim(),
      p_normalized_name: normalizeForMatching(input.name),
      p_artist_ids: input.lineup.filter(pick => pick.id).map(pick => pick.id),
      p_new_artists: input.lineup
        .filter(pick => !pick.id)
        .map(pick => ({ name: pick.name.trim(), normalized_name: normalizeForMatching(pick.name) })),
      p_ticket_url: input.ticketUrl || null,
      p_image_url: input.imageUrl || null,
      p_as_artist_id: input.asArtistId || null,
    });
    if (error) {
      if (isMissingRelation(error)) return createConcertLegacy(input, userId);
      throw friendly(error, CREATE_ERRORS);
    }
    return {
      eventId: data.event_id,
      status: data.status === 'published' ? 'published' : 'review',
      reviewer: data.reviewer ?? null,
    };
  },

  // Pending only: what the venue still has to decide.
  listForVenue(venuePlaceId: string) {
    return listProposals(query =>
      query.eq('venue_place_id', venuePlaceId).eq('status', 'pending').order('created_at', { ascending: true }).limit(50),
    );
  },

  listForArtist(artistId: string) {
    return listProposals(query =>
      query.eq('artist_id', artistId).order('created_at', { ascending: false }).limit(30),
    );
  },

  listForModeration() {
    return listProposals(query =>
      query.eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
    );
  },

  async review(proposalId: string, accept: boolean, note?: string | null): Promise<void> {
    const { error } = await supabase.rpc('review_concert_proposal', {
      p_proposal_id: proposalId,
      p_accept: accept,
      p_note: note?.trim() || null,
    });
    if (error) throw friendly(error, REVIEW_ERRORS);
  },
};
