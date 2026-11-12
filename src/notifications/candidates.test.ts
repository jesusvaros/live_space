import { describe, expect, it } from 'vitest';
import { resolvePrefs } from './policy';
import { buildCandidates, normalizeCity, type CandidateInput } from './candidates';
import type { EventInfo, UserData } from './types';

const TZ = 'Europe/Madrid';

const ev = (id: string, overrides: Partial<EventInfo> = {}): EventInfo => ({
  id,
  name: `Concierto ${id}`,
  startsAt: '2026-11-14T20:30:00Z',
  endsAt: null,
  city: 'Madrid',
  venueName: 'La Riviera',
  venuePlaceId: 'venue-riviera',
  festivalId: null,
  artistIds: ['artist-morat'],
  headliner: 'Morat',
  announcedAt: '2026-11-01T10:00:00Z',
  ...overrides,
});

const user = (overrides: Partial<UserData> = {}): UserData => ({
  profileId: 'p1',
  devices: [
    {
      id: 'd1',
      token: 't1',
      platform: 'android',
      timezone: TZ,
      createdAt: '2026-10-01T00:00:00Z',
      lastSeenAt: '2026-11-10T00:00:00Z',
    },
  ],
  prefs: resolvePrefs(null),
  homeCities: [],
  attendance: [],
  uploadedEventIds: new Set(),
  merchOrders: [],
  follows: [],
  suggestedEvents: [],
  sent: [],
  ...overrides,
});

const build = (input: Partial<CandidateInput> & { user: UserData; now: Date; list?: EventInfo[] }) =>
  buildCandidates({
    timezone: TZ,
    events: new Map((input.list ?? []).map(event => [event.id, event])),
    newEvents: [],
    ...input,
  });

describe('concert_day and upload_reminder', () => {
  const concert = ev('ev1');
  const dayOf = new Date('2026-11-14T13:00:00Z');
  const morningAfter = new Date('2026-11-15T10:00:00Z');

  it('day of a concert marked «Voy»', () => {
    const notices = build({ user: user({ attendance: [{ eventId: 'ev1', status: 'going' }] }), now: dayOf, list: [concert] });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      type: 'concert_day',
      title: 'Hoy: Morat en La Riviera a las 21:30',
      route: '/event/ev1',
      channel: 'conciertos',
    });
  });

  it('nothing for «Me interesa», nor once it started', () => {
    expect(build({ user: user({ attendance: [{ eventId: 'ev1', status: 'interested' }] }), now: dayOf, list: [concert] })).toEqual([]);
    const late = new Date('2026-11-14T21:00:00Z');
    expect(build({ user: user({ attendance: [{ eventId: 'ev1', status: 'going' }] }), now: late, list: [concert] })).toEqual([]);
  });

  it('morning after, only if nothing uploaded', () => {
    const going = user({ attendance: [{ eventId: 'ev1', status: 'attended' }] });
    const [notice] = build({ user: going, now: morningAfter, list: [concert] });
    expect(notice).toMatchObject({
      type: 'upload_reminder',
      title: '¿Grabaste algo de Morat? Súbelo',
      route: '/tabs/upload?event=ev1',
      channel: 'momentos',
    });
    const uploaded = user({ attendance: [{ eventId: 'ev1', status: 'going' }], uploadedEventIds: new Set(['ev1']) });
    expect(build({ user: uploaded, now: morningAfter, list: [concert] })).toEqual([]);
  });

  it('a show at 00:30 is reminded the next morning, not two mornings later', () => {
    const late = ev('ev2', { startsAt: '2026-11-14T23:30:00Z' }); // 00:30 on the 15th, Madrid
    const going = user({ attendance: [{ eventId: 'ev2', status: 'going' }] });
    expect(build({ user: going, now: new Date('2026-11-14T13:00:00Z'), list: [late] }).map(n => n.type)).toEqual(['concert_day']);
    expect(build({ user: going, now: new Date('2026-11-15T10:00:00Z'), list: [late] }).map(n => n.type)).toEqual(['upload_reminder']);
  });

  it('falls back to the event name when there is no artist', () => {
    const named = ev('ev3', { headliner: null, venueName: null, city: null, name: 'Noche de Jazz' });
    const [notice] = build({ user: user({ attendance: [{ eventId: 'ev3', status: 'going' }] }), now: dayOf, list: [named] });
    expect(notice.title).toBe('Hoy: Noche de Jazz a las 21:30');
  });
});

describe('merch_pickup', () => {
  const concert = ev('ev1');
  const order = { id: 'o1', eventId: 'ev1', status: 'reserved', pickupCode: 'K7Q2', pickupPoint: null };

  it('day of the concert with a reserved or paid order', () => {
    const [notice] = build({ user: user({ merchOrders: [order] }), now: new Date('2026-11-14T13:00:00Z'), list: [concert] });
    expect(notice).toMatchObject({
      type: 'merch_pickup',
      title: 'Recoge tu pedido en el puesto: código K7Q2',
      body: 'Hoy, en Morat · La Riviera.',
      route: '/pedidos/o1',
      channel: 'merch',
      dedupeKey: 'merch_pickup:o1',
    });
  });

  it('goes first when several are due', () => {
    const notices = build({
      user: user({ merchOrders: [order], attendance: [{ eventId: 'ev1', status: 'going' }] }),
      now: new Date('2026-11-14T13:00:00Z'),
      list: [concert],
    });
    expect(notices.map(n => n.type)).toEqual(['merch_pickup', 'concert_day']);
  });

  it('nothing for collected orders or another day', () => {
    expect(build({ user: user({ merchOrders: [{ ...order, status: 'collected' }] }), now: new Date('2026-11-14T13:00:00Z'), list: [concert] })).toEqual([]);
    expect(build({ user: user({ merchOrders: [order] }), now: new Date('2026-11-13T13:00:00Z'), list: [concert] })).toEqual([]);
  });
});

describe('followed_new_concert', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const fresh = (id: string, overrides: Partial<EventInfo> = {}) =>
    ev(id, { startsAt: '2026-12-12T20:00:00Z', announcedAt: '2026-11-10T06:00:00Z', ...overrides });
  const followsArtist = { artistId: 'artist-morat', venuePlaceId: null, festivalId: null, createdAt: '2026-09-01T00:00:00Z' };

  it('one new concert → named notice', () => {
    const notices = build({ user: user({ follows: [followsArtist] }), now, newEvents: [fresh('n1')] });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      type: 'followed_new_concert',
      title: 'Morat anuncia concierto en Madrid el sábado 12 de diciembre',
      route: '/event/n1',
      dedupeKey: 'followed_new_concert:n1',
    });
  });

  it('several → one grouped notice', () => {
    const notices = build({
      user: user({ follows: [followsArtist, { artistId: null, venuePlaceId: 'venue-sala-x', festivalId: null, createdAt: '2026-09-01T00:00:00Z' }] }),
      now,
      newEvents: [
        fresh('n1'),
        fresh('n2', { headliner: 'Rels B', artistIds: ['artist-rels'], venuePlaceId: 'venue-sala-x' }),
        fresh('n3', { headliner: 'Rosalía', artistIds: ['artist-rosalia'] }), // not followed
        fresh('n4', { startsAt: '2027-01-20T20:00:00Z' }),
      ],
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ title: '3 conciertos nuevos de lo que sigues', body: 'Morat, Rels B.', route: '/tabs/events' });
    expect(notices[0].eventIds.sort()).toEqual(['n1', 'n2', 'n4']);
  });

  it('artist concerts only in the person’s cities; venues anywhere', () => {
    const inBarcelona = fresh('n1', { city: 'Barcelona', venuePlaceId: 'venue-apolo' });
    const inMalaga = fresh('n2', { city: 'Málaga', venuePlaceId: 'venue-paris15' });
    const follows = [followsArtist, { artistId: null, venuePlaceId: 'venue-apolo', festivalId: null, createdAt: '2026-09-01T00:00:00Z' }];
    const notices = build({ user: user({ follows, homeCities: ['malaga'] }), now, newEvents: [inBarcelona, inMalaga] });
    expect(notices[0].eventIds.sort()).toEqual(['n1', 'n2']);
    const madrid = build({ user: user({ follows: [followsArtist], homeCities: ['Madrid'] }), now, newEvents: [inBarcelona] });
    expect(madrid).toEqual([]);
    expect(normalizeCity('  Málaga ')).toBe('malaga');
  });

  it('never announces old listings, concerts from before the follow or the first device, or repeats', () => {
    const old = fresh('n1', { announcedAt: '2026-11-07T00:00:00Z' }); // > 48 h
    expect(build({ user: user({ follows: [followsArtist] }), now, newEvents: [old] })).toEqual([]);
    const beforeFollow = { ...followsArtist, createdAt: '2026-11-10T08:00:00Z' };
    expect(build({ user: user({ follows: [beforeFollow] }), now, newEvents: [fresh('n2')] })).toEqual([]);
    const newDevice = user({ follows: [followsArtist] });
    newDevice.devices[0].createdAt = '2026-11-10T07:00:00Z';
    expect(build({ user: newDevice, now, newEvents: [fresh('n3')] })).toEqual([]);
    const sent = [{ type: 'followed_new_concert', dedupeKey: 'followed_new_concert:n4', sentAt: '2026-11-10T08:00:00Z', payload: { event_ids: ['n4'] } }];
    expect(build({ user: user({ follows: [followsArtist], sent }), now, newEvents: [fresh('n4')] })).toEqual([]);
  });

  it('nothing for concerts the person already said «Voy» to, nor without devices', () => {
    expect(build({ user: user({ follows: [followsArtist], attendance: [{ eventId: 'n1', status: 'going' }] }), now, newEvents: [fresh('n1')] })).toEqual([]);
    expect(build({ user: user({ follows: [followsArtist], devices: [] }), now, newEvents: [fresh('n1')] })).toEqual([]);
  });
});

describe('suggestion_imported', () => {
  const now = new Date('2026-11-12T11:00:00Z');
  const imported = ev('s1', {
    startsAt: '2026-11-21T20:30:00Z',
    headliner: 'Frisbi',
    venueName: 'Fun Club',
    city: 'Sevilla',
    artistIds: ['artist-frisbi'],
  });

  it('«Ya está: {Artista} en {Sala} el {fecha}», to the concert', () => {
    const notices = build({ user: user({ suggestedEvents: [imported] }), now });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      type: 'suggestion_imported',
      dedupeKey: 'suggestion_imported:s1',
      title: 'Ya está: Frisbi en Fun Club el sábado 21 de noviembre',
      route: '/event/s1',
      channel: 'conciertos',
      expiresAt: '2026-11-21T20:30:00Z',
    });
  });

  it('not once the concert started; never also as «new concert of what you follow»', () => {
    expect(build({ user: user({ suggestedEvents: [imported] }), now: new Date('2026-11-21T21:00:00Z') })).toEqual([]);
    const follows = [{ artistId: 'artist-frisbi', venuePlaceId: null, festivalId: null, createdAt: '2026-09-01T00:00:00Z' }];
    const fresh = { ...imported, announcedAt: '2026-11-12T08:00:00Z' };
    const notices = build({ user: user({ follows, suggestedEvents: [fresh] }), now, newEvents: [fresh] });
    expect(notices.map(notice => notice.type)).toEqual(['suggestion_imported']);
    // Already told by this notice: later runs do not announce it as followed either.
    const sent = [
      { type: 'suggestion_imported', dedupeKey: 'suggestion_imported:s1', sentAt: '2026-11-12T10:00:00Z', payload: { event_ids: ['s1'] } },
    ];
    expect(build({ user: user({ follows, sent }), now, newEvents: [fresh] })).toEqual([]);
  });

  it('goes after the concert-day notice', () => {
    const today = ev('t1', { startsAt: '2026-11-12T20:00:00Z' });
    const notices = build({
      user: user({ suggestedEvents: [imported], attendance: [{ eventId: 't1', status: 'going' }] }),
      now,
      list: [today],
    });
    expect(notices.map(notice => notice.type)).toEqual(['concert_day', 'suggestion_imported']);
  });
});
