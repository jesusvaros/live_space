import { supabase } from '../../lib/supabase';
import type { SocialMetadata } from './oembed';
import type { ConcertCandidate } from './resolveConcert';

export type ImportResult =
  | { kind: 'created'; postId: string }
  // Someone (maybe this person) imported the clip before. postId is set when
  // it is visible: published, or their own post still in review.
  | { kind: 'duplicate'; postId: string | null; status: string | null };

const HOUR = 3600 * 1000;

// Where the clip sits on the concert's timeline: its publish time when that
// falls during the night, else the chosen song's slot, else the start.
export const timelineTimeFor = (
  event: Pick<ConcertCandidate, 'starts_at' | 'ends_at'>,
  publishedAt: string | null,
  songOffsetMs: number | null,
) => {
  const start = new Date(event.starts_at).getTime();
  const end = event.ends_at ? new Date(event.ends_at).getTime() + 2 * HOUR : start + 8 * HOUR;
  const published = publishedAt ? new Date(publishedAt).getTime() : NaN;
  if (Number.isFinite(published) && published >= start - HOUR && published <= end) {
    return new Date(published).toISOString();
  }
  if (songOffsetMs !== null && Number.isFinite(start)) return new Date(start + songOffsetMs).toISOString();
  return Number.isFinite(start) ? new Date(start).toISOString() : null;
};

export const findImportedPost = async (externalUrl: string) => {
  const { data, error } = await supabase
    .from('posts')
    .select('id,status')
    .eq('external_url', externalUrl)
    .maybeSingle();
  if (error) return null;
  return (data as { id: string; status: string } | null) ?? null;
};

export const importExternalPost = async (options: {
  metadata: SocialMetadata;
  event: ConcertCandidate;
  authorId: string;
  songId: string | null;
  songOffsetMs: number | null;
  matchMethod: 'tag' | 'time_text' | 'manual';
}): Promise<ImportResult> => {
  const { metadata, event } = options;
  const existing = await findImportedPost(metadata.url);
  if (existing) return { kind: 'duplicate', postId: existing.id, status: existing.status };

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: options.authorId,
      event_id: event.id,
      song_id: options.songId,
      source: metadata.source,
      external_url: metadata.url,
      external_id: metadata.externalId,
      external_embed_html: metadata.embedHtml,
      external_author_handle: metadata.authorHandle,
      external_author_name: metadata.authorName,
      external_author_url: metadata.authorUrl,
      external_thumbnail_url: metadata.thumbnailUrl,
      external_published_at: metadata.publishedAt,
      caption: metadata.title,
      captured_at: timelineTimeFor(event, metadata.publishedAt, options.songOffsetMs),
      match_method: options.matchMethod,
      // Someone else's video: never licensed for reuse by the event.
      allow_reuse: false,
      // Imports wait for moderation like any upload (RLS requires it).
      status: 'review',
    })
    .select('id')
    .single();

  if (error) {
    // Unique external_url: already imported by someone else and not yet public.
    if (error.code === '23505') return { kind: 'duplicate', postId: null, status: null };
    throw error;
  }
  return { kind: 'created', postId: (data as { id: string }).id };
};

// The same report queue as any other post (moderation_reports, target 'post').
export const reportPost = async (postId: string, reporterId: string, reason: string) => {
  const { error } = await supabase.from('moderation_reports').insert({
    reporter_id: reporterId,
    target_type: 'post',
    target_id: postId,
    reason,
  });
  if (error) throw error;
};
