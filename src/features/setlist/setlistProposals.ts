import { supabase } from '../../lib/supabase';
import { track } from '../analytics/analytics';

// Setlists proposed by the audience (migration 20261112030100). A proposal
// waits for the concert's managers or moderation; approving it writes the
// setlist with source 'audience'. Every rule lives in the database RPCs.

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'superseded';

export type MyProposal = {
  id: string;
  status: ProposalStatus;
  titles: string[];
  review_note: string | null;
  created_at: string;
};

export type SubmitResult =
  | { kind: 'pending' | 'approved'; titles: string[] }
  | { kind: 'rate_limited' | 'not_attended' | 'not_started' | 'setlist_locked' | 'invalid_titles' | 'signed_out' | 'unavailable' | 'error' };

type PostgrestLikeError = { code?: string; message?: string } | null;

const KNOWN_ERRORS = ['rate_limited', 'not_attended', 'not_started', 'setlist_locked', 'invalid_titles'] as const;

export const submitErrorKind = (error: PostgrestLikeError): Exclude<SubmitResult['kind'], 'pending' | 'approved'> => {
  const message = error?.message ?? '';
  const known = KNOWN_ERRORS.find(code => message.includes(code));
  if (known) return known;
  if (/not_signed_in/.test(message)) return 'signed_out';
  if (error?.code === 'PGRST202' || error?.code === '42883') return 'unavailable';
  return 'error';
};

export const submitSetlistProposal = async (eventId: string, titles: string[]): Promise<SubmitResult> => {
  const { data, error } = await supabase.rpc('submit_audience_setlist', { p_event_id: eventId, p_titles: titles });
  if (error) return { kind: submitErrorKind(error) };
  const row = (data || {}) as { status?: string; titles?: string[] };
  const kind = row.status === 'approved' ? 'approved' : 'pending';
  track('setlist_proposed', { status: kind, songs: (row.titles ?? titles).length });
  return { kind, titles: row.titles ?? titles };
};

/** The signed-in person's latest proposal for this concert (RLS: own rows). */
export const fetchMyLatestProposal = async (eventId: string, userId: string): Promise<MyProposal | null> => {
  const { data, error } = await supabase
    .from('setlist_proposals')
    .select('id,status,titles,review_note,created_at')
    .eq('event_id', eventId)
    .eq('proposed_by', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return null;
  return ((data || [])[0] as MyProposal | undefined) ?? null;
};

export const fetchAttendance = async (eventId: string, userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('event_attendance')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', userId)
    .limit(1);
  if (error) return null;
  return (data?.[0]?.status as string | undefined) ?? null;
};

export type PendingProposal = {
  id: string;
  event_id: string;
  event_name: string;
  starts_at: string;
  venue_name: string | null;
  titles: string[];
  proposer_id: string;
  proposer_username: string | null;
  created_at: string;
  /** The concert has a manager's / setlist.fm setlist. */
  has_other_setlist: boolean;
  /** The reviewer manages the concert (may replace that setlist). */
  can_manage: boolean;
};

export type ProposalScope = { venueId?: string | null; artistId?: string | null };

export const listPendingProposals = async ({ venueId = null, artistId = null }: ProposalScope = {}): Promise<PendingProposal[]> => {
  const { data, error } = await supabase.rpc('list_setlist_proposals', { p_venue_id: venueId, p_artist_id: artistId });
  if (error) {
    // Not deployed yet: nothing to review.
    if (error.code === 'PGRST202' || error.code === '42883') return [];
    throw error;
  }
  return (data || []) as PendingProposal[];
};

export const reviewProposal = async (id: string, approve: boolean, note: string | null, replaceExisting: boolean) => {
  const { error } = await supabase.rpc('review_setlist_proposal', {
    p_proposal_id: id,
    p_approve: approve,
    p_note: note?.trim() || null,
    p_replace_existing: replaceExisting,
  });
  if (!error) return;
  const message = error.message || '';
  if (/setlist_exists/.test(message)) throw new Error('El concierto ya tiene un setlist oficial.');
  if (/not_pending/.test(message)) throw new Error('Esta propuesta ya se revisó.');
  if (/forbidden/.test(message)) throw new Error('No puedes revisar esta propuesta.');
  throw new Error('No se ha podido guardar la decisión.');
};
