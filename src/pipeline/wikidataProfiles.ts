import { type Style, stylesInText } from './genres.js';

// Artist facts from Wikidata (CC0, free to reuse without attribution),
// looked up by the MusicBrainz id we already store. Used only to PROPOSE a
// short bio, styles and links for a person to review; nothing is invented:
// the bio is a template filled with Wikidata's own statements, and a field
// Wikidata does not have is left out.

export type WikidataBinding = Record<string, { value: string } | undefined>;

export type WikidataArtist = {
  mbid: string;
  item: string;
  kinds: Set<string>;
  kindLabels: Set<string>;
  genres: Set<string>;
  place: string | null;
  country: string | null;
  inception: string | null;
  eswiki: string | null;
  spotify: string | null;
  instagram: string | null;
  website: string | null;
  youtube: string | null;
};

const HUMAN = 'Q5';
const DUO = 'Q9212979';
const GROUP_WORDS = /\b(banda|grupo|conjunto|dúo|duo|trío|trio|orquesta|big band|ensemble|colectivo)\b/i;

// Wikidata gives back the bare id ("Q123") when there is no Spanish label.
const label = (value: string | undefined) => (value && !/^Q\d+$/.test(value) ? value : null);
const qid = (value: string | undefined) => value?.split('/').pop() ?? null;

/** Folds the SPARQL rows (one per combination of values) into one record per MusicBrainz id. */
export const groupBindings = (rows: WikidataBinding[]): Map<string, WikidataArtist> => {
  const byMbid = new Map<string, WikidataArtist>();
  for (const row of rows) {
    const mbid = row.mbid?.value;
    const item = row.item?.value;
    if (!mbid || !item) continue;
    let artist = byMbid.get(mbid);
    if (!artist) {
      artist = {
        mbid,
        item,
        kinds: new Set(),
        kindLabels: new Set(),
        genres: new Set(),
        place: null,
        country: null,
        inception: null,
        eswiki: null,
        spotify: null,
        instagram: null,
        website: null,
        youtube: null,
      };
      byMbid.set(mbid, artist);
    }
    const kind = qid(row.kind?.value);
    if (kind) artist.kinds.add(kind);
    const kindLabel = label(row.kindLabel?.value);
    if (kindLabel) artist.kindLabels.add(kindLabel);
    const genre = label(row.genreLabel?.value);
    if (genre) artist.genres.add(genre);
    artist.place ??= label(row.placeLabel?.value);
    artist.country ??= label(row.countryLabel?.value);
    artist.inception ??= row.inception?.value ?? null;
    artist.eswiki ??= row.eswiki?.value ?? null;
    artist.spotify ??= row.spotify?.value ?? null;
    artist.instagram ??= row.instagram?.value ?? null;
    artist.website ??= row.website?.value ?? null;
    artist.youtube ??= row.youtube?.value ?? null;
  }
  return byMbid;
};

/** «Grupo», «Dúo», «Artista» (people, gender-neutral) or null when Wikidata does not say. */
export const kindWord = (artist: Pick<WikidataArtist, 'kinds' | 'kindLabels'>): string | null => {
  if (artist.kinds.has(HUMAN)) return 'Artista';
  if (artist.kinds.has(DUO)) return 'Dúo';
  if ([...artist.kindLabels].some((name) => GROUP_WORDS.test(name))) return 'Grupo';
  return null;
};

/** The app's styles for Wikidata's genres (Spanish labels, mapped like every other source). */
export const stylesFor = (artist: Pick<WikidataArtist, 'genres'>): Style[] => {
  const found = new Set<Style>();
  for (const genre of artist.genres) for (const style of stylesInText(genre)) found.add(style);
  return [...found];
};

const year = (iso: string | null) => (iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : null);

/**
 * A one-line bio from Wikidata's statements, e.g. «Grupo de indie rock de
 * Madrid, en activo desde 2005.» Null when there is too little to say.
 * Birth places and dates of people are personal data and never used.
 */
export const bioDraft = (artist: WikidataArtist): string | null => {
  const kind = kindWord(artist);
  if (!kind) return null;
  const genres = [...artist.genres].slice(0, 2).map((genre) => genre.toLowerCase());
  const human = kind === 'Artista';
  const where = human ? artist.country : artist.place ?? artist.country;
  // «Artista de España.» says nothing: people need at least a genre.
  if (!genres.length && (human || !where)) return null;
  let text = kind;
  if (genres.length) text += ` de ${genres.join(' y ')}`;
  if (where) text += ` de ${where}`;
  const since = human ? null : year(artist.inception);
  if (since) text += `, en activo desde ${since}`;
  return `${text}.`;
};

export const sparqlFor = (mbids: string[]) => `
SELECT ?mbid ?item ?kind ?kindLabel ?genreLabel ?placeLabel ?countryLabel ?inception ?eswiki ?spotify ?instagram ?website ?youtube WHERE {
  VALUES ?mbid { ${mbids.map((mbid) => `"${mbid.replace(/[^0-9a-f-]/gi, '')}"`).join(' ')} }
  ?item wdt:P434 ?mbid.
  OPTIONAL { ?item wdt:P31 ?kind. }
  OPTIONAL { ?item wdt:P136 ?genre. }
  OPTIONAL { ?item wdt:P740 ?place. }
  OPTIONAL { ?item wdt:P495 ?country. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?eswiki schema:about ?item; schema:isPartOf <https://es.wikipedia.org/>. }
  OPTIONAL { ?item wdt:P1902 ?spotify. }
  OPTIONAL { ?item wdt:P2003 ?instagram. }
  OPTIONAL { ?item wdt:P856 ?website. }
  OPTIONAL { ?item wdt:P2397 ?youtube. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es". }
}`;

/** Links in the format artists.external_links uses, from Wikidata's ids. */
export const linksFor = (artist: WikidataArtist): Record<string, string> => {
  const links: Record<string, string> = {};
  if (artist.spotify) links.spotify = `https://open.spotify.com/artist/${artist.spotify}`;
  if (artist.instagram) links.instagram = `https://www.instagram.com/${artist.instagram}/`;
  if (artist.youtube) links.youtube = `https://www.youtube.com/channel/${artist.youtube}`;
  if (artist.website && /^https?:\/\//.test(artist.website)) links.website = artist.website;
  return links;
};
