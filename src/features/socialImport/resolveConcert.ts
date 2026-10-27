import { supabase } from '../../lib/supabase';
import { parseCaptionTags } from './eventTag';
import type { SocialMetadata } from './oembed';

// Which concert (and song) an imported clip belongs to, in this order:
//   a. a concert tag in the caption (#LSRIV29, optionally #LSRIV29s07 / #cancion7);
//   b. the post's time plus the venue or artist named in the caption or author,
//      against concerts within 36 h;
//   c. otherwise the person picks from their saved/attended concerts.

export type ConcertCandidate = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  share_tag: string | null;
  city: string | null;
  image_url: string | null;
  venue_name: string | null;
  artists: string[];
};

export type ConcertResolution = {
  event: ConcertCandidate | null;
  method: 'tag' | 'time_text' | null;
  // The tag or names that decided it, to explain the choice in the UI.
  reason: string | null;
  songPosition: number | null;
  suggestions: ConcertCandidate[];
};

const MATCH_WINDOW_MS = 36 * 3600 * 1000;

const SELECT_WITH_TAG = `
  id,name,starts_at,ends_at,timezone,share_tag,city,image_url,
  venue_place:venue_places!events_venue_place_id_fkey (name),
  event_artists ( artist:artists!event_artists_artist_id_fkey (name) )
`;
// Before 20261028040100_social_import.sql (or 20261027000100_media_images.sql) is applied.
const SELECT_BASIC = `
  id,name,starts_at,ends_at,timezone,city,
  venue_place:venue_places!events_venue_place_id_fkey (name),
  event_artists ( artist:artists!event_artists_artist_id_fkey (name) )
`;

const toCandidate = (row: any): ConcertCandidate => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  starts_at: String(row.starts_at ?? ''),
  ends_at: row.ends_at ?? null,
  timezone: row.timezone ?? null,
  share_tag: row.share_tag ?? null,
  city: row.city ?? null,
  image_url: row.image_url ?? null,
  venue_name: row.venue_place?.name ?? null,
  artists: (row.event_artists ?? [])
    .map((entry: any) => entry?.artist?.name)
    .filter((name: unknown): name is string => typeof name === 'string' && name.trim() !== ''),
});

type EventFilter = (query: any) => any;

const queryEvents = async (filter: EventFilter, options: { needsTag?: boolean } = {}) => {
  const run = (select: string) => filter(supabase.from('events').select(select).eq('status', 'published'));
  let { data, error } = await run(SELECT_WITH_TAG);
  if (error && !options.needsTag) ({ data, error } = await run(SELECT_BASIC));
  if (error) throw error;
  return ((data ?? []) as any[]).map(toCandidate);
};

export const normalizeForMatch = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const FILLER = new Set(['la', 'el', 'los', 'las', 'sala', 'the', 'de', 'del', 'club', 'teatro', 'y', 'and']);

const core = (value: string) =>
  normalizeForMatch(value)
    .split(' ')
    .filter(word => word && !FILLER.has(word))
    .join(' ');

// "La Riviera" matches "en la riviera", "#lariviera" and "@lariviera".
const mentions = (text: string, compactText: string, name: string | null | undefined) => {
  if (!name) return false;
  const words = core(name);
  if (words.length < 3) return false;
  if (` ${text} `.includes(` ${words} `)) return true;
  const compact = words.replace(/ /g, '');
  return compact.length >= 4 && compactText.includes(compact);
};

export const scoreCandidate = (candidate: ConcertCandidate, rawText: string) => {
  const text = normalizeForMatch(rawText);
  const compactText = text.replace(/ /g, '');
  const matched: string[] = [];
  let score = 0;
  if (mentions(text, compactText, candidate.venue_name)) {
    score += 2;
    matched.push(candidate.venue_name as string);
  }
  const artist = candidate.artists.find(name => mentions(text, compactText, name));
  if (artist) {
    score += 3;
    matched.push(artist);
  } else if (mentions(text, compactText, candidate.name)) {
    score += 2;
    matched.push(candidate.name);
  }
  return { score, matched };
};

const byClosenessTo = (time: number) => (left: ConcertCandidate, right: ConcertCandidate) =>
  Math.abs(new Date(left.starts_at).getTime() - time) - Math.abs(new Date(right.starts_at).getTime() - time);

// Concerts the person saved or marked as going/attended, most recent first.
export const fetchMyConcerts = async (profileId: string): Promise<ConcertCandidate[]> => {
  const [saves, attendance] = await Promise.all([
    supabase.from('event_saves').select('event_id').eq('profile_id', profileId).limit(100),
    supabase.from('event_attendance').select('event_id').eq('profile_id', profileId).limit(100),
  ]);
  const ids = Array.from(new Set([
    ...((saves.data ?? []) as { event_id: string }[]).map(row => row.event_id),
    ...((attendance.data ?? []) as { event_id: string }[]).map(row => row.event_id),
  ]));
  if (ids.length === 0) return [];
  const until = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const events = await queryEvents(query => query.in('id', ids.slice(0, 100)).lte('starts_at', until));
  return events.sort((left, right) => right.starts_at.localeCompare(left.starts_at)).slice(0, 20);
};

export const resolveConcert = async (options: {
  metadata: SocialMetadata;
  sharedText?: string | null;
  profileId?: string | null;
}): Promise<ConcertResolution> => {
  const { metadata } = options;
  const text = [metadata.title, options.sharedText, metadata.authorName, metadata.authorHandle]
    .filter(Boolean)
    .join(' \n ');
  const tags = parseCaptionTags(text);
  const publishedAt = metadata.publishedAt ? new Date(metadata.publishedAt).getTime() : Date.now();

  const [tagged, nearby, mine] = await Promise.all([
    tags.eventTags.length > 0
      ? queryEvents(query => query.in('share_tag', tags.eventTags), { needsTag: true }).catch(() => [])
      : Promise.resolve([] as ConcertCandidate[]),
    queryEvents(query =>
      query
        .gte('starts_at', new Date(publishedAt - MATCH_WINDOW_MS).toISOString())
        .lte('starts_at', new Date(publishedAt + MATCH_WINDOW_MS).toISOString())
        .order('starts_at', { ascending: true })
        .limit(200),
    ).catch(() => [] as ConcertCandidate[]),
    options.profileId ? fetchMyConcerts(options.profileId).catch(() => []) : Promise.resolve([] as ConcertCandidate[]),
  ]);

  const tagOrder = (candidate: ConcertCandidate) => tags.eventTags.indexOf(candidate.share_tag ?? '');
  const byTag = [...tagged].sort((left, right) => tagOrder(left) - tagOrder(right))[0] ?? null;

  let event: ConcertCandidate | null = null;
  let method: ConcertResolution['method'] = null;
  let reason: string | null = null;
  if (byTag) {
    event = byTag;
    method = 'tag';
    reason = `#${byTag.share_tag}`;
  } else {
    const scored = nearby
      .map(candidate => ({ candidate, ...scoreCandidate(candidate, text) }))
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score || byClosenessTo(publishedAt)(left.candidate, right.candidate));
    const best = scored[0];
    // Only a clear winner decides; a tie goes to the person.
    if (best && (scored.length === 1 || scored[1].score < best.score)) {
      event = best.candidate;
      method = 'time_text';
      reason = best.matched.join(' · ');
    }
  }

  const seen = new Set<string>();
  const suggestions = [
    ...mine.sort(byClosenessTo(publishedAt)),
    ...nearby.sort(byClosenessTo(publishedAt)).slice(0, 8),
  ].filter(candidate => {
    if (candidate.id === event?.id || seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  }).slice(0, 12);

  return {
    event,
    method,
    reason,
    songPosition: tags.songPosition,
    suggestions,
  };
};
