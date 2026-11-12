import { describe, expect, it } from 'vitest';
import { joinHyphenatedBreaks, ocrBlocksToSetlistLines, stripListMarker } from './ocrLines';

describe('stripListMarker', () => {
  it.each([
    ['1. Primera', 'Primera'],
    ['01 - Segunda', 'Segunda'],
    ['2) Tercera', 'Tercera'],
    ['(3) Cuarta', 'Cuarta'],
    ['#4: Quinta', 'Quinta'],
    ['#4 Quinta', 'Quinta'],
    ['05 Sexta', 'Sexta'],
    ['• Séptima', 'Séptima'],
    ['- Octava', 'Octava'],
    ['* 9. Novena', 'Novena'],
    ['10.Décima', 'Décima'],
  ])('%s → %s', (input, expected) => {
    expect(stripListMarker(input)).toBe(expected);
  });

  it('keeps numbers that belong to the title', () => {
    expect(stripListMarker('99 Luftballons')).toBe('99 Luftballons');
    expect(stripListMarker('1979')).toBe('1979');
    expect(stripListMarker('Mi-Mi-Mi')).toBe('Mi-Mi-Mi');
  });
});

describe('joinHyphenatedBreaks', () => {
  it('joins a word broken at the end of a line', () => {
    expect(joinHyphenatedBreaks(['1. Can-', 'ción de cuna', '2. Otra'])).toEqual(['1. Canción de cuna', '2. Otra']);
  });

  it('leaves a dash before a new title alone', () => {
    expect(joinHyphenatedBreaks(['Rock -', 'Tema', 'Hip-', 'Hop'])).toEqual(['Rock -', 'Tema', 'Hip-', 'Hop']);
  });
});

describe('ocrBlocksToSetlistLines', () => {
  it('turns OCR blocks into one song per line, in reading order', () => {
    const blocks = [
      ['SETLIST', '1. Intro-', 'ducción'],
      ['2. La primera', '3) La   segunda', ''],
      ['ENCORE', '• 4. La última', '12'],
    ];
    expect(ocrBlocksToSetlistLines(blocks)).toEqual(['Introducción', 'La primera', 'La segunda', 'La última']);
  });

  it('returns nothing for a photo without songs', () => {
    expect(ocrBlocksToSetlistLines([['1', '2', '---'], []])).toEqual([]);
  });
});
