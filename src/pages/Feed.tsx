import React, { useEffect, useRef, useState } from 'react';
import { 
  IonPage, 
  IonContent,
  IonSpinner
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PostWithRelations } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';

const PAGE_SIZE = 6;

const Feed: React.FC = () => {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const history = useHistory();

  const loadPosts = async (nextPage: number, replace = false) => {
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('posts')
      .select(
        `
        id,
        user_id,
        event_id,
        media_url,
        media_type,
        thumbnail_url,
        caption,
        created_at,
        profiles:profiles!posts_user_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        ),
        events:events!posts_event_id_fkey (
          id,
          name,
          city,
          starts_at,
          cover_image_url
        )
        `
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    if (data) {
      setPosts(prev => (replace ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError('');
      try {
        await loadPosts(0, true);
      } catch (err) {
        setHasMore(false);
        setError('Could not load the feed. Check your Supabase connection.');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!loading && posts.length === 0) {
      setError('');
      setHasMore(true);
      setPage(0);
      loadPosts(0, true).catch(() => {
        setHasMore(false);
        setError('Could not load the feed. Check your Supabase connection.');
      });
    }
  }, [loading, posts.length]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      await loadPosts(nextPage);
      setPage(nextPage);
    } catch (err) {
      setHasMore(false);
      setError('Could not load more posts.');
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
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page]);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-6 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            <header className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Moments</p>
              <h2 className="font-display text-3xl font-bold text-white">
                {profile?.primary_city ? `Tonight in ${profile.primary_city}` : 'Tonight'}
              </h2>
              <p className="text-sm text-white/55">Relive what people lived.</p>
            </header>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <IonSpinner name="crescent" />
              </div>
            ) : (
              <div className="space-y-4">
                {error && <p className="text-sm text-rose-400">{error}</p>}
                {posts.map(post => {
                  const username =
                    (post.profiles as any)?.username
                      ? `@${(post.profiles as any).username}`
                      : (post.profiles as any)?.display_name || 'Anonymous';
                  const title = post.caption || post.events?.name || 'Relive the moment';
                  const subtitle = `${post.events?.city || 'Unknown'} · ${new Date(post.created_at).toLocaleDateString()}`;
                  const poster = post.thumbnail_url || post.events?.cover_image_url || null;
                  return (
                    <button
                      key={post.id}
                      type="button"
                      className="-mx-4 block w-[calc(100%+2rem)] text-left"
                      onClick={() => history.push(`/post/${post.id}`)}
                    >
                      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
                        {post.media_type === 'image' ? (
                          <img src={post.media_url} alt={title} className="absolute inset-0 h-full w-full object-cover" />
                        ) : poster ? (
                          <img src={poster} alt={title} className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <video muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover">
                            <source src={post.media_url} />
                          </video>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">
                            {username}
                          </p>
                          <h3 className="mt-2 font-display text-2xl font-bold text-white line-clamp-2">{title}</h3>
                          <p className="mt-2 text-sm text-white/70">{subtitle}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {hasMore && (
              <div ref={loadMoreRef} className="flex items-center justify-center py-6">
                {loadingMore && <IonSpinner name="crescent" />}
              </div>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Feed;
