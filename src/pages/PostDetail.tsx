import React, { useEffect, useRef, useState } from 'react';
import { Spinner } from '../components/ui/AppPrimitives';
import { useNavigate, useParams } from 'react-router-dom';
import { PostWithRelations } from '../lib/types';
import AppShell from '../components/AppShell';
import DetailHeader from '../components/ui/DetailHeader';
import ShareSheet from '../components/ShareSheet';
import Avatar from '../components/ui/Avatar';
import CoverImage from '../components/ui/CoverImage';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { IconCamera, IconHeart, IconHeartFilled, IconPlay, IconShare } from '../components/icons';
import { fetchPostCardById } from '../data/postQueries';
import { fetchEventCardById } from '../data/eventQueries';
import { ExternalMomentCard, isExternalPost } from '../features/socialImport';
import { MomentReuseControls, ReportMomentButton } from '../features/community';
import { blockTargetLabel } from '../features/blocks/blocking';
import { useBlockedUserIds } from '../features/blocks/useBlockedUsers';
import { usePostLikes } from '../features/photos/usePostLikes';
import { getPrimaryArtistName } from '../features/events/utils';
import type { EventListItem } from '../features/events/types';
import { eventCoverSources } from '../lib/eventCover';
import { videoPoster } from '../media/videoPoster';
import { NAV_CLEARANCE } from '../components/BottomNav';

// One moment: the photo or video, who took it and when, ♥ / share / report
// as round buttons like the rest of the app, and the concert it belongs to
// (poster, artists and venue, each one a link).

const ROUND = 'flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md';

const timeLabel = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const PostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLElement | null>(null);
  const [post, setPost] = useState<PostWithRelations | null>(null);
  const [event, setEvent] = useState<EventListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const blocked = useBlockedUserIds();
  const { likedIds, setLiked } = usePostLikes();
  // Blocked from this page (or before): the moment stops showing.
  const authorBlocked = Boolean(post?.user_id && blocked.has(post.user_id));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      setEvent(null);
      try {
        const data = id ? await fetchPostCardById(id) : null;
        if (!data) throw new Error('Post not found');
        if (cancelled) return;
        setPost(data);
        // The concert as everywhere else: real poster, artists, venue.
        if (data.event_id) {
          const card = await fetchEventCardById(data.event_id).catch(() => null);
          if (!cancelled) setEvent(card);
        }
      } catch {
        if (!cancelled) {
          setError('No encontramos este momento.');
          setPost(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const external = post ? isExternalPost(post) : false;
  const liked = Boolean(post && likedIds.has(post.id));
  const author = post?.profiles?.username ? `@${post.profiles.username}` : post?.profiles?.display_name || null;
  const when = timeLabel(post?.captured_at || post?.created_at);
  const song = (post as (PostWithRelations & { resolved_song_title?: string | null }) | null)?.resolved_song_title || post?.song_title || null;
  const artists = (event?.event_artists || []).flatMap(entry => (entry.artist ? [entry.artist] : []));
  const venue = event?.venue_place ?? null;
  const shareUrl = post ? `${window.location.origin}/post/${post.id}` : '';

  return (
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader
        title={event ? getPrimaryArtistName(event) : 'Momento'}
        scrollRef={contentRef}
        fallbackHref={post?.event_id ? `/event/${post.event_id}` : '/tabs/feed'}
        actions={
          post && !authorBlocked ? (
            <button type="button" aria-label="Compartir" className={ROUND} onClick={() => setShowShare(true)}>
              <IconShare size={19} />
            </button>
          ) : null
        }
      />

      {loading && (
        <div className="flex items-center justify-center pt-28">
          <Spinner />
        </div>
      )}

      {!loading && error && <p className="px-4 pt-24 text-sm text-rose-400">{error}</p>}

      {!loading && post && authorBlocked && (
        <p className="px-4 pt-24 text-sm text-white/70">Has bloqueado a quien subió este momento.</p>
      )}

      {!loading && post && !authorBlocked && (
        <div className={NAV_CLEARANCE}>
          {external ? (
            <div className="pt-[calc(64px+env(safe-area-inset-top,0px))]">
              <ExternalMomentCard post={post} />
            </div>
          ) : (
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
              {post.media_type === 'video' ? (
                <video
                  controls
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                  poster={videoPoster(post.thumbnail_url, event?.cover_image_url ?? null)}
                >
                  <source src={post.media_url} />
                </video>
              ) : (
                <img src={post.media_url} alt={post.caption || `Foto de ${author || 'alguien del público'}`} className="absolute inset-0 h-full w-full object-cover" />
              )}
              {/* What it is and when, like the cards in «Subir». */}
              <span className="pointer-events-none absolute left-3 top-[calc(64px+env(safe-area-inset-top,0px))] inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 font-mono text-[11px] font-semibold text-white">
                {post.media_type === 'video' ? <IconPlay size={12} /> : <IconCamera size={12} />}
                {when}
              </span>
            </div>
          )}

          {/* Who took it, and the actions. */}
          <div className="flex items-center gap-3 px-4 pt-4">
            {!external && post.user_id ? (
              <button
                type="button"
                onClick={() => navigate(`/profile/${post.user_id}`)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <Avatar name={author || '?'} src={post.profiles?.avatar_url} className="h-10 w-10 shrink-0 text-[14px]" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-app-ink">{author || 'Alguien del público'}</span>
                  {song ? <span className="block truncate text-[13px] text-[#c9c5bd]">♪ {song}</span> : null}
                </span>
              </button>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
            <button
              type="button"
              aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
              aria-pressed={liked}
              onClick={() => setLiked(post.id, !liked)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                liked ? 'border-app-accent text-app-accent' : 'border-app-line text-app-ink'
              }`}
            >
              {liked ? <IconHeartFilled size={20} /> : <IconHeart size={20} />}
            </button>
            {external ? null : (
              <ReportMomentButton postId={post.id} authorId={post.user_id} authorLabel={blockTargetLabel(post.profiles)} variant="round" />
            )}
          </div>

          {post.caption ? <p className="px-4 pt-3 text-[15px] leading-snug text-app-ink">{post.caption}</p> : null}

          {/* The concert: poster and date, then its artists and venue. */}
          {event ? (
            <section className="px-4 pt-6" aria-label="El concierto">
              <button
                type="button"
                onClick={() => navigate(`/event/${event.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-2.5 text-left"
              >
                <span className="relative h-[92px] w-[74px] shrink-0 overflow-hidden rounded-xl bg-black">
                  <CoverImage
                    sources={eventCoverSources(event, 'thumb', [artists.find(artist => artist.avatar_url)?.avatar_url])}
                    fallback={<GeneratedPoster title={getPrimaryArtistName(event)} variant="thumb" />}
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-app-accent">
                    {new Date(event.starts_at).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="mt-0.5 block font-display text-lg font-bold leading-tight text-app-ink line-clamp-2">
                    {getPrimaryArtistName(event)}
                  </span>
                  {venue ? <span className="mt-0.5 block truncate text-[13px] text-[#c9c5bd]">{venue.name}</span> : null}
                </span>
              </button>

              {artists.length || venue ? (
                <div className="-mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {artists.map(artist => (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => navigate(`/tabs/artist/${artist.id}`)}
                      className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 text-center"
                    >
                      <Avatar name={artist.name} src={artist.avatar_url} kind="artist" className="h-[64px] w-[64px] text-xl" />
                      <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-app-ink">{artist.name}</span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-app-accent">Artista</span>
                    </button>
                  ))}
                  {venue ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/tabs/venue/${venue.id}`)}
                      className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 text-center"
                    >
                      <Avatar
                        name={venue.name}
                        src={venue.cover_image_url || (venue.photos || [])[0]}
                        kind="venue"
                        className="h-[64px] w-[64px] text-xl"
                      />
                      <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-app-ink">{venue.name}</span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#a9a59d]">{venue.city || 'Sala'}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="px-4 pt-6">
            <MomentReuseControls postId={post.id} />
          </div>
        </div>
      )}

      <ShareSheet isOpen={showShare} onClose={() => setShowShare(false)} link={shareUrl} />
    </AppShell>
  );
};

export default PostDetail;
