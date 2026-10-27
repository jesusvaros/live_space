// The concert tag (#LSRIV29): "LS" + venue code + day of month + an optional
// disambiguator letter. The database assigns the real, unique tag
// (events.share_tag, see 20261028040100_social_import.sql); this file mirrors
// its base so a screen can still show a tag before the migration is applied,
// and reads tags back out of captions.

export type TaggableEvent = {
  share_tag?: string | null;
  starts_at?: string | null;
  timezone?: string | null;
  venue_place?: { name?: string | null } | null;
  venue_name?: string | null;
};

const STOP_WORDS = new Set(['LA', 'EL', 'LOS', 'LAS', 'L', 'SALA', 'THE', 'DE', 'DEL', 'Y', 'AND', 'CLUB']);

// Same rule as public.event_share_tag_venue_code.
export const venueCode = (venueName: string | null | undefined): string => {
  const cleaned = (venueName ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z ]+/g, ' ')
    .trim();
  let letters = '';
  for (const word of cleaned.split(/\s+/)) {
    if (!word || STOP_WORDS.has(word)) continue;
    letters += word;
    if (letters.length >= 3) break;
  }
  return letters.slice(0, 3).padEnd(3, 'X');
};

const dayOfMonth = (startsAt: string, timeZone: string) => {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', timeZone: 'Europe/Madrid' }).format(date);
  }
};

// Tag without "#": the stored one, or the base the database would start from.
export const getEventTagCode = (event: TaggableEvent): string | null => {
  if (event.share_tag) return event.share_tag.toUpperCase();
  if (!event.starts_at) return null;
  const day = dayOfMonth(event.starts_at, event.timezone || 'Europe/Madrid');
  if (!day) return null;
  return `LS${venueCode(event.venue_place?.name ?? event.venue_name)}${day}`;
};

// "#LSRIV29", ready to print on a poster or an event page.
export const getEventTag = (event: TaggableEvent): string | null => {
  const code = getEventTagCode(event);
  return code ? `#${code}` : null;
};

// Song tag for setlist position n: "#LSRIV29s07".
export const getSongTag = (event: TaggableEvent, position: number): string | null => {
  const tag = getEventTag(event);
  return tag ? `${tag}s${String(position).padStart(2, '0')}` : null;
};

export type CaptionTags = {
  // Event tags without "#", upper case, in caption order.
  eventTags: string[];
  // Setlist position from "#LSRIV29s07" or "#cancion7", if any.
  songPosition: number | null;
};

// The disambiguator never uses I, O or S, so "s07" can only be the song.
const EVENT_TAG = /#LS([A-Z]{3}[0-9]{2}[B-HJ-NP-RT-Z]{0,2})(?:S([0-9]{1,2}))?(?![A-Z0-9])/gi;
const SONG_TAG = /#canci[oó]n[_-]?([0-9]{1,2})(?![0-9])/i;

export const parseCaptionTags = (text: string | null | undefined): CaptionTags => {
  const eventTags: string[] = [];
  let songPosition: number | null = null;
  for (const match of (text ?? '').matchAll(EVENT_TAG)) {
    const code = `LS${match[1].toUpperCase()}`;
    if (!eventTags.includes(code)) eventTags.push(code);
    if (match[2] && songPosition === null) songPosition = Number(match[2]);
  }
  if (songPosition === null) {
    const song = (text ?? '').match(SONG_TAG);
    if (song) songPosition = Number(song[1]);
  }
  return { eventTags, songPosition: songPosition && songPosition > 0 ? songPosition : null };
};
