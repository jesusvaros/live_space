// Turns an event title (or a noisy artist field) into the performer names it
// contains. Pure and dependency-free so parsers, the normalizer and the
// one-off cleanup script share exactly the same rules.
//
// Rules, in order:
//  1. Spaced dashes are separators; unspaced hyphens belong to the name
//     ("Sho-Hai"). See normalizeText.removeRedundantPunctuation.
//  2. Titles that are not a performer (benefit gigs, galas, tributes, shows,
//     parties, series volumes) yield no artist.
//  3. Series prefixes ("Cicle Miles Davis: …") are dropped.
//  4. "Artist - Tour name" keeps the artist and returns the tour separately.
//  5. Trailing decorations (live, in residency, presentació, quoted album
//     titles, years, "& Friends") are removed.
//  6. Collaborations are split on i/y/amb/meets/feat/with/con, "/" and "&"
//     between two full names; bands such as "Ciro y los Persas" stay whole.
//  7. ALL-CAPS names get a display title case that keeps acronyms.
//  8. Results are de-duplicated ("&" and "and" count as the same).
//  9. Parsers without a performer field run their title through these rules
//     instead of using the raw title as the artist.
// 10. The caller records where a name came from (rule `reason`).

export type ArtistNameCleanup = {
  names: string[];
  tourName: string | null;
  reason: 'unchanged' | 'cleaned' | 'not-artist' | 'empty';
};

const NOT_ARTIST_PATTERNS: RegExp[] = [
  /\bconcierto solidario\b/i,
  /\bconcert solidari\b/i,
  /\bgala (?:ben[eé]fica|solidaria|de)\b/i,
  /^becas?\b/i,
  /\bkiki ball\b/i,
  /^(?:el |the )?show de\b/i,
  /\btribut[eo]?\b/i,
  /\bhomenaje\b/i,
  /\bhomenatge\b/i,
  /\bas elvis\b/i,
  /\bworlds? collide\b/i,
  /^the world of\b/i,
  /\bchristmas (?:special|party)\b/i,
  /\bsoul party\b/i,
  /\bvol\.?\s*\d+/i,
  /^gms live\b/i,
  /^\d+\s*(?:º\s*)?aniversario\b/i,
  /\bapadrinad[oa]\b/i,
  /\bjam session\b/i,
  /^(?:open mic|karaoke)\b/i,
];

const SERIES_PREFIX_RE = /^(?:cicle|ciclo|cycle|the jazz room|viatge pel jazz|serie|series)\b[^:]*:\s*/i;
const DESCRIPTIVE_START_RE = /^(?:[Uu]na?|[Aa]n?|[Ee]l|[Ll]a|[Tt]he)\s+[a-zà-ÿ]/;
const TOUR_WORDS_RE =
  /\b(?:tour|gira|world|fin de gira|aniversari[o]?|anniversary|presentaci[oó]n?|presentació|concierto|concert|sinf[oó]nico|unplugged|ac[uú]stico|live in|edition|edición|20\d{2})\b/i;

const DECORATION_RES: RegExp[] = [
  /\s*[«“"][^»”"]*[»”"]/g,
  /\s*\([^)]*\)/g,
  /\s+in residency at .*$/i,
  /,?\s+presenta(?:ci[oó]n?|ció)?(?=\s|$).*$/i,
  /\s+album presentation$/i,
  /\s+format (?:duo|trio|quartet|quintet)$/i,
  /\s+special reuni[oó]n$/i,
  /\s+(?:live|en directo|en vivo|dj set|live set)$/i,
  /\s+(?:tour|gira)\s+20\d{2}(?:\/20\d{2})?$/i,
  /\s+20\d{2}$/,
  /\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$/i,
];

// "Leo Sidran & The Groovy French Band", "Ciro y los Persas": the right-hand
// side starts with an article, so the conjunction is part of a band name.
const ARTICLE_RE = /^(?:the|los|las|el|la|els|les|sus|his|her|their|o|os|as)\b/i;
// Case-sensitive on purpose: an uppercase "I" is far more often English than
// the Catalan conjunction.
const CONJUNCTION_SPLIT_RE =
  /\s+(?:i|y|Y|amb|AMB|meets|Meets|feat\.?|Feat\.?|FEAT\.?|ft\.?|Ft\.?|featuring|with|With|con|Con|CON)\s+/;

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim();
const wordCount = (value: string): number => collapse(value).split(' ').filter(Boolean).length;
const matchKey = (value: string): string =>
  collapse(
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\band\b/g, '&')
      .replace(/[^a-z0-9&]+/g, ' '),
  );

const isNotArtist = (value: string): boolean => NOT_ARTIST_PATTERNS.some((pattern) => pattern.test(value));

const stripDecorations = (value: string): string => {
  let result = value;
  for (const pattern of DECORATION_RES) result = result.replace(pattern, ' ');
  return collapse(result).replace(/^[\s\-–—:,.]+|[\s\-–—:,]+$/g, '');
};

// "X & Friends" is a person plus guests; a lone word ("Elvis & Friends") is
// a themed show, not a performer.
const stripFriends = (value: string): string | null => {
  const match = value.match(/^(.*?)\s*&\s*friends$/i);
  if (!match) return value;
  return wordCount(match[1]) >= 2 ? collapse(match[1]) : null;
};

const looksLikeNameList = (value: string): boolean =>
  /,/.test(value) && value.split(/,|\s+(?:i|y|and|&)\s+/).every((part) => /^\s*[A-ZÀ-Ý]/.test(part));

const splitAmpersand = (value: string): string[] => {
  const parts = value.split(/\s+&\s+/);
  if (parts.length !== 2) return [value];
  const [left, right] = parts.map(collapse);
  if (left.includes(',')) return [value];
  if (wordCount(left) >= 2 && wordCount(right) >= 2 && !ARTICLE_RE.test(right)) return [left, right];
  return [value];
};

const splitCollaborations = (value: string): string[] => {
  let parts = [value];

  parts = parts.flatMap((part) => {
    const pieces = part.split(CONJUNCTION_SPLIT_RE).map(collapse).filter(Boolean);
    if (pieces.length < 2) return [part];
    // Keep "Ciro y los Persas": a right side starting with an article joins.
    const merged: string[] = [];
    for (const piece of pieces) {
      if (merged.length > 0 && ARTICLE_RE.test(piece)) {
        merged[merged.length - 1] = `${merged[merged.length - 1]} ${part.match(CONJUNCTION_SPLIT_RE)?.[0].trim() ?? 'y'} ${piece}`;
      } else {
        merged.push(piece);
      }
    }
    return merged;
  });

  // "A/B/C" between letters; "Califato 3/4" keeps its fraction.
  parts = parts.flatMap((part) => part.split(/(?<=[^\d\s])\s*\/\s*(?=[^\d\s])/).map(collapse));

  // "Roman Filiu, Noslen Ortega": commas only split full names.
  parts = parts.flatMap((part) =>
    /,\s+[A-ZÀ-Ý][\p{L}'’.-]+\s+[A-ZÀ-Ý]/u.test(part) ? part.split(/,\s+/).map(collapse) : [part],
  );

  return parts.flatMap(splitAmpersand).filter(Boolean);
};

const SMALL_WORDS = new Set(['LA', 'EL', 'LOS', 'LAS', 'DE', 'DEL', 'Y', 'I', 'THE', 'OF', 'AND', 'EN', 'AL', 'UN', 'MI']);
const isAcronym = (word: string): boolean => {
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (SMALL_WORDS.has(word)) return false;
  return (
    /[.\d]/.test(word) ||
    (letters.length > 0 && !/[AEIOUÁÉÍÓÚÜY]/.test(letters))
  );
};

// Rule 7: "RAMONCÍN" → "Ramoncín", "LA M.O.D.A." → "La M.O.D.A.", SFDK stays.
export const smartTitleCase = (value: string): string => {
  const letters = value.replace(/[^\p{L}]/gu, '');
  if (letters.length <= 4 || letters !== letters.toUpperCase()) return value;
  return value
    .split(' ')
    .map((word) => {
      if (isAcronym(word)) return word;
      const lower = word.toLocaleLowerCase('es');
      return lower.replace(/(^|[-'’.])(\p{L})/gu, (_match, prefix: string, letter: string) =>
        `${prefix}${letter.toLocaleUpperCase('es')}`,
      );
    })
    .join(' ');
};

// Rule 4: "Morat - YEM World Tour" → artist "Morat", tour "YEM World Tour".
// A right side that is a full name instead ("Emilio Solla – Antonio Lizana
// Quartet") is a second artist.
const splitSubtitle = (value: string): { head: string; extraArtists: string[]; tourName: string | null } => {
  // Movistar writes "Morat- YEM World Tour": a dash with a space on either
  // side separates; "Sho-Hai" (no space) does not.
  const segments = value.split(/\s+[-–—]\s*|\s*[-–—]\s+/).map(collapse).filter(Boolean);
  if (segments.length < 2) return { head: value, extraArtists: [], tourName: null };
  const [head, ...rest] = segments;
  const tail = rest.join(' - ');
  const looksLikeSecondArtist =
    rest.length === 1 &&
    !TOUR_WORDS_RE.test(tail) &&
    /^(?:[A-ZÀ-Ý][\p{L}'’.]+\s+){1,3}(?:trio|quartet|quintet|sextet|band|orchestra|[A-ZÀ-Ý][\p{L}'’.]+)$/u.test(tail) &&
    /\b(?:trio|quartet|quintet|sextet|band|orchestra)\b/i.test(tail);
  if (looksLikeSecondArtist) return { head, extraArtists: [tail], tourName: null };
  return { head, extraArtists: [], tourName: tail };
};

// Rule 3 and the generic "Head: rest" form.
const splitColon = (value: string): { names: string[] | null; text: string; tourName: string | null } => {
  const prefixed = value.match(SERIES_PREFIX_RE);
  if (prefixed) {
    const rest = collapse(value.slice(prefixed[0].length));
    if (!rest || DESCRIPTIVE_START_RE.test(rest)) return { names: [], text: '', tourName: null };
    return { names: null, text: rest, tourName: null };
  }

  const colon = value.indexOf(':');
  if (colon <= 0) return { names: null, text: value, tourName: null };
  const left = collapse(value.slice(0, colon));
  const right = collapse(value.slice(colon + 1));
  if (!right) return { names: null, text: left, tourName: null };
  // "Oremi Afrojazz: Roman Filiu, Noslen Ortega i Gastón Joya" names the
  // line-up after the colon.
  if (looksLikeNameList(right) && !CONJUNCTION_SPLIT_RE.test(left)) return { names: null, text: right, tourName: left };
  return { names: null, text: left, tourName: right };
};

const dedupe = (names: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = matchKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
};

export const cleanArtistName = (raw: string | null | undefined): ArtistNameCleanup => {
  const input = collapse(raw || '');
  if (!input) return { names: [], tourName: null, reason: 'empty' };
  if (isNotArtist(input)) return { names: [], tourName: null, reason: 'not-artist' };

  const colon = splitColon(input);
  if (colon.names) return { names: [], tourName: null, reason: 'not-artist' };

  const subtitle = splitSubtitle(colon.text);
  const tourName = subtitle.tourName ?? colon.tourName;

  const heads = [subtitle.head, ...subtitle.extraArtists];
  const names: string[] = [];
  for (const head of heads) {
    const decorated = stripDecorations(head);
    const withoutFriends = stripFriends(decorated);
    if (!withoutFriends) continue;
    for (const part of splitCollaborations(withoutFriends)) {
      // "+" bills stay together so normalizeArtist marks them ambiguous for
      // review; each side still loses its decorations ("Crystal Chains Live").
      const cleaned = part.split(/\s+\+\s+/).map(stripDecorations).filter(Boolean).join(' + ');
      if (cleaned && !isNotArtist(cleaned)) names.push(cleaned);
    }
  }

  const unique = dedupe(names);
  if (unique.length === 0) return { names: [], tourName: null, reason: 'not-artist' };
  const unchanged = unique.length === 1 && unique[0] === input;
  return { names: unique, tourName: tourName || null, reason: unchanged ? 'unchanged' : 'cleaned' };
};

// Names stored before the hyphen fix read "Sho - Hai": a spaced dash followed
// by a single word cannot be told apart from "Soda Stereo - Ecos" without the
// raw source text, so callers treat it as ambiguous.
export const hasAmbiguousSpacedDash = (value: string): boolean => {
  const text = collapse(value);
  // "… - Tones" (one trailing word) or "… i Casey - Joan Whyte" (a single
  // word right after a conjunction, i.e. the middle of a person's name).
  return /\S\s+-\s+[\p{L}\d]+$/u.test(text) || /\s(?:i|y|&|and|amb)\s+[\p{L}]+\s+-\s+\p{L}/u.test(text);
};

export const artistNamesFromTitle = (title: string | null | undefined): string[] => cleanArtistName(title).names;
