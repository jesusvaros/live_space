import React, { useEffect, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { useParams, useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithRelations, VenuePlace } from '../lib/types';
import AppShell from '../components/AppShell';
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
    <AppShell>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <IonSpinner name="crescent" />
        </div>
      )}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && post && (
        <>
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
            {post.media_type === 'video' ? (
              <video
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
                poster={post.thumbnail_url || post.events?.cover_image_url || undefined}
              >
                <source src={post.media_url} />
              </video>
            ) : (
              <img src={post.media_url} alt={post.caption || 'Moment'} className="absolute inset-0 h-full w-full object-cover" />
            )}

            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Moment</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">
                {post.caption || 'Relive the moment'}
              </h2>
              <p className="mt-2 text-sm text-white/70">
                {(post.profiles?.username ? `@${post.profiles.username}` : post.profiles?.display_name) || 'Anonymous'}
                {' · '}
                {new Date(post.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex flex-1 items-center justify-center gap-2 bg-white/10 px-4 py-3 text-sm font-semibold text-white"
              >
                <IconHeart className="h-4 w-4" />
                Like
              </button>
              <button
                type="button"
                className="inline-flex flex-1 items-center justify-center gap-2 bg-white/10 px-4 py-3 text-sm font-semibold text-white"
              >
                <IconShare className="h-4 w-4" />
                Share
              </button>
            </div>

            {event && (
              <button
                type="button"
                onClick={() => history.push(`/event/${event.id}`)}
                className="bg-white/5 p-4 text-left"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Event</p>
                <p className="mt-2 font-display text-lg font-bold text-white">{event.name}</p>
                <p className="mt-1 text-sm text-white/70">
                  {event.venue_place?.name || event.address || 'Venue'} · {new Date(event.starts_at).toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-white/55">View event details</p>
              </button>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
};

export default PostDetail;
