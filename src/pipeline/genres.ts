// The styles the app groups concerts by. Sources say "Alternativo", "neosoul",
// "Jazz Contemporani" or "CONCIERTOS, punk"; everything is folded into this
// short list so a filter or a taste means the same thing everywhere.
export const STYLES = [
  'Indie',
  'Rock',
  'Pop',
  'Electrónica',
  'Rap y urbano',
  'Jazz',
  'Flamenco',
  'Metal',
  'Punk',
  'Soul y funk',
  'Folk y cantautor',
  'Latina',
  'Blues',
  'Clásica',
  'Reggae',
  'Músicas del mundo',
] as const;

export type Style = (typeof STYLES)[number];

// Matched against lowercased text without accents. Order matters only for
// readability: every style that matches is returned.
const PATTERNS: Array<[Style, RegExp]> = [
  ['Indie', /\b(indie|alternativo|alternative|shoegaze|dream ?pop|lo-?fi|post-?rock|post-?punk)\b/],
  ['Rock', /\b(rock|rock ?(and|n|&) ?roll|garage|psicodeli\w*|psych\w*|stoner|grunge|rockabilly)\b/],
  ['Pop', /\b(pop|synth-?pop|electropop|tecnopop|k-?pop)\b/],
  ['Electrónica', /\b(electr[oó]nica?|electronic|electro|techno|tecno|house|dance|edm|clubbing|dj ?set|drum ?(and|n|&) ?bass|dnb|ambient|trance|breakbeat)\b/],
  ['Rap y urbano', /\b(rap|hip-? ?hop|trap|reggaet[oó]n|m[uú]sica urbana|urban|drill|dembow)\b/],
  ['Jazz', /\b(jazz|bebop|hard ?bop|swing|big ?band|straight ahead)\b/],
  ['Flamenco', /\b(flamenc[oa]|rumba|cante jondo|buler[ií]as|copla)\b/],
  ['Metal', /\b(metal|heavy|thrash|doom|metalcore|black metal|death metal)\b/],
  ['Punk', /\b(punk|hardcore|oi!?|ska-?punk|emo)\b/],
  ['Soul y funk', /\b(soul|neo-?soul|funk|funky|motown|gospel|r ?& ?b|rhythm (and|&) blues)\b/],
  ['Folk y cantautor', /\b(folk|cantautor[ae]?s?|singer-?songwriter|americana|country|bluegrass)\b/],
  ['Latina', /\b(salsa|cumbia|latin[oa]?|bachata|son cubano|bolero|tango|bossa ?nova|samba|mpb|brasile[nñ]a|cuban[oa]?)\b/],
  ['Blues', /\b(blues)\b/],
  ['Clásica', /\b(m[uú]sica cl[aá]sica|classical|orquesta|sinf[oó]nic[oa]|[oó]pera|barroc[oa]|m[uú]sica de c[aá]mara)\b/],
  ['Reggae', /\b(reggae|dub|ska|dancehall|rocksteady)\b/],
  ['Músicas del mundo', /\b(afrobeat|afro|world music|m[uú]sicas? del mundo|fado|balkan|klezmer|celta|celtic|[aá]rabe)\b/],
];

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Every style a free text mentions, in STYLES order. */
export const stylesInText = (text: string | null | undefined): Style[] => {
  if (!text) return [];
  const folded = fold(text);
  return STYLES.filter((style) => PATTERNS.some(([name, pattern]) => name === style && pattern.test(folded)));
};

// Deezer's own genre list (api.deezer.com/genre). Soundtracks and kids'
// music say nothing about a concert and are left out.
const DEEZER_GENRES: Record<number, Style> = {
  132: 'Pop',
  116: 'Rap y urbano',
  122: 'Rap y urbano',
  152: 'Rock',
  113: 'Electrónica',
  165: 'Soul y funk',
  85: 'Indie',
  106: 'Electrónica',
  466: 'Folk y cantautor',
  144: 'Reggae',
  129: 'Jazz',
  67: 'Latina',
  98: 'Clásica',
  464: 'Metal',
  169: 'Soul y funk',
  153: 'Blues',
  71: 'Latina',
  197: 'Latina',
  75: 'Latina',
  2: 'Músicas del mundo',
  12: 'Músicas del mundo',
  16: 'Músicas del mundo',
  81: 'Músicas del mundo',
};

/**
 * The one or two styles that describe a discography: those behind at least a
 * quarter of the albums, most common first. A single stray remix album does
 * not make a jazz trio "Electrónica".
 */
export const stylesFromDeezerGenres = (genreIds: number[]): Style[] => {
  const counts = new Map<Style, number>();
  let total = 0;
  for (const id of genreIds) {
    const style = DEEZER_GENRES[id];
    if (!style) continue;
    total += 1;
    counts.set(style, (counts.get(style) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count / total >= 0.25)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([style]) => style);
};

// Venue CMS categories that only say "this is a concert".
const GENERIC_TAG = /^(conciertos?|concerts?|concert|actividades|carrusel|destacad[oa]s?|agenda|eventos?|musica|live|directo)$/;

/**
 * Labels a venue attached to a listing (WordPress tags and categories, an
 * ESTILO or style field), whatever their shape: strings, arrays of strings
 * or arrays of { name }.
 */
export const tagsFromPayload = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const out: string[] = [];
  const take = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(take);
    else if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') {
      out.push((value as { name: string }).name);
    }
  };
  for (const key of ['tags', 'categories', 'category', 'Category', 'style', 'ESTILO', 'genre', 'genres']) take(record[key]);
  return out.map((tag) => tag.trim()).filter((tag) => tag && !GENERIC_TAG.test(fold(tag)));
};

/** Most frequent first, at most `limit`. */
export const topStyles = (lists: Style[][], limit: number): Style[] => {
  const counts = new Map<Style, number>();
  for (const list of lists) for (const style of new Set(list)) counts.set(style, (counts.get(style) || 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || STYLES.indexOf(left[0]) - STYLES.indexOf(right[0]))
    .slice(0, limit)
    .map(([style]) => style);
};
