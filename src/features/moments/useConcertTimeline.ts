import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { EventSetlistEntry, PostWithSetlist } from '../../lib/types';
import { isExternalPost } from '../socialImport';
import { buildConcertTimeline, type TimelineMoment } from './concertTimeline';

// The concert's moments for the multi-track player: the published posts of
// the event (v_event_posts_with_setlist) plus, per post, the media duration
// and size (media_assets) and the like count (post_likes, the only
// popularity signal stored today).

const MOMENT_COLUMNS = [
  'id', 'user_id', 'event_id', 'media_type', 'media_url', 'thumbnail_url', 'caption', 'captured_at', 'created_at',
  'song_id', 'song_title', 'resolved_song_id', 'resolved_song_title', 'actor_name', 'actor_image_url', 'profiles',
  'source', 'external_url', 'external_id', 'external_author_handle', 'external_author_name',
].join(',');

// More than this and the oldest stay out; the player is built for hundreds.
const MAX_MOMENTS = 800;

type PostMeta = { durationSec: number | null; width: number | null; height: number | null; likes: number };

const toNumber = (value: unknown) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

export const toTimelineMoment = (post: PostWithSetlist, meta?: PostMeta): TimelineMoment => ({
  id: post.id,
  userId: post.user_id,
  userName: post.profiles?.username || post.profiles?.display_name || post.actor_name || null,
  avatarUrl: post.profiles?.avatar_url ?? post.actor_image_url ?? null,
  mediaType: post.media_type === 'image' ? 'image' : 'video',
  mediaUrl: post.media_url,
  thumbnailUrl: post.thumbnail_url,
  external: isExternalPost(post),
  capturedAt: post.captured_at,
  createdAt: post.created_at,
  songId: post.resolved_song_id || post.song_id,
  durationSec: meta?.durationSec ?? null,
  width: meta?.width ?? null,
  height: meta?.height ?? null,
  likes: meta?.likes ?? 0,
  post,
});

const fetchMeta = async (eventId: string): Promise<Map<string, PostMeta>> => {
  const { data, error } = await supabase
    .from('posts')
    .select('id, media:media_assets(duration_seconds,width,height), post_likes(count)')
    .eq('event_id', eventId)
    .eq('status', 'published')
    .limit(MAX_MOMENTS);
  const meta = new Map<string, PostMeta>();
  // Durations and likes only refine the timeline: without them it still plays.
  if (error || !data) return meta;
  for (const row of data as any[]) {
    const media = Array.isArray(row.media) ? row.media[0] : row.media;
    const likes = Array.isArray(row.post_likes) ? row.post_likes[0]?.count : null;
    meta.set(row.id, {
      durationSec: toNumber(media?.duration_seconds),
      width: toNumber(media?.width),
      height: toNumber(media?.height),
      likes: toNumber(likes) ?? 0,
    });
  }
  return meta;
};

export const fetchConcertMoments = async (eventId: string): Promise<TimelineMoment[]> => {
  const [postsResult, meta] = await Promise.all([
    supabase
      .from('v_event_posts_with_setlist')
      .select(MOMENT_COLUMNS)
      .eq('event_id', eventId)
      .order('event_offset_ms', { ascending: true, nullsFirst: false })
      .limit(MAX_MOMENTS),
    fetchMeta(eventId),
  ]);
  if (postsResult.error) throw postsResult.error;
  return ((postsResult.data || []) as unknown as PostWithSetlist[]).map(post => toTimelineMoment(post, meta.get(post.id)));
};

export const useConcertMoments = (eventId: string) => {
  const [moments, setMoments] = useState<TimelineMoment[]>([]);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) return undefined;
    let cancelled = false;
    setMoments([]);
    setLoading(true);
    setError('');
    fetchConcertMoments(eventId)
      .then(next => {
        if (!cancelled) setMoments(next);
      })
      .catch(() => {
        if (!cancelled) setError('No se han podido cargar los momentos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return { moments, loading, error };
};

/**
 * Builds the timeline and refines it with the real length of videos as the
 * player learns them (uploads without a stored duration start at the default).
 */
export const useConcertTimeline = (options: {
  moments: TimelineMoment[];
  setlist: EventSetlistEntry[];
  startsAt: string | null;
  endsAt: string | null;
  currentUserId: string | null;
}) => {
  const { moments, setlist, startsAt, endsAt, currentUserId } = options;
  const [measured, setMeasured] = useState<Record<string, number>>({});

  const reportDuration = useCallback((momentId: string, seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    setMeasured(previous =>
      previous[momentId] !== undefined && Math.abs(previous[momentId] - seconds) < 0.5
        ? previous
        : { ...previous, [momentId]: seconds });
  }, []);

  const timeline = useMemo(() => {
    if (!startsAt) return null;
    const withDurations = moments.map(moment =>
      moment.durationSec || measured[moment.id] === undefined ? moment : { ...moment, durationSec: measured[moment.id] });
    return buildConcertTimeline({ moments: withDurations, setlist, startsAt, endsAt, currentUserId });
  }, [moments, measured, setlist, startsAt, endsAt, currentUserId]);

  return { timeline, reportDuration };
};
