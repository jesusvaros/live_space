import React, { useMemo, useState } from 'react';
import Avatar from '../../components/ui/Avatar';
import type { TimelineMoment } from '../moments/concertTimeline';
import { ALL_ALBUM_ID, groupPhotoAlbums, photoThumbUrl, type PhotoAlbum } from './photoAlbums';
import PhotoGrid from './PhotoGrid';
import PhotoViewer from './PhotoViewer';
import { usePhotoActions } from './usePhotoActions';

// «Fotos» on the concert page: one album per person plus «Todas», a paged
// grid of the chosen album, and the full-screen viewer. The moments come
// already filtered (blocked people and what this viewer hid are out).

type EventPhotosProps = {
  moments: TimelineMoment[];
  currentUserId: string | null;
  onDeleted: (postId: string) => void;
  // Shown inside a sheet: the viewer opens within it (PhotoViewer inline).
  inSheet?: boolean;
};

const Mosaic: React.FC<{ album: PhotoAlbum }> = ({ album }) => {
  const thumbs = album.photos.slice(0, 4);
  return (
    <span className={`grid h-full w-full gap-0.5 ${thumbs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {thumbs.map((photo, index) => (
        <img
          key={photo.id}
          src={photoThumbUrl(photo, 200)}
          alt=""
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-cover ${thumbs.length === 3 && index === 0 ? 'row-span-2' : ''}`}
        />
      ))}
    </span>
  );
};

const EventPhotos: React.FC<EventPhotosProps> = ({ moments, currentUserId, onDeleted, inSheet = false }) => {
  const albums = useMemo(() => groupPhotoAlbums(moments, currentUserId), [moments, currentUserId]);
  const [albumId, setAlbumId] = useState(ALL_ALBUM_ID);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const { handlers, undo, undoHide } = usePhotoActions({ onDeleted });

  if (albums.length === 0) return null;
  // The chosen album may have emptied (hidden or deleted): back to «Todas».
  const album = albums.find(item => item.id === albumId) ?? albums[0];
  const people = albums.length - 1;

  return (
    <section className="px-4 pt-6" aria-labelledby="event-photos-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="event-photos-title" className="font-display text-xl font-bold text-app-ink">Fotos</h2>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-white/50">
          {albums[0].photos.length} · {people} {people === 1 ? 'persona' : 'personas'}
        </p>
      </div>

      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Álbumes">
        {albums.map(item => {
          const selected = item.id === album.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setAlbumId(item.id)}
              className="flex w-[112px] shrink-0 flex-col gap-1.5 text-left"
            >
              <span
                className={`relative block h-[112px] w-[112px] overflow-hidden rounded-2xl bg-app-surface ${
                  selected ? 'ring-2 ring-app-accent ring-offset-2 ring-offset-app-bg' : ''
                }`}
              >
                <Mosaic album={item} />
                <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                  {item.photos.length}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                {item.id === ALL_ALBUM_ID ? null : (
                  <Avatar name={item.label.replace('@', '')} src={item.avatarUrl} className="h-5 w-5 shrink-0 text-[9px]" />
                )}
                <span className={`min-w-0 truncate text-[13px] font-semibold ${selected ? 'text-app-accent' : 'text-app-ink'}`}>
                  {item.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[12px] text-white/45">Toca una foto para verla en grande. Mantén pulsado para guardarla u ocultarla.</p>
      <div className="mt-2">
        <PhotoGrid key={album.id} photos={album.photos} onOpen={setViewerAt} {...handlers} />
      </div>

      {viewerAt !== null ? (
        <PhotoViewer
          photos={album.photos}
          startIndex={viewerAt}
          albumLabel={album.label}
          onClose={() => setViewerAt(null)}
          inline={inSheet}
          {...handlers}
        />
      ) : null}

      {undo ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-[3100] flex items-center gap-3 rounded-2xl border border-white/15 bg-[#17171b]/95 px-4 py-2.5 shadow-xl backdrop-blur"
        >
          <span className="min-w-0 flex-1 text-sm text-white">Foto oculta. Ya no la verás en este concierto.</span>
          <button type="button" onClick={undoHide} className="min-h-11 shrink-0 px-2 text-sm font-bold text-app-accent">
            Deshacer
          </button>
        </div>
      ) : null}
    </section>
  );
};

export default EventPhotos;
