import { describe, expect, it } from 'vitest';
import { bioDraft, groupBindings, kindWord, linksFor, stylesFor } from './wikidataProfiles';

const v = (value: string) => ({ value });
const entity = (id: string) => v(`http://www.wikidata.org/entity/${id}`);
const rows = [
  {
    mbid: v('m1'),
    item: entity('Q1'),
    kind: entity('Q5741069'),
    kindLabel: v('banda de rock'),
    genreLabel: v('indie rock'),
    placeLabel: v('Madrid'),
    inception: v('2005-01-01T00:00:00Z'),
    spotify: v('abc'),
  },
  { mbid: v('m1'), item: entity('Q1'), kind: entity('Q5741069'), kindLabel: v('banda de rock'), genreLabel: v('rock alternativo'), placeLabel: v('Madrid') },
  {
    mbid: v('m2'),
    item: entity('Q2'),
    kind: entity('Q5'),
    kindLabel: v('ser humano'),
    genreLabel: v('Q999'),
    placeLabel: v('Ourense'),
    countryLabel: v('España'),
    inception: v('1990-01-01T00:00:00Z'),
  },
  { mbid: v('m3'), item: entity('Q3'), kind: entity('Q1'), kindLabel: v('cosa'), genreLabel: v('pop') },
];

describe('wikidataProfiles', () => {
  const facts = groupBindings(rows);

  it('groups one record per artist and drops unlabeled values', () => {
    expect(facts.size).toBe(3);
    expect([...facts.get('m1')!.genres]).toEqual(['indie rock', 'rock alternativo']);
    expect(facts.get('m2')!.genres.size).toBe(0);
  });

  it('writes a short factual bio, neutral for people and without their places or dates', () => {
    expect(bioDraft(facts.get('m1')!)).toBe('Grupo de indie rock y rock alternativo de Madrid, en activo desde 2005.');
    expect(kindWord(facts.get('m2')!)).toBe('Artista');
    expect(bioDraft(facts.get('m2')!)).toBeNull();
    expect(bioDraft({ ...facts.get('m2')!, genres: new Set(['pop']) })).toBe('Artista de pop de España.');
    expect(bioDraft(facts.get('m3')!)).toBeNull();
  });

  it('maps genres to the app styles and ids to links', () => {
    expect(stylesFor(facts.get('m1')!)).toEqual(['Indie', 'Rock']);
    expect(linksFor(facts.get('m1')!)).toEqual({ spotify: 'https://open.spotify.com/artist/abc' });
  });
});
