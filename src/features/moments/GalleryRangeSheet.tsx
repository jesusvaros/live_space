import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Spinner } from '../../components/ui/AppPrimitives';
import Button from '../../components/ui/Button';
import { IconPlay } from '../../components/icons';
import { findMedia, type GalleryAsset } from '../../media/native/gallery';
import { concertGalleryRange, groupByDay, preselectedIds, validZone, type ConcertDates } from './galleryRange';

// The uploader's own gallery when it already knows the concert and may read
// the camera roll: only the photos and videos from the day before to the day
// after, by day, with the ones taken during the concert already ticked. It
// never asks for gallery access; the uploader only opens it once granted.

// Plenty for three days; the scan stops there.
const SCAN_LIMIT = 600;

type Props = {
  isOpen: boolean;
  concert: ConcertDates;
  // Asset ids already in the uploader: they open ticked instead of the
  // concert-time preselection.
  alreadyAdded: string[];
  // iOS «Seleccionar fotos…» / Android partial access.
  limited: boolean;
  onClose: () => void;
  onConfirm: (assets: GalleryAsset[]) => void;
  // Opens the system picker. Called inside the tap so the WebView allows it.
  onOpenFullGallery: () => void;
};

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; assets: GalleryAsset[] };

// In the concert's zone, like the day headers.
const timeLabel = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone });

const durationLabel = (seconds: number | null) => {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const GalleryRangeSheet: React.FC<Props> = ({
  isOpen,
  concert,
  alreadyAdded,
  limited,
  onClose,
  onConfirm,
  onOpenFullGallery,
}) => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { startsAt, endsAt, timeZone } = concert;
  const zone = validZone(timeZone);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    const range = concertGalleryRange({ startsAt, endsAt, timeZone });
    findMedia({ from: range.from, to: range.to, limit: SCAN_LIMIT })
      .then(assets => {
        if (cancelled) return;
        setState({ kind: 'ready', assets });
        setSelected(
          alreadyAdded.length
            ? new Set(alreadyAdded.filter(id => assets.some(asset => asset.id === id)))
            : preselectedIds(assets, { startsAt, endsAt }),
        );
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // alreadyAdded is read once per opening on purpose.
  }, [isOpen, startsAt, endsAt, timeZone]);

  const days = useMemo(
    () => (state.kind === 'ready' ? groupByDay(state.assets, { startsAt, endsAt, timeZone }) : []),
    [state, startsAt, endsAt, timeZone],
  );

  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () => {
    if (state.kind !== 'ready') return;
    onConfirm(state.assets.filter(asset => selected.has(asset.id)));
  };

  const count = selected.size;
  const empty = state.kind === 'ready' && state.assets.length === 0;

  return (
    <Modal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.95} title="Fotos y vídeos del concierto">
      <div className="flex h-[88dvh] max-h-[90dvh] flex-col">
        <div className="px-4 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <h3 className="font-display text-lg font-bold text-app-ink">Tus fotos y vídeos de esos días</h3>
          <p className="mt-0.5 text-[13px] text-[#c9c5bd]">
            Del día antes al día después del concierto. Ya marcamos los de la hora del concierto.
          </p>
          {limited ? (
            <p className="mt-1 text-[13px] text-[#8f8b84]">
              Solo vemos las fotos que nos dejaste ver. Amplía la selección en Ajustes si falta alguna.
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4">
          {state.kind === 'loading' ? (
            <div className="flex flex-col items-center gap-3 py-16 text-app-muted">
              <Spinner />
              <p className="text-sm">Buscando en tu galería…</p>
            </div>
          ) : null}

          {state.kind === 'error' ? (
            <p className="py-16 text-center text-sm text-app-muted">No hemos podido leer tu galería.</p>
          ) : null}

          {empty ? (
            <div className="py-16 text-center">
              <p className="font-display text-base font-bold text-app-ink">No hay fotos ni vídeos de esos días</p>
              <p className="mt-1 text-sm text-app-muted">Búscalos en toda tu galería.</p>
            </div>
          ) : null}

          {days.map(day => (
            <section key={day.key} className="mt-4">
              <h4
                className={`sticky top-0 z-10 bg-app-bg/95 py-1.5 font-display text-sm font-bold backdrop-blur ${
                  day.concertDay ? 'text-app-accent' : 'text-app-ink'
                }`}
              >
                {day.label}
              </h4>
              <ul className="mt-1 grid grid-cols-3 gap-1.5">
                {day.assets.map(asset => {
                  const isSelected = selected.has(asset.id);
                  const isVideo = asset.kind === 'video';
                  const length = isVideo ? durationLabel(asset.durationSec) : null;
                  const label = `${isVideo ? 'Vídeo' : 'Foto'} de las ${timeLabel(asset.createdAt, zone)}`;
                  return (
                    <li key={asset.id}>
                      <button
                        type="button"
                        onClick={() => toggle(asset.id)}
                        aria-pressed={isSelected}
                        aria-label={label}
                        className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-app-surface transition ${
                          isSelected ? 'border-app-accent' : 'border-transparent'
                        }`}
                      >
                        {asset.thumbnailUri ? (
                          <img
                            src={asset.thumbnailUri}
                            alt=""
                            loading="lazy"
                            className={`h-full w-full object-cover ${isSelected ? '' : 'opacity-70'}`}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-white/50">
                            {isVideo ? <IconPlay size={20} /> : <span className="text-xs">Foto</span>}
                          </span>
                        )}
                        <span
                          className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full ${
                            isSelected ? 'bg-app-accent text-[#14151a]' : 'border border-white/70 bg-black/40'
                          }`}
                          aria-hidden="true"
                        >
                          {isSelected ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                              <path d="M5 12l5 5 9-10" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 font-mono text-[10px] font-semibold text-white">
                          {length ? `▶ ${length}` : timeLabel(asset.createdAt, zone)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="border-t border-app-line bg-app-bg/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-2.5 backdrop-blur">
          {state.kind === 'ready' && !empty ? (
            <Button block size="lg" disabled={count === 0} onClick={confirm}>
              {count === 0 ? 'Elige al menos uno' : `Añadir ${count}`}
            </Button>
          ) : null}
          <Button block variant="ghost" className="mt-1" onClick={onOpenFullGallery}>
            Ver toda la galería
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default GalleryRangeSheet;
