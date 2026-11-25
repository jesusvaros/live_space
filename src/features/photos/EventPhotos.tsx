import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  // With no photos yet: an invitation to upload them (concert has started).
  onUpload?: () => void;
  // Under the stage's «Fotos» tab: the tab already says it, the heading is for screen readers only.
  hideTitle?: boolean;
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

const EventPhotos: React.FC<EventPhotosProps> = ({ moments, currentUserId, onDeleted, inSheet = false, onUpload, hideTitle = false }) => {
  const navigate = useNavigate();
  const albums = useMemo(() => groupPhotoAlbums(moments, currentUserId), [moments, currentUserId]);
  const [albumId, setAlbumId] = useState(ALL_ALBUM_ID);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const { handlers, undo, undoHide } = usePhotoActions({ onDeleted });

  if (albums.length === 0) {
    if (!onUpload) return null;
    return (
      <section className="px-4 pt-6" aria-labelledby="event-photos-title">
        <h2 id="event-photos-title" className={hideTitle ? 'sr-only' : 'font-display text-xl font-bold text-app-ink'}>Fotos</h2>
        <div className="mt-2 rounded-2xl border border-dashed border-app-line px-4 py-5 text-center">
          <p className="m-0 text-sm text-[#c9c5bd]">Aún no hay fotos de este concierto. Cada persona que suba las suyas tendrá aquí su álbum.</p>
          <button
            type="button"
            onClick={onUpload}
            className="mt-3 min-h-11 rounded-full bg-app-accent px-5 text-sm font-bold text-[#14151a]"
          >
            Subir mis fotos
          </button>
        </div>
      </section>
    );
  }
  // The chosen album may have emptied (hidden or deleted): back to «Todas».
  const album = albums.find(item => item.id === albumId) ?? albums[0];
  const people = albums.length - 1;

  return (
    <section className="px-4 pt-6" aria-labelledby="event-photos-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="event-photos-title" className={hideTitle ? 'sr-only' : 'font-display text-xl font-bold text-app-ink'}>Fotos</h2>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-white/50">
          {albums[0].photos.length} · {people} {people === 1 ? 'persona' : 'personas'}
        </p>
      </div>

      {/* pt-1/pb-1: the selected album's ring (2px + 2px offset) sits outside
          the tile, and a scrolling row clips it on every side. */}
      <div className="-mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none]" role="tablist" aria-label="Álbumes">
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

      {album.id !== ALL_ALBUM_ID ? (
        // A person's album: who took them, with a way to their profile, so a
        // photographer's album reads as theirs.
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3 py-2.5">
          <Avatar name={album.label.replace('@', '')} src={album.avatarUrl} className="h-10 w-10 shrink-0 text-[14px]" />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[15px] font-bold text-app-ink">{album.isMe ? 'Tus fotos' : `Fotos de ${album.label}`}</p>
            <p className="m-0 font-mono text-[11px] uppercase tracking-[0.06em] text-white/50">
              {album.photos.length} {album.photos.length === 1 ? 'foto' : 'fotos'}
            </p>
          </div>
          {album.isMe ? null : (
            <button
              type="button"
              onClick={() => navigate(`/profile/${album.id}`)}
              className="min-h-10 shrink-0 rounded-full border border-app-line px-3.5 text-[13px] font-semibold text-app-ink"
            >
              Ver perfil
            </button>
          )}
        </div>
      ) : null}
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
