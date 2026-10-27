import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Modal, Spinner, useToast } from '../components/ui/AppPrimitives';
import Button from '../components/ui/Button';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { IconChevronDown } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { eventWindow, matchMoments, VENUE_RADIUS_M, type MomentMatch } from '../features/moments/matchMoments';
import { describeClips, markNudgeDone } from '../features/moments/momentNudge';
import { fetchMomentEvent, type MomentEvent } from '../features/moments/momentsData';
import {
  canReadGallery,
  checkGalleryPermission,
  findMedia,
  getUploadPath,
  isGalleryScanAvailable,
  requestGalleryPermission,
  type GalleryAsset,
  type GalleryPermission,
} from '../media/native/gallery';
import { enqueueMomentUploads } from '../media/uploadQueue';

// /subir/sugerido?event=<id> — the clips of last night, found in the camera
// roll, preselected and assigned to songs. Opened from the morning nudge.
// Gallery access is only ever requested here, after the pre-prompt below.

type Suggestion = MomentMatch & { asset: GalleryAsset };

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unsupported' }
  | { kind: 'preprompt'; denied: boolean }
  | { kind: 'scanning' }
  | { kind: 'ready' };

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

const durationLabel = (seconds: number | null) => {
  if (seconds == null) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const whenLabel = (iso: string) => {
  const date = new Date(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const day = date.toDateString() === yesterday.toDateString()
    ? 'Ayer'
    : date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${timeLabel(iso)}`;
};

const SuggestedUpload: React.FC = () => {
  const navigate = useNavigate();
  const { presentToast } = useToast();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const eventId = params.get('event') || '';

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [event, setEvent] = useState<MomentEvent | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [songs, setSongs] = useState<Record<string, string | null>>({});
  const [songPickerFor, setSongPickerFor] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const close = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(eventId ? `/event/${eventId}` : '/tabs/events', { replace: true });
  }, [eventId, navigate]);

  const scan = useCallback(async (target: MomentEvent, permission: GalleryPermission) => {
    setPhase({ kind: 'scanning' });
    setLimited(permission === 'limited');
    try {
      const range = eventWindow(target);
      const assets = await findMedia({
        from: new Date(range.from),
        to: new Date(range.to),
        near: target.venue ? { ...target.venue, radiusM: VENUE_RADIUS_M } : undefined,
      });
      // The user opened this concert's suggestions, so it counts as one they
      // went to even if they never marked it: clips without GPS still match.
      const matches = matchMoments(assets, [{ ...target, relation: target.relation ?? 'saved' }]);
      const byId = new Map(assets.map(asset => [asset.id, asset]));
      const found = matches.flatMap(match => {
        const asset = byId.get(match.assetId);
        return asset ? [{ ...match, asset }] : [];
      });
      setSuggestions(found);
      setSelected(new Set(found.map(item => item.assetId)));
      setSongs(Object.fromEntries(found.map(item => [item.assetId, item.setlistItemId])));
      setPhase({ kind: 'ready' });
      markNudgeDone(target.id);
    } catch (error: any) {
      setPhase({ kind: 'error', message: error?.message || 'No hemos podido leer tu galería.' });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!eventId) {
        setPhase({ kind: 'error', message: 'Falta el concierto.' });
        return;
      }
      try {
        const loaded = await fetchMomentEvent(eventId, user?.id ?? null);
        if (cancelled) return;
        if (!loaded) {
          setPhase({ kind: 'error', message: 'No encontramos este concierto.' });
          return;
        }
        setEvent(loaded);
        if (!isGalleryScanAvailable()) {
          setPhase({ kind: 'unsupported' });
          return;
        }
        const permission = await checkGalleryPermission();
        if (cancelled) return;
        if (canReadGallery(permission)) await scan(loaded, permission);
        else setPhase({ kind: 'preprompt', denied: permission === 'denied' });
      } catch (error: any) {
        if (!cancelled) setPhase({ kind: 'error', message: error?.message || 'No se ha podido cargar el concierto.' });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId, scan, user?.id]);

  const allowGallery = async () => {
    if (!event) return;
    const permission = await requestGalleryPermission();
    if (canReadGallery(permission)) await scan(event, permission);
    else setPhase({ kind: 'preprompt', denied: true });
  };

  const toggle = (assetId: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const setlistById = useMemo(
    () => new Map((event?.setlist ?? []).map(item => [item.id, item])),
    [event?.setlist],
  );

  const songLabel = (setlistItemId: string | null | undefined) => {
    const item = setlistItemId ? setlistById.get(setlistItemId) : null;
    return item ? `${String(item.position).padStart(2, '0')} · ${item.title}` : 'Sin canción';
  };

  const chosen = suggestions.filter(item => selected.has(item.assetId));
  const videoCount = chosen.filter(item => item.asset.kind === 'video').length;
  const detectedByGps = suggestions.some(item => item.eventEvidence === 'gps');

  const publish = async () => {
    if (!event || chosen.length === 0) return;
    setSubmitting(true);
    try {
      const items = [];
      for (const item of chosen) {
        items.push({
          nativePath: await getUploadPath(item.asset.id),
          eventId: event.id,
          setlistItemId: songs[item.assetId] ?? undefined,
          capturedAt: item.asset.createdAt,
        });
      }
      await enqueueMomentUploads(items);
      presentToast({ message: `Subiendo ${describeClips(videoCount, chosen.length - videoCount)}` });
      navigate(`/event/${event.id}`, { replace: true });
    } catch (error: any) {
      presentToast({ message: error?.message || 'No se ha podido subir. Inténtalo de nuevo.', duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  };

  const pickerItem = songPickerFor ? suggestions.find(item => item.assetId === songPickerFor) : null;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-app-bg text-app-ink">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h1 className="flex-1 font-display text-lg font-bold">Subir momentos</h1>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-6">
        {event && (
          <section className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-3">
            {event.imageUrl ? (
              <img src={event.imageUrl} alt="" className="h-[60px] w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <GeneratedPoster title={event.artistName || event.name} variant="thumb" className="h-[60px] w-12 shrink-0 rounded-lg" />
            )}
            <div className="min-w-0 flex-1">
              {phase.kind === 'ready' && suggestions.length > 0 && (
                <p className="font-mono text-[11px] font-semibold uppercase text-[#25d47b]">
                  {detectedByGps ? 'Detectado por la ubicación de tus vídeos' : 'Detectado por la hora de tus vídeos'}
                </p>
              )}
              <p className="truncate font-display text-base font-bold">
                {[event.artistName || event.name, event.venueName].filter(Boolean).join(' · ')}
              </p>
              <p className="text-[13px] text-app-muted">{whenLabel(event.startsAt)}</p>
            </div>
          </section>
        )}

        {(phase.kind === 'loading' || phase.kind === 'scanning') && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-app-muted">
            <Spinner />
            <p className="text-sm">{phase.kind === 'scanning' ? 'Buscando en tu galería…' : 'Cargando…'}</p>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-app-muted">{phase.message}</p>
            <Button variant="secondary" className="mt-4" onClick={close}>Volver</Button>
          </div>
        )}

        {phase.kind === 'unsupported' && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-app-muted">
              Encontrar tus vídeos del concierto solo funciona en la app de Live Space para Android e iOS.
            </p>
          </div>
        )}

        {phase.kind === 'preprompt' && (
          <section className="mx-4 mt-6 rounded-2xl border border-app-line bg-app-surface p-5">
            <h2 className="font-display text-xl font-bold">Encontramos tus vídeos por ti</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-app-muted">
              <li>Miramos solo las fotos y vídeos que hiciste durante el concierto, por su hora y su ubicación.</li>
              <li>Los ordenamos por canción para que no tengas que escribir nada.</li>
              <li>No se sube nada hasta que pulses Publicar.</li>
            </ul>
            {phase.denied ? (
              <p className="mt-4 text-sm text-app-ink">
                Has denegado el acceso a la galería. Actívalo en Ajustes › Live Space › Fotos para usar esta función.
              </p>
            ) : null}
            <Button block size="lg" className="mt-5" onClick={() => void allowGallery()}>
              {phase.denied ? 'Volver a intentarlo' : 'Permitir acceso a la galería'}
            </Button>
            <Button block variant="ghost" className="mt-2" onClick={close}>Ahora no</Button>
          </section>
        )}

        {phase.kind === 'ready' && suggestions.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-display text-lg font-bold">No hemos encontrado nada de esa noche</p>
            <p className="mt-2 text-sm text-app-muted">
              {limited
                ? 'Solo vemos las fotos que nos dejaste ver. Puedes ampliar la selección en Ajustes › Live Space › Fotos.'
                : 'Buscamos fotos y vídeos hechos durante el concierto y no hay ninguno en tu galería.'}
            </p>
          </div>
        )}

        {phase.kind === 'ready' && suggestions.length > 0 && (
          <>
            <h2 className="mx-4 mb-2 mt-5 font-display text-base font-bold">Cada uno va a su canción</h2>
            {limited && (
              <p className="mx-4 mb-3 text-[13px] text-app-muted">
                Solo vemos las fotos que nos dejaste ver. Amplía la selección en Ajustes si falta alguna.
              </p>
            )}
            <ul className="grid grid-cols-2 gap-3 px-4">
              {suggestions.map(item => {
                const isSelected = selected.has(item.assetId);
                const songId = songs[item.assetId];
                const approximate = songId === item.setlistItemId && item.songConfidence < 0.5;
                const duration = durationLabel(item.asset.durationSec);
                const kindLabel = item.asset.kind === 'video' ? 'Vídeo' : 'Foto';
                return (
                  <li key={item.assetId} className="flex min-w-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(item.assetId)}
                      aria-pressed={isSelected}
                      aria-label={`${kindLabel} de las ${timeLabel(item.asset.createdAt)}`}
                      className={`relative aspect-[3/4] w-full overflow-hidden rounded-xl border-2 bg-app-surface transition ${
                        isSelected ? 'border-app-accent' : 'border-transparent opacity-55'
                      }`}
                    >
                      {item.asset.thumbnailUri ? (
                        <img src={item.asset.thumbnailUri} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs text-app-muted">{kindLabel}</span>
                      )}
                      <span
                        className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full ${
                          isSelected ? 'bg-app-accent text-[#14151a]' : 'border border-white/60 bg-black/40'
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                            <path d="M5 12l5 5 9-10" />
                          </svg>
                        )}
                      </span>
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1 font-mono text-[10px] font-semibold text-white">
                        {timeLabel(item.asset.createdAt)}{duration ? ` · ${duration}` : ''}
                      </span>
                    </button>
                    {event && event.setlist.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSongPickerFor(item.assetId)}
                        aria-label={`Cambiar canción: ${songLabel(songId)}`}
                        className={`flex min-h-11 w-full items-center gap-1 rounded-full border px-3 text-left text-[13px] font-semibold ${
                          approximate ? 'border-dashed border-app-line text-app-muted' : 'border-app-line bg-app-surface text-app-ink'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{approximate ? `¿${songLabel(songId)}?` : songLabel(songId)}</span>
                        <IconChevronDown size={16} className="shrink-0 text-app-muted" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {event && event.setlist.length === 0 && (
              <p className="mx-4 mt-4 text-[13px] text-app-muted">
                Aún no tenemos el setlist de este concierto: se subirán sin canción.
              </p>
            )}
          </>
        )}
      </main>

      {phase.kind === 'ready' && suggestions.length > 0 && (
        <div className="border-t border-app-line bg-app-bg/95 px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur">
          <Button block size="lg" disabled={chosen.length === 0 || submitting} onClick={() => void publish()}>
            {submitting ? <Spinner className="h-4 w-4" label="Subiendo" /> : null}
            {chosen.length === 0
              ? 'Elige al menos uno'
              : `Publicar ${chosen.length} ${chosen.length === 1 ? 'momento' : 'momentos'}`}
          </Button>
        </div>
      )}

      <Modal isOpen={Boolean(pickerItem)} onDidDismiss={() => setSongPickerFor(null)} initialBreakpoint={0.6} title="Elegir canción">
        <div className="flex max-h-[80dvh] flex-col">
          <p className="px-5 pb-2 pt-5 font-display text-base font-bold">
            ¿Qué sonaba a las {pickerItem ? timeLabel(pickerItem.asset.createdAt) : ''}?
          </p>
          <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
            {[null, ...(event?.setlist ?? []).map(item => item.id)].map(optionId => {
              const active = pickerItem ? (songs[pickerItem.assetId] ?? null) === optionId : false;
              return (
                <li key={optionId ?? 'none'}>
                  <button
                    type="button"
                    onClick={() => {
                      if (pickerItem) setSongs(current => ({ ...current, [pickerItem.assetId]: optionId }));
                      setSongPickerFor(null);
                    }}
                    className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm ${
                      active ? 'bg-app-surface font-semibold text-app-accent' : 'text-app-ink'
                    }`}
                  >
                    {songLabel(optionId)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </div>
  );
};

export default SuggestedUpload;
