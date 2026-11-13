import { describe, expect, it } from 'vitest';
import type { EventListItem } from '../events/types';
import {
  concertDateLabel,
  groupMomentsByConcert,
  lineupLabel,
  lineupNames,
  splitConcerts,
  type ProfileMoment,
} from './profileLayout';

const moment = (id: string, eventId: string, extra: Partial<ProfileMoment> = {}): ProfileMoment => ({
  id,
  event_id: eventId,
  media_type: 'image',
  media_url: `https://cdn/${id}.jpg`,
  thumbnail_url: null,
  caption: null,
  event_offset_ms: null,
  captured_at: null,
  created_at: '2026-01-01T00:00:00Z',
  ...extra,
});

const card = (id: string, startsAt: string, artists: string[] = [], venue = 'Sala'): EventListItem =>
  ({
    id,
    name: `Concierto ${id}`,
    city: 'Madrid',
    starts_at: startsAt,
    venue_place: { id: `v-${id}`, name: venue },
    event_artists: artists.map((name, index) => ({ artist: { id: `a${index}`, name } })),
  }) as unknown as EventListItem;

describe('groupMomentsByConcert', () => {
  it('groups by concert, latest concert first, moments in show order', () => {
    const cards = new Map([
      ['old', card('old', '2025-03-14T20:00:00Z', ['Vetusta Morla'])],
      ['new', card('new', '2026-10-01T20:00:00Z', ['Rosalía', 'Bad Gyal'], 'WiZink')],
    ]);
    const groups = groupMomentsByConcert(
      [
        moment('m1', 'old', { event_offset_ms: 5000 }),
        moment('m2', 'new', { event_offset_ms: 9000 }),
        moment('m3', 'old', { event_offset_ms: 1000 }),
        moment('m4', 'new', { event_offset_ms: 2000 }),
      ],
      cards,
    );
    expect(groups.map(group => group.concert.id)).toEqual(['new', 'old']);
    expect(groups[0].moments.map(item => item.id)).toEqual(['m4', 'm2']);
    expect(groups[1].moments.map(item => item.id)).toEqual(['m3', 'm1']);
    expect(groups[0].concert).toMatchObject({ artists: ['Rosalía', 'Bad Gyal'], venueName: 'WiZink' });
  });

  it('falls back to the concert embedded in the moment, and to capture time', () => {
    const groups = groupMomentsByConcert([
      moment('b', 'e1', {
        captured_at: '2026-05-01T22:00:00Z',
        events: { name: 'Fiesta', starts_at: '2026-05-01T20:00:00Z', venue_place: { name: 'Razzmatazz' } },
      }),
      moment('a', 'e1', { captured_at: '2026-05-01T21:00:00Z' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].concert).toMatchObject({ name: 'Fiesta', venueName: 'Razzmatazz', artists: [], card: null });
    expect(groups[0].moments.map(item => item.id)).toEqual(['a', 'b']);
  });

  it('puts concerts without a date last and drops repeated moments', () => {
    const groups = groupMomentsByConcert(
      [moment('x', 'undated'), moment('y', 'dated'), moment('y', 'dated')],
      new Map([['dated', card('dated', '2024-01-01T20:00:00Z')]]),
    );
    expect(groups.map(group => group.concert.id)).toEqual(['dated', 'undated']);
    expect(groups[0].moments).toHaveLength(1);
  });
});

describe('lineup', () => {
  it('lists names once, without blanks', () => {
    const event = card('e', '2026-01-01T00:00:00Z', ['A', 'A', ' ', 'B']);
    expect(lineupNames(event)).toEqual(['A', 'B']);
    expect(lineupNames(null)).toEqual([]);
  });

  it('labels one, two or many artists', () => {
    expect(lineupLabel([], 'Concierto')).toBe('Concierto');
    expect(lineupLabel(['A'], 'x')).toBe('A');
    expect(lineupLabel(['A', 'B'], 'x')).toBe('A y B');
    expect(lineupLabel(['A', 'B', 'C', 'D'], 'x')).toBe('A, B +2');
  });
});

describe('splitConcerts', () => {
  it('splits into upcoming (soonest first) and past (latest first) without repeats', () => {
    const now = Date.parse('2026-11-13T12:00:00Z');
    const events = [
      { id: 'past-old', starts_at: '2025-01-01T20:00:00Z' },
      { id: 'soon', starts_at: '2026-11-20T20:00:00Z' },
      { id: 'tonight-started', starts_at: '2026-11-13T10:00:00Z' },
      { id: 'later', starts_at: '2027-02-01T20:00:00Z' },
      { id: 'past-recent', starts_at: '2026-10-01T20:00:00Z' },
      { id: 'soon', starts_at: '2026-11-20T20:00:00Z' },
    ];
    const { upcoming, past } = splitConcerts(events, now);
    expect(upcoming.map(event => event.id)).toEqual(['tonight-started', 'soon', 'later']);
    expect(past.map(event => event.id)).toEqual(['past-recent', 'past-old']);
  });
});

describe('concertDateLabel', () => {
  it('drops the year for this year and keeps it otherwise', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    expect(concertDateLabel('2026-03-14T20:00:00Z', now)).not.toMatch(/2026/);
    expect(concertDateLabel('2025-03-14T20:00:00Z', now)).toMatch(/2025/);
    expect(concertDateLabel(null, now)).toBe('');
    expect(concertDateLabel('nope', now)).toBe('');
  });
});
