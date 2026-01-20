import React, { useEffect, useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useParams, useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithRelations, VenuePlace } from '../lib/types';
import AppHeader from '../components/AppHeader';
import { IconHeart, IconShare } from '../components/icons';

const PostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const [post, setPost] = useState<PostWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  type EventWithVenue = Event & { venue_place?: VenuePlace | null };
  const event = (post?.events as EventWithVenue | null | undefined) ?? null;

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
        setPost(data as unknown as PostWithRelations);
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
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <IonSpinner name="crescent" />
              </div>
            )}

            {!loading && error && <p className="text-sm text-rose-400">{error}</p>}

            {!loading && post && (
              <>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
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
                          {event?.venue_place?.city || event?.city || 'Unknown'} ·{' '}
                          {new Date(post.created_at).toLocaleString()}
                        </p>
                      </div>
                      {event?.name && (
                        <span className="rounded-full border border-[#ff6b4a]/40 bg-[#ff6b4a]/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ffd1c4]">
                          Live
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Moment</p>
                      <h2 className="mt-2 font-display text-xl text-slate-50">
                        {post.caption || event?.name || 'Live moment'}
                      </h2>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#ff6b4a]/40 px-4 py-2 text-sm font-semibold text-[#ffd1c4]"
                      >
                        <IconHeart className="h-4 w-4" />
                        Like
                      </button>
                      <button
                        type="button"
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#ff6b4a]/40 px-4 py-2 text-sm font-semibold text-[#ffd1c4]"
                      >
                        <IconShare className="h-4 w-4" />
                        Share
                      </button>
                    </div>
                  </div>
                </div>

                {event && (
                  <button
                    type="button"
                    onClick={() => history.push(`/event/${event.id}`)}
                    className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 text-left shadow-[0_24px_50px_rgba(0,0,0,0.45)] transition-colors hover:bg-slate-900"
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Event</p>
                    <h3 className="mt-2 font-display text-lg text-slate-50">{event.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {event.venue_place?.name || event.address || 'Venue TBD'} ·{' '}
                      {new Date(event.starts_at).toLocaleString()}
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
