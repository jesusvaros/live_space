import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { rankGenres, rankSuggestions } from './agendaQueries';

const concert = (city: string, venue: string | null, lineup: { id: string; genres: string[] }[]) => ({
  city,
  venue_place_id: venue,
  event_artists: lineup.map(artist => ({ artist })),
});

describe('rankGenres', () => {
  it('counts a concert once per genre, the city first, the most common spelling as label', () => {
    const rows = [
      concert('Madrid', 'v1', [{ id: 'a', genres: ['rock', 'Pop'] }, { id: 'b', genres: ['Rock'] }]),
      concert(' madrid ', 'v1', [{ id: 'a', genres: ['rock'] }]),
      concert('Bilbao', 'v2', [{ id: 'c', genres: ['jazz', 'jazz', ' '] }]),
      concert('Bilbao', 'v2', [{ id: 'c', genres: ['Jazz'] }]),
      concert('Bilbao', 'v2', [{ id: 'd', genres: ['Jazz'] }]),
    ];
    expect(rankGenres(rows, 'MADRID')).toEqual([
      { key: 'rock', label: 'Rock', local: 2, total: 2 },
      { key: 'pop', label: 'Pop', local: 1, total: 1 },
      { key: 'jazz', label: 'Jazz', local: 0, total: 3 },
    ]);
  });

  it('without a city, orders by how common a genre is everywhere', () => {
    const rows = [
      concert('Madrid', null, [{ id: 'a', genres: ['rock'] }]),
      concert('Bilbao', null, [{ id: 'b', genres: ['jazz'] }]),
      concert('Bilbao', null, [{ id: 'c', genres: ['jazz'] }]),
    ];
    expect(rankGenres(rows).map(genre => [genre.label, genre.local, genre.total])).toEqual([
      ['Jazz', 0, 2],
      ['Rock', 0, 1],
    ]);
  });
});

describe('rankSuggestions', () => {
  const rows = [
    concert('Madrid', 'v1', [{ id: 'a', genres: ['Rock'] }, { id: 'b', genres: [] }]),
    concert('Madrid', 'v1', [{ id: 'c', genres: ['Jazz'] }]),
    concert('Madrid', 'v2', [{ id: 'c', genres: ['Jazz'] }]),
    concert('Madrid', null, [{ id: 'd', genres: ['Pop'] }]),
  ];

  it('weighs concerts with the visitor genres six times', () => {
    const picks = rankSuggestions(rows, ['rock'], { artists: 3, venues: 5 });
    // a and b: one concert with rock (6 each); c: two concerts without (2).
    expect(picks.artists).toEqual([
      { id: 'a', concerts: 1 },
      { id: 'b', concerts: 1 },
      { id: 'c', concerts: 2 },
    ]);
    expect(picks.venues).toEqual([
      { id: 'v1', concerts: 2 },
      { id: 'v2', concerts: 1 },
    ]);
  });

  it('without tastes, who plays most goes first', () => {
    const picks = rankSuggestions(rows, [], { artists: 1, venues: 1 });
    expect(picks.artists).toEqual([{ id: 'c', concerts: 2 }]);
    expect(picks.venues).toEqual([{ id: 'v1', concerts: 2 }]);
  });
});
