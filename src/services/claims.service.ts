import { supabase } from '../api';

export type ClaimEntityType = 'artist' | 'venue';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';
export type ClaimVerificationMethod = 'email_domain' | 'instagram_code';

export type ClaimTarget = {
  type: ClaimEntityType;
  id: string;
  subjectId: string;
  name: string;
  imageUrl: string | null;
  city: string | null;
  // Domain of the official website, used to suggest the email address.
  officialDomain: string | null;
  instagram: string | null;
};

export type EntityClaim = {
  id: string;
  subject_id: string;
  claimant_id: string;
  claimant_role: string;
  verification_method: ClaimVerificationMethod;
  contact_email: string;
  instagram_handle: string | null;
  verification_code: string;
  message: string | null;
  status: ClaimStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type AdminClaimRow = EntityClaim & {
  claimant: { id: string; username: string | null; display_name: string | null; avatar_url: string | null } | null;
  subject: {
    id: string;
    type: ClaimEntityType;
    artist: { id: string; name: string; external_links: Record<string, string> | null } | null;
    venue: { id: string; name: string; city: string | null; website_url: string | null } | null;
  } | null;
};

const CLAIM_COLUMNS =
  'id,subject_id,claimant_id,claimant_role,verification_method,contact_email,instagram_handle,verification_code,message,status,review_note,created_at,reviewed_at';

export const domainFromUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    return null;
  }
};

export const instagramHandleFromLink = (value: string | null | undefined) => {
  if (!value) return null;
  const match = value.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  if (match) return match[1];
  return /^@?[A-Za-z0-9_.]{1,30}$/.test(value.trim()) ? value.trim().replace(/^@/, '') : null;
};

// True when the table is not there yet (migration not applied).
export const isMissingRelation = (error: { code?: string; message?: string } | null | undefined) =>
  Boolean(
    error &&
      (error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.code === 'PGRST202' ||
        error.code === '42703' ||
        error.code === 'PGRST204' ||
        /does not exist|could not find/i.test(error.message || '')),
  );

export const claimsService = {
  async getTarget(type: ClaimEntityType, id: string): Promise<ClaimTarget | null> {
    if (type === 'artist') {
      const { data, error } = await supabase
        .from('v_subject_artists')
        .select('artist_id,subject_id,name,city,avatar_url,external_links')
        .eq('artist_id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const links = (data.external_links || {}) as Record<string, string>;
      return {
        type,
        id: data.artist_id,
        subjectId: data.subject_id,
        name: data.name,
        imageUrl: data.avatar_url ?? null,
        city: data.city ?? null,
        officialDomain: domainFromUrl(links.website),
        instagram: instagramHandleFromLink(links.instagram),
      };
    }
    const { data, error } = await supabase
      .from('v_subject_venues')
      .select('venue_place_id,subject_id,name,city,cover_image_url,website_url')
      .eq('venue_place_id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      type,
      id: data.venue_place_id,
      subjectId: data.subject_id,
      name: data.name,
      imageUrl: data.cover_image_url ?? null,
      city: data.city ?? null,
      officialDomain: domainFromUrl(data.website_url),
      instagram: null,
    };
  },

  async getMyClaim(subjectId: string, profileId: string): Promise<EntityClaim | null> {
    const { data, error } = await supabase
      .from('entity_claims')
      .select(CLAIM_COLUMNS)
      .eq('subject_id', subjectId)
      .eq('claimant_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
    return (data as EntityClaim) ?? null;
  },

  async listMinePending(profileId: string): Promise<Array<EntityClaim & { name: string; type: ClaimEntityType }>> {
    const { data, error } = await supabase
      .from('entity_claims')
      .select(`${CLAIM_COLUMNS}, subject:subjects!entity_claims_subject_id_fkey (type, artist:artists (name), venue:venue_places (name))`)
      .eq('claimant_id', profileId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    return (data || []).map((row: any) => ({
      ...(row as EntityClaim),
      type: row.subject?.type === 'venue' ? 'venue' : 'artist',
      name: row.subject?.artist?.name || row.subject?.venue?.name || 'Perfil',
    }));
  },

  async createClaim(input: {
    subjectId: string;
    claimantId: string;
    claimantRole: string;
    method: ClaimVerificationMethod;
    contactEmail: string;
    instagramHandle: string | null;
    message: string | null;
  }): Promise<EntityClaim> {
    const { data, error } = await supabase
      .from('entity_claims')
      .insert({
        subject_id: input.subjectId,
        claimant_id: input.claimantId,
        claimant_role: input.claimantRole.trim(),
        verification_method: input.method,
        contact_email: input.contactEmail.trim(),
        instagram_handle: input.instagramHandle?.trim().replace(/^@/, '') || null,
        message: input.message?.trim() || null,
      })
      .select(CLAIM_COLUMNS)
      .single();
    if (error) {
      if (isMissingRelation(error)) {
        throw new Error('Las solicitudes aún no están activas. Inténtalo más tarde.');
      }
      if (error.code === '23505') {
        throw new Error('Ya tienes una solicitud pendiente para este perfil.');
      }
      throw error;
    }
    return data as EntityClaim;
  },

  async listForAdmin(status: ClaimStatus | 'all' = 'pending'): Promise<AdminClaimRow[]> {
    let query = supabase
      .from('entity_claims')
      .select(`
        ${CLAIM_COLUMNS},
        claimant:profiles!entity_claims_claimant_id_fkey (id,username,display_name,avatar_url),
        subject:subjects!entity_claims_subject_id_fkey (
          id,
          type,
          artist:artists (id,name,external_links),
          venue:venue_places (id,name,city,website_url)
        )
      `)
      .order('created_at', { ascending: true })
      .limit(100);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as unknown as AdminClaimRow[];
  },

  async review(claimId: string, approve: boolean, note?: string | null): Promise<void> {
    const { error } = await supabase.rpc('review_entity_claim', {
      p_claim_id: claimId,
      p_approve: approve,
      p_note: note ?? null,
    });
    if (error) throw error;
  },
};
