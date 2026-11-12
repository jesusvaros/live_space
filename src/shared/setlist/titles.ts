// Rules for a setlist proposed by the audience. Mirror of
// public.clean_setlist_titles() (migration 20261112030100): the database
// applies them again, these only let the app explain a problem before sending.
//
// Each line is one song: whitespace is collapsed and trimmed; empty lines,
// lines that are only numbers / punctuation («12», «--») and section markers
// («Setlist», «Encore», «Bis», with or without a colon) are dropped. A control
// character or a title over 120 characters is an error, and the result must
// hold 1–60 songs.

export const MAX_SETLIST_TITLES = 60;
export const MAX_SETLIST_TITLE_LENGTH = 120;
export const MAX_SETLIST_RAW_LINES = 200;

const SECTION_MARKERS = new Set(['setlist', 'set list', 'set-list', 'encore', 'encores', 'bis', 'bises']);

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export const normalizeSetlistLine = (line: string) => line.replace(/\s+/g, ' ').trim();

/** Lines dropped without complaint: numbers, punctuation, section markers. */
export const isSetlistJunk = (title: string) =>
  /^[\d\s\p{P}\p{S}]+$/u.test(title) || SECTION_MARKERS.has(title.replace(/\s*:$/, '').toLowerCase());

export type SetlistTitlesResult =
  | { ok: true; titles: string[] }
  | { ok: false; reason: 'empty' | 'too_many' | 'too_long' | 'control'; line?: string };

export const validateSetlistTitles = (lines: readonly string[]): SetlistTitlesResult => {
  if (lines.length > MAX_SETLIST_RAW_LINES) return { ok: false, reason: 'too_many' };
  const titles: string[] = [];
  for (const raw of lines) {
    const title = normalizeSetlistLine(raw);
    if (CONTROL.test(title)) return { ok: false, reason: 'control', line: title };
    if (!title || isSetlistJunk(title)) continue;
    if ([...title].length > MAX_SETLIST_TITLE_LENGTH) return { ok: false, reason: 'too_long', line: title };
    titles.push(title);
  }
  if (titles.length === 0) return { ok: false, reason: 'empty' };
  if (titles.length > MAX_SETLIST_TITLES) return { ok: false, reason: 'too_many' };
  return { ok: true, titles };
};

/** The textarea's text as lines (one song per line). */
export const setlistLines = (text: string) => text.split(/\r?\n/);
