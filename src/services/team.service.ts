import { supabase } from '../api';
import type { LinkState, MemberRole } from '../features/management/profileForm';
import { compressProductPhoto } from '../features/merch/compressImage';

// Team of an artist or venue (invites by link, roles) and personal claim
// links. All writes go through the security-definer functions of migration
// 20261124003000_team_invites_claim_links.sql.

export type TeamMember = {
  profileId: string;
  role: MemberRole;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type TeamInvite = {
  id: string;
  role: Exclude<MemberRole, 'owner'>;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export type SubjectCard = {
  subjectId: string;
  type: 'artist' | 'venue';
  entityId: string;
  name: string;
  city: string | null;
  imageUrl: string | null;
};

export type LinkPreview = { state: LinkState; card: SubjectCard | null; role?: MemberRole };

export type ClaimLink = {
  id: string;
  subjectId: string;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedRole: string | null;
  revokedAt: string | null;
  name: string | null;
};

const PHOTO_BUCKET = 'profile-photos';

const toPreview = (raw: Record<string, unknown> | null): LinkPreview => {
  if (!raw || raw.state === 'invalid' || !raw.subject_id) return { state: 'invalid', card: null };
  return {
    state: raw.state as LinkState,
    role: (raw.role as MemberRole | undefined) ?? undefined,
    card: {
      subjectId: String(raw.subject_id),
      type: raw.type === 'venue' ? 'venue' : 'artist',
      entityId: String(raw.entity_id),
      name: String(raw.name ?? ''),
      city: (raw.city as string | null) ?? null,
      imageUrl: (raw.image_url as string | null) ?? null,
    },
  };
};

const friendly = (error: { message?: string } | null, fallback: string) => {
  const message = error?.message || '';
  if (/Too many invites/i.test(message)) return 'Has creado muchas invitaciones hoy. Prueba mañana.';
  if (/not valid/i.test(message)) return 'Este enlace ya no sirve. Pide uno nuevo.';
  if (/Sign in/i.test(message)) return 'Entra en tu cuenta para seguir.';
  return fallback;
};

export const teamService = {
  async listMembers(subjectId: string): Promise<TeamMember[]> {
    const { data, error } = await supabase.rpc('list_entity_members', { p_subject_id: subjectId });
    if (error) throw new Error('No se ha podido cargar el equipo.');
    return ((data || []) as Array<Record<string, unknown>>).map(row => ({
      profileId: String(row.profile_id),
      role: row.role as MemberRole,
      username: (row.username as string | null) ?? null,
      displayName: (row.display_name as string | null) ?? null,
      avatarUrl: (row.avatar_url as string | null) ?? null,
      createdAt: String(row.created_at),
    }));
  },

  async listInvites(subjectId: string): Promise<TeamInvite[]> {
    const { data, error } = await supabase
      .from('entity_invites')
      .select('id,role,email,created_at,expires_at,accepted_at,revoked_at')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return [];
    return ((data || []) as Array<Record<string, any>>).map(row => ({
      id: row.id,
      role: row.role,
      email: row.email,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
    }));
  },

  /** Returns the raw token, shown once to share. */
  async createInvite(subjectId: string, role: Exclude<MemberRole, 'owner'>, email?: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_entity_invite', {
      p_subject_id: subjectId,
      p_role: role,
      p_email: email?.trim() || null,
    });
    if (error || typeof data !== 'string') throw new Error(friendly(error, 'No se ha podido crear la invitación.'));
    return data;
  },

  async revokeInvite(inviteId: string) {
    const { error } = await supabase.rpc('revoke_entity_invite', { p_invite_id: inviteId });
    if (error) throw new Error('No se ha podido anular la invitación.');
  },

  async previewInvite(token: string): Promise<LinkPreview> {
    const { data, error } = await supabase.rpc('preview_entity_invite', { p_token: token });
    if (error) throw new Error(friendly(error, 'No se ha podido abrir la invitación.'));
    return toPreview(data as Record<string, unknown> | null);
  },

  async acceptInvite(token: string): Promise<string> {
    const { data, error } = await supabase.rpc('accept_entity_invite', { p_token: token });
    if (error || !data) throw new Error(friendly(error, 'No se ha podido aceptar la invitación.'));
    return String(data);
  },

  async changeRole(subjectId: string, profileId: string, role: Exclude<MemberRole, 'owner'>) {
    const { error } = await supabase
      .from('entity_memberships')
      .update({ role })
      .match({ subject_id: subjectId, profile_id: profileId });
    if (error) throw new Error('No se ha podido cambiar el rol.');
  },

  async removeMember(subjectId: string, profileId: string) {
    const { error } = await supabase.from('entity_memberships').delete().match({ subject_id: subjectId, profile_id: profileId });
    if (error) throw new Error('No se ha podido quitar a esta persona.');
  },

  // Claim links (Live Space admins) -----------------------------------------

  async createClaimLink(subjectId: string, note?: string): Promise<string> {
    const { data, error } = await supabase.rpc('admin_create_claim_link', { p_subject_id: subjectId, p_note: note?.trim() || null });
    if (error || typeof data !== 'string') throw new Error('No se ha podido crear el enlace.');
    return data;
  },

  async revokeClaimLink(linkId: string) {
    const { error } = await supabase.rpc('admin_revoke_claim_link', { p_link_id: linkId });
    if (error) throw new Error('No se ha podido anular el enlace.');
  },

  async listClaimLinks(): Promise<ClaimLink[]> {
    const { data, error } = await supabase
      .from('entity_claim_links')
      .select('id,subject_id,note,created_at,expires_at,used_at,used_role,revoked_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) return [];
    const rows = (data || []) as Array<Record<string, any>>;
    const subjectIds = [...new Set(rows.map(row => row.subject_id as string))];
    const names = new Map<string, string>();
    if (subjectIds.length) {
      const [artists, venues] = await Promise.all([
        supabase.from('v_subject_artists').select('subject_id,name').in('subject_id', subjectIds),
        supabase.from('v_subject_venues').select('subject_id,name').in('subject_id', subjectIds),
      ]);
      for (const row of [...(artists.data || []), ...(venues.data || [])] as Array<{ subject_id: string; name: string }>) {
        names.set(row.subject_id, row.name);
      }
    }
    return rows.map(row => ({
      id: row.id,
      subjectId: row.subject_id,
      note: row.note,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      usedRole: row.used_role,
      revokedAt: row.revoked_at,
      name: names.get(row.subject_id) ?? null,
    }));
  },

  async previewClaimLink(token: string): Promise<LinkPreview> {
    const { data, error } = await supabase.rpc('preview_claim_link', { p_token: token });
    if (error) throw new Error(friendly(error, 'No se ha podido abrir el enlace.'));
    return toPreview(data as Record<string, unknown> | null);
  },

  async redeemClaimLink(token: string, role: string): Promise<string> {
    const { data, error } = await supabase.rpc('redeem_claim_link', { p_token: token, p_role: role });
    if (error || !data) throw new Error(friendly(error, 'No se ha podido reclamar el perfil.'));
    return String(data);
  },

  // Profile photo ------------------------------------------------------------

  /** Compresses the photo (~1200 px) and stores it. Returns its public URL. */
  async uploadProfilePhoto(subjectId: string, file: Blob): Promise<string> {
    const { blob, extension } = await compressProductPhoto(file);
    const path = `${subjectId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (error) throw new Error('No se ha podido subir la foto.');
    return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  },
};
