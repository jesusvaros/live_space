import React, { useRef, useState } from 'react';
import { Modal } from '../../components/ui/AppPrimitives';
import { IconPlay } from '../../components/icons';
import type { TimelineMoment } from '../moments/concertTimeline';
import { photoCredit, photoThumbUrl } from './photoAlbums';
import PhotoActions, { type PhotoActionHandlers } from './PhotoActions';

// A paged grid of photo thumbnails (small Cloudinary copies, lazy). Tap opens
// the viewer; a long press opens the same actions as the viewer in a sheet.

const PAGE = 24;
const LONG_PRESS_MS = 480;

type PhotoGridProps = PhotoActionHandlers & {
  photos: TimelineMoment[];
  onOpen: (index: number) => void;
  emptyText?: string;
  // Thumbnails shown before «Ver más» (the page pages itself: Infinity).
  pageSize?: number;
};

const PhotoGrid: React.FC<PhotoGridProps> = ({ photos, onOpen, emptyText, pageSize = PAGE, ...actions }) => {
  const [shown, setShown] = useState(pageSize);
  const [menuFor, setMenuFor] = useState<TimelineMoment | null>(null);
  const pressRef = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);

  const cancelPress = () => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
  };

  if (photos.length === 0) {
    return emptyText ? <p className="text-sm text-white/55">{emptyText}</p> : null;
  }

  const visible = photos.slice(0, shown);
  return (
    <>
      <ul className="grid grid-cols-3 gap-1">
        {visible.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              aria-label={`Ver foto de ${photoCredit(photo)}`}
              className="relative block aspect-[3/4] w-full select-none overflow-hidden rounded-lg bg-app-surface [-webkit-touch-callout:none]"
              onPointerDown={event => {
                cancelPress();
                const press = { timer: 0, x: event.clientX, y: event.clientY, fired: false };
                press.timer = window.setTimeout(() => {
                  press.fired = true;
                  setMenuFor(photo);
                }, LONG_PRESS_MS);
                pressRef.current = press;
              }}
              onPointerMove={event => {
                const press = pressRef.current;
                if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
              }}
              onPointerUp={cancelPress}
              onPointerCancel={cancelPress}
              onPointerLeave={cancelPress}
              onContextMenu={event => {
                event.preventDefault();
                setMenuFor(photo);
              }}
              onClick={() => {
                if (pressRef.current?.fired) {
                  pressRef.current = null;
                  return;
                }
                onOpen(index);
              }}
            >
              {photoThumbUrl(photo) ? (
                <img
                  src={photoThumbUrl(photo)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : null}
              {photo.mediaType === 'video' ? (
                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                  <IconPlay size={12} />
                </span>
              ) : null}
              {actions.savedIds.has(photo.id) ? (
                <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-app-accent ring-2 ring-black/40" aria-label="Guardada" />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {photos.length > shown ? (
        <button
          type="button"
          onClick={() => setShown(value => value + pageSize)}
          className="mt-3 min-h-11 w-full rounded-full border border-app-line text-sm font-semibold text-app-ink"
        >
          Ver más ({photos.length - shown})
        </button>
      ) : null}

      <Modal isOpen={Boolean(menuFor)} onDidDismiss={() => setMenuFor(null)} initialBreakpoint={0.5} title="Opciones de la foto">
        {menuFor ? (
          <div className="px-4 pb-[calc(18px+env(safe-area-inset-bottom,0px))] pt-4">
            <div className="mb-3 flex items-center gap-3">
              <img src={photoThumbUrl(menuFor, 160)} alt="" className="h-14 w-11 rounded-lg object-cover" />
              <p className="min-w-0 flex-1 truncate font-display text-base font-bold text-app-ink">{photoCredit(menuFor)}</p>
            </div>
            <PhotoActions photo={menuFor} variant="sheet" {...actions} onDone={() => setMenuFor(null)} />
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default PhotoGrid;
