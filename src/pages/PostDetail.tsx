import React, { useEffect, useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useParams, useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PostWithRelations } from '../lib/types';
import AppHeader from '../components/AppHeader';
import { IconHeart, IconShare } from '../components/icons';

const PostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const [post, setPost] = useState<PostWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadPost = async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: postError } = await supabase
          .from('posts')
          .select(
            `
            id,
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
              cover_image_url,
              address,
              venue_place:venue_places!events_venue_place_id_fkey (
                id,
                name,
                city,
                address
              )
            )
          `
          )
          .eq('id', id)
          .single();
        if (postError || !data) {
          throw postError;
        }
        setPost(data as PostWithRelations);
      } catch {
        setError('Post not found.');
        setPost(null);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [id]);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <IonSpinner name="crescent" />
              </div>
            )}

            {!loading && error && <p className="text-sm text-rose-400">{error}</p>}

            {!loading && post && (
              <>
                <div className="app-card overflow-hidden fade-up">
                  {post.media_type === 'video' ? (
                    <video
                      controls
                      playsInline
                      className="h-60 w-full object-cover"
                      poster={post.thumbnail_url || post.events?.cover_image_url || undefined}
                    >
                      <source src={post.media_url} />
                    </video>
                  ) : (
                    <img
                      src={post.media_url}
                      alt={post.caption || 'Moment'}
                      className="h-60 w-full object-cover"
                    />
                  )}
                  <div className="space-y-4 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-800">
                        <img
                          src={post.profiles?.avatar_url || `https://picsum.photos/seed/${post.id}/80/80`}
                          alt={post.profiles?.display_name || post.profiles?.username || 'User'}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-50">
                          {post.profiles?.display_name || post.profiles?.username || 'Anonymous'}
                        </p>
                        <p className="text-xs text-slate-500">
                      {post.events?.venue_place?.city || post.events?.city || 'Unknown'} ·{' '}
                          {new Date(post.created_at).toLocaleString()}
                        </p>
                      </div>
                      {post.events?.name && <span className="app-chip">Live</span>}
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Moment</p>
                      <h2 className="mt-2 font-display text-xl text-slate-50">
                        {post.caption || post.events?.name || 'Live moment'}
                      </h2>
                    </div>
                    <div className="flex gap-3">
                      <button type="button" className="app-button app-button--outline app-button--block">
                        <IconHeart className="app-icon" />
                        Like
                      </button>
                      <button type="button" className="app-button app-button--outline app-button--block">
                        <IconShare className="app-icon" />
                        Share
                      </button>
                    </div>
                  </div>
                </div>

                {post.events && (
                  <button
                    type="button"
                    onClick={() => history.push(`/event/${post.events?.id}`)}
                    className="app-card p-4 fade-up fade-up-delay-1 hover:bg-slate-800 transition-colors text-left"
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Event</p>
                    <h3 className="mt-2 font-display text-lg text-slate-50">{post.events.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {post.events.venue_place?.name || post.events.address || 'Venue TBD'} ·{' '}
                      {new Date(post.events.starts_at).toLocaleString()}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">Tap to view event details →</p>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PostDetail;
