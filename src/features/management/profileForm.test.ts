import { describe, expect, it } from 'vitest';
import {
  canAdminTeam,
  canEditProfile,
  claimLinkUrl,
  cleanLinks,
  inviteUrl,
  joinDeepLinkPath,
  linkStatus,
  mergeLinks,
  normalizeLink,
  parseCapacity,
} from './profileForm';

const TOKEN = 'Zq4mN8xT2vLp9RkW3sYb7HcD';

describe('normalizeLink', () => {
  it('turns handles into profile links', () => {
    expect(normalizeLink('instagram', '@sala.but')).toBe('https://www.instagram.com/sala.but');
    expect(normalizeLink('instagram', 'salabut')).toBe('https://www.instagram.com/salabut');
    expect(normalizeLink('tiktok', '@loslobos')).toBe('https://www.tiktok.com/@loslobos');
  });

  it('keeps links and adds https', () => {
    expect(normalizeLink('instagram', 'instagram.com/salabut')).toBe('https://instagram.com/salabut');
    expect(normalizeLink('website', 'sala.com')).toBe('https://sala.com/');
    expect(normalizeLink('spotify', 'https://open.spotify.com/artist/1')).toBe('https://open.spotify.com/artist/1');
  });

  it('empties stay empty and nonsense is rejected', () => {
    expect(normalizeLink('website', '  ')).toBe('');
    expect(normalizeLink('website', 'no es una web')).toBeNull();
    expect(normalizeLink('spotify', 'spotify')).toBeNull();
  });
});

describe('cleanLinks / mergeLinks', () => {
  it('drops empty links and reports the first invalid one', () => {
    expect(cleanLinks({ instagram: '@a', spotify: '' })).toEqual({ links: { instagram: 'https://www.instagram.com/a' }, invalid: null });
    expect(cleanLinks({ website: 'mal enlace' }).invalid).toBe('website');
  });

  it('keeps keys the form does not edit and drops removed ones', () => {
    expect(mergeLinks({ instagram: 'old', soundcloud: 'https://soundcloud.com/x' }, { spotify: 'new' })).toEqual({
      soundcloud: 'https://soundcloud.com/x',
      spotify: 'new',
    });
  });
});

describe('parseCapacity', () => {
  it('reads numbers, empty is null, anything else undefined', () => {
    expect(parseCapacity('450')).toBe(450);
    expect(parseCapacity('1.200')).toBe(1200);
    expect(parseCapacity('')).toBeNull();
    expect(parseCapacity('0')).toBeUndefined();
    expect(parseCapacity('mucha gente')).toBeUndefined();
  });
});

describe('roles', () => {
  it('only owners and admins manage the team; moderators do not edit', () => {
    expect(canAdminTeam('owner')).toBe(true);
    expect(canAdminTeam('admin')).toBe(true);
    expect(canAdminTeam('editor')).toBe(false);
    expect(canEditProfile('editor')).toBe(true);
    expect(canEditProfile('moderator')).toBe(false);
    expect(canEditProfile(undefined)).toBe(false);
  });
});

describe('share links', () => {
  it('points to the public /unirse page', () => {
    expect(inviteUrl('https://site.es/', TOKEN)).toBe(`https://site.es/unirse?equipo=${TOKEN}`);
    expect(claimLinkUrl('https://site.es', TOKEN)).toBe(`https://site.es/unirse?perfil=${TOKEN}`);
  });

  it('maps the app scheme and the site page to in-app routes', () => {
    expect(joinDeepLinkPath(`com.livespace.app://join?equipo=${TOKEN}`)).toBe(`/equipo/unirse/${TOKEN}`);
    expect(joinDeepLinkPath(`com.livespace.app://join?perfil=${TOKEN}`)).toBe(`/reclamar/enlace/${TOKEN}`);
    expect(joinDeepLinkPath(`https://site.es/unirse/?equipo=${TOKEN}`)).toBe(`/equipo/unirse/${TOKEN}`);
  });

  it('ignores other links and malformed tokens', () => {
    expect(joinDeepLinkPath(`com.livespace.app://upload?qr=${TOKEN}`)).toBeNull();
    expect(joinDeepLinkPath('com.livespace.app://join?equipo=../../admin')).toBeNull();
    expect(joinDeepLinkPath('https://site.es/unirse?equipo=corto')).toBeNull();
    expect(joinDeepLinkPath('nada')).toBeNull();
  });
});

describe('linkStatus', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  it('tells open, used, revoked and expired apart', () => {
    expect(linkStatus({ used_at: null, revoked_at: null, expires_at: '2026-11-30T00:00:00Z' }, now)).toBe('open');
    expect(linkStatus({ used_at: '2026-11-24T10:00:00Z', revoked_at: null, expires_at: '2026-11-30T00:00:00Z' }, now)).toBe('used');
    expect(linkStatus({ used_at: null, revoked_at: '2026-11-24T10:00:00Z', expires_at: '2026-11-30T00:00:00Z' }, now)).toBe('revoked');
    expect(linkStatus({ used_at: null, revoked_at: null, expires_at: '2026-11-20T00:00:00Z' }, now)).toBe('expired');
  });
});
