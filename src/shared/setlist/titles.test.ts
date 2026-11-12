import { describe, expect, it } from 'vitest';
import { isSetlistJunk, setlistLines, validateSetlistTitles } from './titles';

describe('validateSetlistTitles (mirror of clean_setlist_titles)', () => {
  it('cleans like the database', () => {
    expect(
      validateSetlistTitles(['  Setlist: ', '1', '  Hola   amigo ', '', '--', 'ENCORE', 'Bis:', 'Adiós', '22 de abril']),
    ).toEqual({ ok: true, titles: ['Hola amigo', 'Adiós', '22 de abril'] });
  });

  it('splits the textarea on line breaks', () => {
    expect(validateSetlistTitles(setlistLines('Uno\r\nDos\n\nTres'))).toEqual({ ok: true, titles: ['Uno', 'Dos', 'Tres'] });
  });

  it('rejects control characters, long titles and too many songs', () => {
    expect(validateSetlistTitles(['Hola\u0001'])).toMatchObject({ ok: false, reason: 'control' });
    expect(validateSetlistTitles(['a'.repeat(121)])).toMatchObject({ ok: false, reason: 'too_long' });
    expect(validateSetlistTitles(['ñ'.repeat(120)])).toMatchObject({ ok: true });
    expect(validateSetlistTitles(Array.from({ length: 61 }, (_, i) => `Canción ${i + 1}`))).toMatchObject({
      ok: false,
      reason: 'too_many',
    });
    expect(validateSetlistTitles(Array.from({ length: 60 }, (_, i) => `Canción ${i + 1}`))).toMatchObject({ ok: true });
    expect(validateSetlistTitles(Array.from({ length: 201 }, () => ''))).toMatchObject({ ok: false, reason: 'too_many' });
  });

  it('needs at least one song', () => {
    expect(validateSetlistTitles(['Setlist', '12', '  '])).toEqual({ ok: false, reason: 'empty' });
  });

  it('treats tabs as spaces', () => {
    expect(validateSetlistTitles(['Uno\tDos'])).toEqual({ ok: true, titles: ['Uno Dos'] });
  });

  it('knows junk from songs', () => {
    expect(isSetlistJunk('1999')).toBe(true);
    expect(isSetlistJunk('• —')).toBe(true);
    expect(isSetlistJunk('Encore:')).toBe(true);
    expect(isSetlistJunk('Set list')).toBe(true);
    expect(isSetlistJunk('Bisbal')).toBe(false);
    expect(isSetlistJunk('99 Luftballons')).toBe(false);
  });
});
