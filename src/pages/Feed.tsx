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

  const stories = [
    { id: 1, name: 'Rooftop Set', seed: 'rooftop' },
    { id: 2, name: 'Indie Night', seed: 'indie' },
    { id: 3, name: 'Jazz Jam', seed: 'jazz' },
    { id: 4, name: 'Synth Club', seed: 'synth' },
    { id: 5, name: 'Street Session', seed: 'street' },
  ];

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
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen">
            <div className="app-hero fade-up">
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
                    Now nearby
                  </p>
                  <h2 className="mt-3 font-display text-3xl text-slate-50">
                    {profile?.primary_city || 'Your city'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">See what is trending tonight</p>
                </div>
                <span className="app-pill">Live</span>
              </div>

              <div className="scroll-row relative z-10 mt-5 flex gap-3 overflow-x-auto pb-1">
                {stories.map(story => (
                  <div
                    key={story.id}
                    className="w-24 shrink-0 text-center fade-up fade-up-delay-1"
                  >
                    <div className="story-ring mx-auto h-16 w-16">
                      <img
                        src={`https://picsum.photos/seed/${story.seed}/80/80`}
                        alt={story.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-slate-400">{story.name}</p>
                  </div>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <IonSpinner name="crescent" />
              </div>
            ) : (
              <div className="space-y-4">
                {error && <p className="text-sm text-rose-400">{error}</p>}
                {posts.map(post => (
                  <button
                    key={post.id}
                    type="button"
                    className="app-card w-full space-y-3 p-4 text-left fade-up fade-up-delay-2"
                    onClick={() => history.push(`/post/${post.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 overflow-hidden rounded-full bg-slate-800">
                        <img
                          src={post.profiles?.avatar_url || `https://picsum.photos/seed/${post.user_id}/80/80`}
                          alt={post.profiles?.display_name || post.profiles?.username || 'User'}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-50">
                          {post.profiles?.display_name || post.profiles?.username || 'Anonymous'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {post.events?.city || 'Unknown'} ·{' '}
                          {post.events?.starts_at
                            ? new Date(post.events.starts_at).toLocaleDateString()
                            : 'Soon'}
                        </p>
                      </div>
                      {post.events?.name && <span className="app-chip">{post.events.name}</span>}
                    </div>
                    <div className="card-media">
                      {post.media_type === 'video' ? (
                        <video
                          controls
                          playsInline
                          className="h-48 w-full object-cover"
                          poster={post.thumbnail_url || post.events?.cover_image_url || undefined}
                        >
                          <source src={post.media_url} />
                        </video>
                      ) : (
                        <img src={post.media_url} alt={post.caption || 'Post'} className="h-48 w-full object-cover" />
                      )}
                    </div>
                    <h3 className="font-display text-lg text-slate-50">
                      {post.caption || post.events?.name || 'Live moment'}
                    </h3>
                  </button>
                ))}
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
