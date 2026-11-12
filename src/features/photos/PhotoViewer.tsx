import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReportMomentButton } from '../community';
import type { TimelineMoment } from '../moments/concertTimeline';
import { neighbourIndexes, photoCredit, photoFullUrl, photoThumbUrl } from './photoAlbums';
import PhotoActions, { type PhotoActionHandlers } from './PhotoActions';

// Full-screen photo viewer: swipe sideways through the album (native scroll
// snap), pinch or double-tap to zoom, drag down or X to close. Only the
// photo on screen and its neighbours are mounted; each shows its small
// thumbnail at once and the screen-sized copy when it arrives.

type PhotoViewerProps = PhotoActionHandlers & {
  photos: TimelineMoment[];
  startIndex: number;
  albumLabel?: string;
  onClose: () => void;
  // Extra link under the credit (e.g. «Ver concierto» in Guardadas).
  renderExtra?: (photo: TimelineMoment) => React.ReactNode;
};

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const DISMISS_PX = 120;

const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

type ZoomableProps = {
  photo: TimelineMoment;
  eager: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onDrag: (dy: number) => void;
  onDragEnd: (dy: number) => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const ZoomablePhoto: React.FC<ZoomableProps> = ({ photo, eager, onZoomChange, onDrag, onDragEnd }) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; scale: number; midX: number; midY: number; x: number; y: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; dy: number; vertical: boolean | null } | null>(null);
  const lastTap = useRef(0);
  const zoomedRef = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const apply = useCallback((next: { scale: number; x: number; y: number }) => {
    const frame = frameRef.current;
    const width = frame?.clientWidth ?? 0;
    const height = frame?.clientHeight ?? 0;
    const scale = clamp(next.scale, 1, MAX_SCALE);
    // Never pan past the photo's frame.
    const x = clamp(next.x, width - width * scale, 0);
    const y = clamp(next.y, height - height * scale, 0);
    view.current = { scale, x, y };
    if (layerRef.current) layerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    const isZoomed = scale > 1.01;
    if (zoomedRef.current !== isZoomed) {
      zoomedRef.current = isZoomed;
      setZoomed(isZoomed);
      onZoomChange(isZoomed);
    }
  }, [onZoomChange]);

  const local = (event: React.PointerEvent) => {
    const rect = frameRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: view.current.scale,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        x: view.current.x,
        y: view.current.y,
      };
      drag.current = null;
    } else if (pointers.current.size === 1) {
      const point = local(event);
      drag.current = { startX: point.x, startY: point.y, dy: 0, vertical: null };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    const previous = pointers.current.get(event.pointerId)!;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const start = gesture.current;
      const scale = clamp((start.scale * Math.hypot(a.x - b.x, a.y - b.y)) / start.dist, 1, MAX_SCALE);
      const ratio = scale / start.scale;
      apply({ scale, x: start.midX - (start.midX - start.x) * ratio, y: start.midY - (start.midY - start.y) * ratio });
      return;
    }
    if (view.current.scale > 1.01) {
      apply({ ...view.current, x: view.current.x + point.x - previous.x, y: view.current.y + point.y - previous.y });
      return;
    }
    const current = drag.current;
    if (!current) return;
    const dx = point.x - current.startX;
    const dy = point.y - current.startY;
    if (current.vertical === null && Math.hypot(dx, dy) > 8) current.vertical = Math.abs(dy) > Math.abs(dx);
    if (current.vertical) {
      current.dy = Math.max(0, dy);
      onDrag(current.dy);
    }
  };

  const onPointerEnd = (event: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    const current = drag.current;
    if (wasSingle && current) {
      drag.current = null;
      if (current.vertical) {
        onDragEnd(current.dy);
        return;
      }
      if (event.type !== 'pointerup' || current.vertical !== null) return;
      // A tap: two in a row zoom in at that point, or back out.
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        const point = local(event);
        if (view.current.scale > 1.01) apply({ scale: 1, x: 0, y: 0 });
        else apply({ scale: DOUBLE_TAP_SCALE, x: point.x - point.x * DOUBLE_TAP_SCALE, y: point.y - point.y * DOUBLE_TAP_SCALE });
      } else {
        lastTap.current = now;
      }
    }
  };

  return (
    <div
      ref={frameRef}
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: zoomed ? 'none' : 'pan-x' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div ref={layerRef} className="absolute inset-0 origin-top-left will-change-transform">
        <img
          src={photoThumbUrl(photo)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-contain"
        />
        <img
          src={photoFullUrl(photo)}
          alt={`Foto de ${photoCredit(photo)}`}
          draggable={false}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
    </div>
  );
};

const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photos,
  startIndex,
  albumLabel,
  onClose,
  renderExtra,
  ...actions
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(() => clamp(startIndex, 0, Math.max(0, photos.length - 1)));
  const [zoomed, setZoomed] = useState(false);
  const photo = photos[index] ?? null;
  const currentIdRef = useRef<string | null>(photo?.id ?? null);

  // Opens on the chosen photo.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollLeft = index * scroller.clientWidth;
    // Only on open.
  }, []);

  // The list changed under us (a photo hidden or deleted): stay on the same
  // photo if it is still there, else on the one that took its place.
  useEffect(() => {
    if (photos.length === 0) {
      onClose();
      return;
    }
    const keep = currentIdRef.current ? photos.findIndex(item => item.id === currentIdRef.current) : -1;
    const next = keep >= 0 ? keep : clamp(index, 0, photos.length - 1);
    if (next !== index) setIndex(next);
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollLeft = next * scroller.clientWidth;
    currentIdRef.current = photos[next]?.id ?? null;
  }, [photos]);

  useEffect(() => {
    currentIdRef.current = photo?.id ?? null;
  }, [photo?.id]);

  // Escape closes; the arrows move (desktop / keyboard).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const scroller = scrollerRef.current;
      if (event.key === 'Escape') onClose();
      if (!scroller) return;
      if (event.key === 'ArrowRight') scroller.scrollBy({ left: scroller.clientWidth, behavior: 'smooth' });
      if (event.key === 'ArrowLeft') scroller.scrollBy({ left: -scroller.clientWidth, behavior: 'smooth' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller || !scroller.clientWidth) return;
    const next = clamp(Math.round(scroller.scrollLeft / scroller.clientWidth), 0, photos.length - 1);
    if (next !== index) setIndex(next);
  };

  const onDrag = useCallback((dy: number) => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.style.transform = `translateY(${dy}px)`;
    shell.style.opacity = String(Math.max(0.35, 1 - dy / 500));
  }, []);

  const onDragEnd = useCallback((dy: number) => {
    const shell = shellRef.current;
    if (dy > DISMISS_PX) {
      onClose();
      return;
    }
    if (shell) {
      shell.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
      shell.style.transform = '';
      shell.style.opacity = '';
      window.setTimeout(() => {
        if (shell) shell.style.transition = '';
      }, 180);
    }
  }, [onClose]);

  const mounted = new Set(neighbourIndexes(index, photos.length, 1));

  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black" role="dialog" aria-modal="true" aria-label={albumLabel ? `Fotos: ${albumLabel}` : 'Fotos'}>
      <div ref={shellRef} className="absolute inset-0">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className={`flex h-full w-full snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            zoomed ? 'overflow-hidden' : 'overflow-x-auto'
          }`}
        >
          {photos.map((item, itemIndex) => (
            <div key={item.id} className="h-full w-full shrink-0 snap-center snap-always">
              {mounted.has(itemIndex) ? (
                <ZoomablePhoto
                  photo={item}
                  eager={Math.abs(itemIndex - index) <= 1}
                  onZoomChange={setZoomed}
                  onDrag={onDrag}
                  onDragEnd={onDragEnd}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Top: credit and close */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[calc(12px+env(safe-area-inset-top,0px))]">
        <div className="min-w-0 flex-1">
          {photo ? <p className="truncate font-display text-[17px] font-bold text-white">{photoCredit(photo)}</p> : null}
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60">
            {albumLabel ? `${albumLabel} · ` : ''}
            {index + 1} / {photos.length}
          </p>
          {photo && renderExtra ? <div className="pointer-events-auto mt-1">{renderExtra(photo)}</div> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Bottom: actions */}
      {photo ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 to-transparent px-4 pb-[calc(14px+env(safe-area-inset-bottom,0px))] pt-10">
          <PhotoActions photo={photo} variant="bar" {...actions} />
          <ReportMomentButton
            postId={photo.id}
            authorId={photo.userId}
            authorLabel={photo.userName ? `@${photo.userName}` : undefined}
            variant="round"
          />
        </div>
      ) : null}
    </div>,
    document.body,
  );
};

export default PhotoViewer;
