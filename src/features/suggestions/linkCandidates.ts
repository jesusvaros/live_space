import { supabase } from '../../lib/supabase';
import { LINK_KEYS } from '../management/profileForm';

// Admin → «Salas y artistas sugeridos»: links sent with «¿Falta un
// concierto?» that turned out to be a venue, an artist or a social profile
// (docs/scraping.md, "Sugerencias de usuarios"; migration 20261125003000).

export type CandidateKind = 'venue' | 'artist' | 'profile';

export type LinkCandidateData = {
  name?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  links?: Record<string, string>;
  imageUrl?: string | null;
  description?: string | null;
  evidence?: string[];
};

export type LinkCandidateRow = {
  url: string;
  urlHost: string;
  kind: CandidateKind;
  candidate: LinkCandidateData;
  people: number;
  notes: string[];
  firstSentAt: string;
};

export const listLinkCandidates = async (): Promise<LinkCandidateRow[]> => {
  const { data, error } = await supabase.rpc('admin_link_candidates');
  if (error) throw error;
  return ((data || []) as Array<Record<string, any>>).map(row => ({
    url: row.url,
    urlHost: row.url_host,
    kind: row.kind,
    candidate: (row.candidate || {}) as LinkCandidateData,
    people: row.people ?? 1,
    notes: row.notes || [],
    firstSentAt: row.first_sent_at,
  }));
};

export const resolveLinkCandidate = async (
  url: string,
  action: 'created' | 'dismissed',
  result: { venuePlaceId?: string; artistId?: string } = {},
) => {
  const { error } = await supabase.rpc('admin_resolve_link_candidate', {
    p_url: url,
    p_action: action,
    p_venue_place_id: result.venuePlaceId ?? null,
    p_artist_id: result.artistId ?? null,
  });
  if (error) throw error;
};

/** The artist's external_links from what the page linked (only the keys the profile form knows). */
export const artistLinksFrom = (candidate: LinkCandidateData): Record<string, string> => {
  const links: Record<string, string> = {};
  for (const key of LINK_KEYS) {
    const value = key === 'website' ? (candidate.links?.website ?? candidate.website) : candidate.links?.[key];
    if (typeof value === 'string' && /^https:\/\//i.test(value)) links[key] = value;
  }
  return links;
};
