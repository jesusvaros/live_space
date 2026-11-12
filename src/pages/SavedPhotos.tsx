import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import DetailHeader from '../components/ui/DetailHeader';
import { Spinner } from '../components/ui/AppPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { PostWithSetlist } from '../lib/types';
import { withoutBlocked } from '../features/blocks/blocking';
import { useBlockedUserIds } from '../features/blocks/useBlockedUsers';
import type { TimelineMoment } from '../features/moments/concertTimeline';
import { MOMENT_COLUMNS, toTimelineMoment } from '../features/moments/useConcertTimeline';
import PhotoGrid from '../features/photos/PhotoGrid';
import PhotoViewer from '../features/photos/PhotoViewer';
import { usePhotoActions } from '../features/photos/usePhotoActions';

// Perfil → «Guardadas»: the moments you saved (♥, post_likes), newest
// first, a page at a time. Photos open in the viewer; videos in their post.

const PAGE = 30;

const fetchSavedPage = async (userId: string, from: number) => {
  const { data: likes, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE - 1);
  if (error) throw error;
  const ids = (likes || []).map(row => (row as { post_id: string }).post_id);
  if (ids.length === 0) return { items: [] as TimelineMoment[], more: false };
  const { data: posts, error: postsError } = await supabase
    .from('v_event_posts_with_setlist')
    .select(MOMENT_COLUMNS)
    .in('id', ids);
  if (postsError) throw postsError;
  const byId = new Map(((posts || []) as unknown as PostWithSetlist[]).map(post => [post.id, post]));
  // In the order they were saved; gone or no longer visible ones drop out.
  const items = ids
    .map(id => byId.get(id))
    .filter((post): post is PostWithSetlist => Boolean(post))
    .map(post => toTimelineMoment(post));
  return { items, more: ids.length === PAGE };
};

const SavedPhotos: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLElement | null>(null);
  const blocked = useBlockedUserIds();
  const [loaded, setLoaded] = useState<TimelineMoment[]>([]);
  const [next, setNext] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const items = useMemo(() => withoutBlocked(loaded, blocked, item => item.userId), [loaded, blocked]);
  const photos = useMemo(() => items.filter(item => item.mediaType === 'image' && !item.external), [items]);
  const { handlers } = usePhotoActions({
    onDeleted: postId => setLoaded(previous => previous.filter(item => item.id !== postId)),
  });

  const loadPage = useCallback(async (from: number) => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const page = await fetchSavedPage(user.id, from);
      setLoaded(previous => (from === 0 ? page.items : [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))]));
      setNext(from + PAGE);
      setMore(page.more);
    } catch {
      setError('No se han podido cargar tus guardadas.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  const open = (index: number) => {
    const item = items[index];
    if (!item) return;
    if (item.mediaType !== 'image' || item.external) {
      navigate(`/post/${item.id}`);
      return;
    }
    setViewerAt(photos.findIndex(photo => photo.id === item.id));
  };

  return (
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader title="Guardadas" scrollRef={contentRef} fallbackHref="/tabs/profile" />
      <div className="mx-auto flex max-w-lg flex-col px-4 pb-[calc(40px+env(safe-area-inset-bottom,0px))] pt-[calc(72px+env(safe-area-inset-top,0px))]">
        <h1 className="font-display text-2xl font-bold text-app-ink">Guardadas</h1>
        <p className="mb-4 mt-1 text-sm text-white/60">Las fotos y vídeos de conciertos que guardaste con ♥.</p>
        {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}
        <PhotoGrid
          photos={items}
          onOpen={open}
          pageSize={Infinity}
          emptyText={loading ? undefined : 'Aún no has guardado nada. Toca ♥ en una foto de un concierto para tenerla aquí.'}
          {...handlers}
          onHide={undefined}
        />
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : more ? (
          <button
            type="button"
            onClick={() => void loadPage(next)}
            className="mt-3 min-h-11 w-full rounded-full border border-app-line text-sm font-semibold text-app-ink"
          >
            Cargar más
          </button>
        ) : null}
      </div>

      {viewerAt !== null && viewerAt >= 0 ? (
        <PhotoViewer
          photos={photos}
          startIndex={viewerAt}
          albumLabel="Guardadas"
          onClose={() => setViewerAt(null)}
          renderExtra={photo =>
            photo.post?.event_id ? (
              <button
                type="button"
                onClick={() => navigate(`/event/${photo.post!.event_id}`)}
                className="min-h-9 text-[13px] font-bold text-app-accent"
              >
                Ver concierto
              </button>
            ) : null}
          {...handlers}
          onHide={undefined}
        />
      ) : null}
    </AppShell>
  );
};

export default SavedPhotos;
