// Pure helpers for «Mi perfil» and the team screens: link cleanup, form
// diffing and the share links. No React, no Supabase, so they are tested.

export const LINK_KEYS = ['instagram', 'spotify', 'website', 'youtube', 'tiktok', 'bandcamp', 'apple_music'] as const;
export type LinkKey = (typeof LINK_KEYS)[number];

export const LINK_LABELS: Record<LinkKey, string> = {
  instagram: 'Instagram',
  spotify: 'Spotify',
  website: 'Web',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  bandcamp: 'Bandcamp',
  apple_music: 'Apple Music',
};

export const BIO_MAX = 280;

const SOCIAL_HOSTS: Partial<Record<LinkKey, string>> = {
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/@',
};

/**
 * Turns what a manager types into a link we can store: «@sala» becomes the
 * Instagram URL, «sala.com» gets https://. Empty stays empty. Returns null
 * when it cannot be a link at all.
 */
export const normalizeLink = (key: LinkKey, raw: string): string | null => {
  const value = raw.trim();
  if (!value) return '';
  const handle = value.replace(/^@/, '');
  const social = SOCIAL_HOSTS[key];
  // «@sala.but» or «salabut» is a handle; «sala.com/x» or «instagram.com/x» a link.
  const looksLikeHandle = value.startsWith('@') || !handle.includes('.');
  if (social && looksLikeHandle && /^[A-Za-z0-9._]{1,40}$/.test(handle)) {
    return `${social}${handle}`;
  }
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.') || /\s/.test(value)) return null;
    return url.toString();
  } catch {
    return null;
  }
};

/** Links to save: normalized, empty ones dropped; the first invalid key is reported. */
export const cleanLinks = (draft: Partial<Record<LinkKey, string>>): { links: Record<string, string>; invalid: LinkKey | null } => {
  const links: Record<string, string> = {};
  for (const key of LINK_KEYS) {
    const raw = draft[key] ?? '';
    const normalized = normalizeLink(key, raw);
    if (normalized === null) return { links, invalid: key };
    if (normalized) links[key] = normalized;
  }
  return { links, invalid: null };
};

/** Keeps links the form does not show (e.g. other keys from imports). */
export const mergeLinks = (current: Record<string, string> | null | undefined, edited: Record<string, string>) => {
  const kept = Object.fromEntries(Object.entries(current || {}).filter(([key]) => !(LINK_KEYS as readonly string[]).includes(key)));
  return { ...kept, ...edited };
};

export const parseCapacity = (raw: string): number | null | undefined => {
  const value = raw.trim().replace(/[.\s]/g, '');
  if (!value) return null;
  if (!/^\d{1,6}$/.test(value)) return undefined;
  const number = Number(value);
  return number > 0 ? number : undefined;
};

export type MemberRole = 'owner' | 'admin' | 'editor' | 'moderator';

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  editor: 'Editor',
  moderator: 'Moderador',
};

/** What each role can do, in a few words. */
export const ROLE_HINTS: Record<Exclude<MemberRole, 'owner'>, string> = {
  admin: 'Todo, también el equipo',
  editor: 'Perfil y conciertos',
  moderator: 'Momentos del público',
};

export const canAdminTeam = (role: MemberRole | null | undefined) => role === 'owner' || role === 'admin';
export const canEditProfile = (role: MemberRole | null | undefined) => role === 'owner' || role === 'admin' || role === 'editor';

// Links people share by WhatsApp or mail: a page of the public site
// (/unirse) that hands over to the app, like the concert QR's /upload.
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

export const inviteUrl = (siteBase: string, token: string) => `${siteBase.replace(/\/+$/, '')}/unirse?equipo=${encodeURIComponent(token)}`;
export const claimLinkUrl = (siteBase: string, token: string) => `${siteBase.replace(/\/+$/, '')}/unirse?perfil=${encodeURIComponent(token)}`;

/** In-app path for a team invite or claim link: com.livespace.app://join?… or https://<site>/unirse?…. */
export const joinDeepLinkPath = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl.replace(/^com\.livespace\.app:\/\//, 'https://app/'));
    const isJoin = url.hostname === 'app'
      ? url.pathname.replace(/\/$/, '') === '/join'
      : /^https?:$/.test(url.protocol) && url.pathname.replace(/\/$/, '') === '/unirse';
    if (!isJoin) return null;
    const team = url.searchParams.get('equipo');
    if (team && TOKEN_PATTERN.test(team)) return `/equipo/unirse/${team}`;
    const claim = url.searchParams.get('perfil');
    if (claim && TOKEN_PATTERN.test(claim)) return `/reclamar/enlace/${claim}`;
    return null;
  } catch {
    return null;
  }
};

export type LinkState = 'ok' | 'invalid' | 'expired' | 'used' | 'revoked' | 'member';

export const LINK_STATE_COPY: Record<Exclude<LinkState, 'ok'>, string> = {
  invalid: 'Este enlace no existe.',
  expired: 'Este enlace ha caducado. Pide uno nuevo.',
  used: 'Este enlace ya se usó.',
  revoked: 'Este enlace se anuló.',
  member: 'Ya formas parte de este perfil.',
};

export const linkStatus = (link: { used_at: string | null; revoked_at: string | null; expires_at: string }, now = Date.now()) =>
  link.revoked_at ? 'revoked' : link.used_at ? 'used' : Date.parse(link.expires_at) < now ? 'expired' : 'open';
