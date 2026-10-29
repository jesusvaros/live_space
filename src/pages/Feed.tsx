import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/AppPrimitives';
import { PostWithRelations, VenuePlace } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useAppResume } from '../shared/hooks/useAppResume';
import { supabase } from '../lib/supabase';
import { fetchPostCards } from '../data/postQueries';
import { ExternalMomentCard, isExternalPost } from '../features/socialImport';
import { ReportMomentButton } from '../features/community';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { useFollowedEntities } from '../hooks/useFollowedEntities';
import ShareSheet from '../components/ShareSheet';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { IconHeart, IconHeartFilled, IconPlus, IconShare } from '../components/icons';

const PAGE_SIZE = 8;
const MAX_BARS = 8;

type FeedScope = 'city' | 'following';
type FeedPost = PostWithRelations & { events?: (PostWithRelations['events'] & { venue_place?: VenuePlace | null }) | null };

const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();

const whenLabel = (iso: string | null | undefined) => {
  if (!iso) return '';
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return 'esta noche';
  if (sameDay(date, yesterday)) return 'anoche';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
};

const MusicNote = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

// Event ids of what the user follows: concerts of followed artists and at followed venues.
const fetchFollowedEventIds = async (artistIds: string[], venueIds: string[]) => {
  const [byArtist, byVenue] = await Promise.all([
    artistIds.length
      ? supabase.from('event_artists').select('event_id').in('artist_id', artistIds).limit(500)
      : Promise.resolve({ data: [] as { event_id: string }[], error: null }),
    venueIds.length
      ? supabase.from('events').select('id').in('venue_place_id', venueIds).limit(500)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);
  if (byArtist.error) throw byArtist.error;
  if (byVenue.error) throw byVenue.error;
  return Array.from(
    new Set([
      ...((byArtist.data || []) as { event_id: string }[]).map(row => row.event_id),
      ...((byVenue.data || []) as { id: string }[]).map(row => row.id),
    ]),
  );
};

type SlideProps = {
  post: FeedPost;
  songNumber: number | null;
  group: { index: number; size: number };
  liked: boolean;
  onLike: () => void;
  onShare: () => void;
};

// One moment per screen. Videos play only while on screen.
const MomentSlide: React.FC<SlideProps> = ({ post, songNumber, group, liked, onLike, onShare }) => {
  const ref = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const event = post.events || null;
  const venue = event?.venue_place?.name || event?.city || '';
  const title = event?.name || 'Concierto';
  const poster = post.thumbnail_url || event?.cover_image_url || undefined;

  useEffect(() => {
    const node = ref.current;
    const video = videoRef.current;
    if (!node || !video || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <article ref={ref} className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-black">
      {isExternalPost(post) ? (
        <ExternalMomentCard post={post} variant="media" />
      ) : post.media_type === 'video' ? (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={post.media_url} />
        </video>
      ) : post.media_url ? (
        <img src={post.media_url} alt={post.caption || `Momento de ${title}`} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <GeneratedPoster title={title} variant="hero" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.55),rgba(0,0,0,0)_22%,rgba(0,0,0,0)_50%,rgba(0,0,0,0.9)_88%)]" />

      <div className="absolute bottom-[calc(200px+env(safe-area-inset-bottom,0px))] right-3 flex flex-col items-center gap-3.5">
        <button
          type="button"
          aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
          aria-pressed={liked}
          onClick={onLike}
          className={`flex h-12 w-12 items-center justify-center rounded-full bg-black/40 ${liked ? 'text-app-accent' : 'text-app-ink'}`}
        >
          {liked ? <IconHeartFilled size={24} /> : <IconHeart size={24} />}
        </button>
        <button
          type="button"
          aria-label="Compartir"
          onClick={onShare}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-app-ink"
        >
          <IconShare size={22} />
        </button>
        {isExternalPost(post) ? null : <ReportMomentButton postId={post.id} authorId={post.user_id} variant="round" />}
      </div>

      <div className="absolute bottom-[calc(84px+env(safe-area-inset-bottom,0px))] left-4 right-[76px] flex flex-col gap-2">
        {post.song_title ? (
          <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-app-accent px-2.5 py-1.5 font-mono text-[12px] font-semibold text-[#14151a]">
            <MusicNote />
            <span className="truncate">
              {songNumber ? `Canción ${songNumber} · ` : ''}
              {post.song_title}
            </span>
          </span>
        ) : null}
        <Link to={`/event/${post.event_id}`} className="text-app-ink">
          <h2 className="m-0 font-poster text-[40px] leading-[0.9] line-clamp-2">{title}</h2>
        </Link>
        <p className="m-0 text-sm text-[#e4e0d8]">
          {[venue, whenLabel(post.captured_at || event?.starts_at || post.created_at)].filter(Boolean).join(' · ')}
        </p>
        {group.size > 1 ? (
          <div className="mt-1 flex gap-1" aria-label={`Momento ${group.index + 1} de ${group.size}`}>
            {Array.from({ length: Math.min(group.size, MAX_BARS) }, (_, index) => {
              const at = Math.min(group.index, MAX_BARS - 1);
              return (
                <span
                  key={index}
                  className={`h-[3px] flex-1 rounded-sm ${
                    index < at ? 'bg-app-ink' : index === at ? 'bg-app-accent' : 'bg-white/30'
                  }`}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </article>
  );
};

const Feed: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const resumeTick = useAppResume();
  const city = profile?.primary_city || 'Madrid';
  const [scope, setScope] = useState<FeedScope>('city');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [songNumbers, setSongNumbers] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [shareId, setShareId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const { followedSubjectIds } = useFollowedSubjects();
  const { entities, loading: entitiesLoading } = useFollowedEntities(followedSubjectIds);
  const followedKey = useMemo(() => entities.map(entity => entity.id).sort().join(','), [entities]);
  const followedEventIdsRef = useRef<string[] | null>(null);

  const fetchPage = useCallback(
    async (nextPage: number): Promise<FeedPost[]> => {
      const from = nextPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      if (scope === 'following') {
        if (!followedEventIdsRef.current) {
          followedEventIdsRef.current = await fetchFollowedEventIds(
            entities.filter(entity => entity.kind === 'artist').map(entity => entity.id),
            entities.filter(entity => entity.kind === 'venue').map(entity => entity.id),
          );
        }
        if (followedEventIdsRef.current.length === 0) return [];
        return (await fetchPostCards({ from, to, eventIds: followedEventIdsRef.current })) as FeedPost[];
      }
      let query = supabase.from('v_post_cards').select('*').ilike('events->>city', city);
      query = query.order('created_at', { ascending: false }).range(from, to);
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      return (data || []) as unknown as FeedPost[];
    },
    [city, entities, scope],
  );

  useEffect(() => {
    if (scope === 'following' && entitiesLoading) return;
    let cancelled = false;
    followedEventIdsRef.current = null;
    setLoading(true);
    setError('');
    setPage(0);
    fetchPage(0)
      .then(data => {
        if (cancelled) return;
        setPosts(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch(() => {
        if (cancelled) return;
        setPosts([]);
        setHasMore(false);
        setError('No se pudieron cargar los momentos. Revisa tu conexión.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, city, followedKey, entitiesLoading, resumeTick]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const data = await fetchPage(nextPage);
      setPosts(prev => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setPage(nextPage);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) handleLoadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, posts.length]);

  // "Canción N": the song's position in that concert's setlist.
  useEffect(() => {
    const eventIds = Array.from(new Set(posts.filter(post => post.song_id).map(post => post.event_id)));
    const missing = eventIds.filter(eventId => !(`${eventId}:` in songNumbers));
    if (missing.length === 0) return;
    let cancelled = false;
    supabase
      .from('event_setlist_items')
      .select('event_id,song_id,position')
      .in('event_id', missing)
      .then(({ data }) => {
        if (cancelled) return;
        setSongNumbers(prev => {
          const next = { ...prev };
          missing.forEach(eventId => {
            next[`${eventId}:`] = 0;
          });
          (data || []).forEach((row: any) => {
            if (row.song_id) next[`${row.event_id}:${row.song_id}`] = row.position;
          });
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [posts]);

  useEffect(() => {
    if (!user || posts.length === 0) return;
    let cancelled = false;
    supabase
      .from('post_likes')
      .select('post_id')
      .eq('profile_id', user.id)
      .in('post_id', posts.map(post => post.id))
      .then(({ data }) => {
        if (cancelled) return;
        setLikedIds(new Set((data || []).map((row: any) => row.post_id as string)));
      });
    return () => {
      cancelled = true;
    };
  }, [posts, user]);

  const toggleLike = async (postId: string) => {
    if (!user) {
      navigate('/welcome');
      return;
    }
    const wasLiked = likedIds.has(postId);
    const apply = (liked: boolean) =>
      setLikedIds(prev => {
        const next = new Set(prev);
        if (liked) next.add(postId);
        else next.delete(postId);
        return next;
      });
    apply(!wasLiked);
    const { error: likeError } = wasLiked
      ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('profile_id', user.id)
      : await supabase.from('post_likes').insert({ post_id: postId, profile_id: user.id });
    if (likeError) apply(wasLiked);
  };

  // Progress bars: the moments of the same song (or concert) next to each other.
  const groups = useMemo(() => {
    const keyOf = (post: FeedPost) => `${post.event_id}:${post.song_id || ''}`;
    const counts = new Map<string, number>();
    return posts.map(post => {
      const key = keyOf(post);
      const index = counts.get(key) || 0;
      counts.set(key, index + 1);
      return { key, index };
    }).map(entry => ({ index: entry.index, size: counts.get(entry.key) || 1 }));
  }, [posts]);

  const scopeButton = (value: FeedScope, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={scope === value}
      onClick={() => setScope(value)}
      className={`min-h-[38px] rounded-full px-3.5 text-[13px] font-semibold ${
        scope === value ? 'bg-app-ink text-app-bg' : 'border border-white/25 bg-black/35 text-app-ink'
      }`}
    >
      {label}
    </button>
  );

  const emptyFollowing = scope === 'following' && (!user || entities.length === 0);

  return (
    <div className="relative h-full bg-black">
      <div className="pointer-events-none absolute inset-x-4 top-[calc(14px+env(safe-area-inset-top,0px))] z-20 flex items-center justify-between">
        <div role="tablist" aria-label="Qué momentos ver" className="pointer-events-auto flex gap-1.5">
          {scopeButton('city', city)}
          {scopeButton('following', 'Siguiendo')}
        </div>
        <button
          type="button"
          aria-label="Subir un momento"
          onClick={() => navigate('/tabs/upload')}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-app-accent text-[#14151a]"
        >
          <IconPlus size={22} />
        </button>
      </div>

      {loading ? (
        <div className="flex h-full items-center justify-center text-white">
          <Spinner />
        </div>
      ) : posts.length === 0 ? (
        <div className="relative h-full overflow-hidden">
          <img src="/fotos/manos-luz-azul.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-app-bg via-app-bg/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] flex flex-col gap-3 p-5">
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            <h3 className="font-poster text-[44px] leading-[0.9] text-app-ink">
              {emptyFollowing ? 'Aún no sigues a nadie.' : 'Aún no hay momentos.'}
              <br />
              <span className="text-app-accent">{emptyFollowing ? 'Empieza por uno.' : 'Sé el primero.'}</span>
            </h3>
            <p className="max-w-xs text-sm text-white/70">
              {emptyFollowing
                ? 'Sigue artistas y salas y aquí verás lo que graba el público en sus conciertos.'
                : 'Graba en tu próximo concierto y súbelo: aparecerá aquí, en su canción.'}
            </p>
            <div className="flex flex-wrap gap-3">
              {emptyFollowing ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-app-accent px-5 text-sm font-semibold text-[#14151a]"
                  onClick={() => navigate('/tabs/discover')}
                >
                  Explorar
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="min-h-11 rounded-full bg-app-accent px-5 text-sm font-semibold text-[#14151a]"
                    onClick={() => navigate('/tabs/upload')}
                  >
                    Subir un momento
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white/90"
                    onClick={() => navigate('/tabs/events')}
                  >
                    Ver conciertos
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain" data-scroll>
          {posts.map((post, index) => (
            <MomentSlide
              key={post.id}
              post={post}
              songNumber={post.song_id ? songNumbers[`${post.event_id}:${post.song_id}`] || null : null}
              group={groups[index]}
              liked={likedIds.has(post.id)}
              onLike={() => toggleLike(post.id)}
              onShare={() => setShareId(post.id)}
            />
          ))}
          {hasMore ? (
            <div ref={loadMoreRef} className="flex h-24 items-center justify-center text-white">
              {loadingMore ? <Spinner /> : null}
            </div>
          ) : null}
        </div>
      )}

      <ShareSheet
        isOpen={Boolean(shareId)}
        onClose={() => setShareId(null)}
        link={shareId ? `${window.location.origin}/post/${shareId}` : ''}
      />
    </div>
  );
};

export default Feed;
