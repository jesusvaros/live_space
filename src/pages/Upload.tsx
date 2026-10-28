import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Content, Modal, Spinner } from '../components/ui/AppPrimitives';
import { useLocation, useNavigate } from 'react-router-dom';
import { EventSetlistEntry } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import QrScanner from '../components/QrScanner';
import { buildMomentItems, MomentItem } from '../lib/moments';
import AppShell from '../components/AppShell';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { IconChevronDown, IconPlus, IconQrCode } from '../components/icons';
import { fetchEventCardById, fetchEventCards } from '../data/eventQueries';
import { eventService } from '../services/event.service';
import { enqueueMomentUploads } from '../media';
import { distanceToConcert, songAtTime } from '../lib/songAssignment';
import { EventListItem } from '../features/events/types';
import { ReuseConsentCheckbox } from '../features/community';
import { getEventCoverImage, getPrimaryArtistName } from '../features/events/utils';
import { parseScannedUploadValue } from '../lib/uploadQr';
import { eventManagementService } from '../services/eventManagement.service';
import { canGoBack } from '../app/useGoBack';

const DAY_MS = 24 * 60 * 60 * 1000;
// Detected only if the media was captured within this distance of the concert.
const DETECT_TOLERANCE_MS = 3 * 60 * 60 * 1000;

type EventChoice = 'detected' | 'chosen';

const pad = (value: number) => value.toString().padStart(2, '0');
const clock = (date: Date | null) =>
  date ? date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';
const duration = (seconds: number | undefined) =>
  seconds && Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${pad(Math.round(seconds % 60))}` : null;

const eventWhen = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - DAY_MS);
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `Hoy, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Ayer, ${time}`;
  return `${date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}, ${time}`;
};

const eventTitle = (event: EventListItem) =>
  `${getPrimaryArtistName(event)}${event.venue_place?.name ? ` · ${event.venue_place.name}` : ''}`;

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// The concert whose time best fits the media's capture times.
const detectEvent = (items: MomentItem[], events: EventListItem[]) => {
  const times = items.map(item => item.captureAt).filter((date): date is Date => Boolean(date));
  if (times.length === 0) return null;
  let best: { event: EventListItem; hits: number; distance: number } | null = null;
  for (const event of events) {
    let hits = 0;
    let distance = 0;
    for (const time of times) {
      const away = distanceToConcert(time, event.starts_at, event.ends_at);
      if (away === 0) hits += 1;
      distance += away;
    }
    if (hits === 0 && distance / times.length > DETECT_TOLERANCE_MS) continue;
    if (!best || hits > best.hits || (hits === best.hits && distance < best.distance)) {
      best = { event, hits, distance };
    }
  }
  return best?.event ?? null;
};

const Upload: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  // A concert QR carries ?qr=<upload token> (resolved below) instead of the id.
  const presetToken = params.get('qr');
  const [tokenEventId, setTokenEventId] = useState<string | null>(null);
  const presetEventId = params.get('event') || tokenEventId;
  const presetSong = Number(params.get('song')) || null;

  const [event, setEvent] = useState<EventListItem | null>(null);
  const [choice, setChoice] = useState<EventChoice>('chosen');
  const [setlist, setSetlist] = useState<EventSetlistEntry[]>([]);
  const [items, setItems] = useState<MomentItem[]>([]);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [songOverrides, setSongOverrides] = useState<Record<string, number | null>>({});
  const [candidates, setCandidates] = useState<EventListItem[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [songPickerFor, setSongPickerFor] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<MomentItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => itemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl)), []);

  useEffect(() => {
    if (!presetToken) return;
    let cancelled = false;
    eventManagementService
      .resolveUploadToken(presetToken)
      .then(eventId => {
        if (cancelled) return;
        if (eventId) setTokenEventId(eventId);
        else setError('Este QR ya no es válido. Elige el concierto a mano.');
      })
      .catch(() => {
        if (!cancelled) setError('No hemos podido leer el QR. Elige el concierto a mano.');
      });
    return () => {
      cancelled = true;
    };
  }, [presetToken]);

  // Coming from a concert page ("¿La grabaste?", "Sube lo que grabaste").
  useEffect(() => {
    if (!presetEventId) return;
    let cancelled = false;
    fetchEventCardById(presetEventId)
      .then(found => {
        if (cancelled || !found) return;
        setEvent(found);
        setChoice('chosen');
      })
      .catch(() => setError('No encontramos ese concierto.'));
    return () => {
      cancelled = true;
    };
  }, [presetEventId]);

  useEffect(() => {
    if (!event) {
      setSetlist([]);
      return;
    }
    let cancelled = false;
    eventService
      .getEventSetlist(event.id)
      .then(entries => {
        if (!cancelled) setSetlist(entries);
      })
      .catch(() => {
        if (!cancelled) setSetlist([]);
      });
    return () => {
      cancelled = true;
    };
  }, [event?.id]);

  // Concerts to choose from: around the capture times, or the last two weeks.
  const loadCandidates = async (forItems: MomentItem[]) => {
    const times = forItems.map(item => item.captureAt?.getTime()).filter((time): time is number => Boolean(time));
    const now = Date.now();
    const from = times.length ? Math.min(...times) - DAY_MS : now - 14 * DAY_MS;
    const to = times.length ? Math.max(...times) + DAY_MS / 2 : now + DAY_MS;
    const list = await fetchEventCards({ startIso: new Date(from).toISOString(), endIso: new Date(to).toISOString() });
    setCandidates(list);
    return list;
  };

  useEffect(() => {
    if (pickerOpen && candidates.length === 0) loadCandidates(items).catch(() => setCandidates([]));
  }, [pickerOpen]);

  const handleFiles = async (input: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(input.target.files || []);
    input.target.value = '';
    if (!files.length) return;
    setError('');
    const built = await buildMomentItems(files);
    const next = [...items, ...built].sort(
      (left, right) => (left.captureAt?.getTime() ?? 0) - (right.captureAt?.getTime() ?? 0),
    );
    setItems(next);
    if (presetEventId || (event && choice === 'chosen')) return;
    setDetecting(true);
    try {
      const list = await loadCandidates(next);
      const found = detectEvent(next, list);
      if (found) {
        setEvent(found);
        setChoice('detected');
      }
    } catch {
      // The user can still pick the concert by hand.
    } finally {
      setDetecting(false);
    }
  };

  const removeItem = (id: string) => {
    setItems(prev => {
      const target = prev.find(item => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(item => item.id !== id);
    });
  };

  // Song per item: the user's pick, else the preset song, else by time.
  const songFor = (item: MomentItem): EventSetlistEntry | null => {
    if (item.id in songOverrides) {
      const ordinal = songOverrides[item.id];
      return ordinal ? setlist.find(entry => entry.ordinal === ordinal) || null : null;
    }
    if (presetSong && event?.id === presetEventId) {
      return setlist.find(entry => entry.ordinal === presetSong) || null;
    }
    return event ? songAtTime(setlist, item.captureAt, event.starts_at, event.ends_at) : null;
  };

  const selectEvent = (selected: EventListItem) => {
    setEvent(selected);
    setChoice('chosen');
    setSongOverrides({});
    setPickerOpen(false);
  };

  const handleQrDetected = async (value: string) => {
    const target = parseScannedUploadValue(value);
    setShowScanner(false);
    if (!target) {
      setError('Código QR no válido.');
      return;
    }
    try {
      const eventId = 'token' in target ? await eventManagementService.resolveUploadToken(target.token) : target.eventId;
      if (!eventId) throw new Error('not found');
      const found = await fetchEventCardById(eventId);
      if (!found) throw new Error('not found');
      selectEvent(found);
    } catch {
      setError('No hay ningún concierto para ese código QR.');
    }
  };

  const publish = async () => {
    if (!user || !event || items.length === 0) return;
    setError('');
    setUploading(true);
    setProgress({ current: 0, total: items.length });
    try {
      // The background queue uploads, retries and creates the posts; progress
      // shows in the upload pill, so the screen can close right away.
      await enqueueMomentUploads(items.map(item => ({
        file: item.file,
        kind: item.mediaType,
        eventId: event.id,
        capturedAt: item.captureAt ? item.captureAt.toISOString() : null,
        // Only setlist songs that exist in the catalogue can be linked.
        songId: songFor(item)?.song_id ?? null,
      })));
      itemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
      setItems([]);
      navigate(`/event/${event.id}`, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'No se pudo subir. Inténtalo de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const close = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/tabs/feed', { replace: true });
  };

  const filteredCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = [...candidates].sort((left, right) => right.starts_at.localeCompare(left.starts_at));
    if (!query) return sorted;
    return sorted.filter(candidate =>
      [candidate.name, getPrimaryArtistName(candidate), candidate.venue_place?.name, candidate.city]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query)),
    );
  }, [candidates, search]);

  const cover = event ? getEventCoverImage(event) : null;
  const pickingSongFor = items.find(item => item.id === songPickerFor) || null;

  return (
    <AppShell headerProps={null} contentWrapperClassName={false}>
      <div className="flex min-h-full flex-col pb-[calc(240px+env(safe-area-inset-bottom,0px))]">
        <header className="flex items-center gap-2 px-3 pt-[calc(10px+env(safe-area-inset-top,0px))]">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
          >
            <CloseIcon />
          </button>
          <h1 className="flex-1 font-display text-lg font-bold text-app-ink">Subir momentos</h1>
        </header>

        <section className="mx-4 mt-3.5 flex items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-3">
          <div className="relative h-[60px] w-12 shrink-0 overflow-hidden rounded-lg bg-app-bg">
            {event ? (
              cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <GeneratedPoster title={getPrimaryArtistName(event)} variant="thumb" />
              )
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            {detecting ? (
              <p className="flex items-center gap-2 text-sm text-white/70">
                <Spinner className="h-4 w-4" /> Buscando el concierto…
              </p>
            ) : event ? (
              <>
                <p className={`font-mono text-[11px] font-semibold uppercase ${choice === 'detected' ? 'text-[#25d47b]' : 'text-app-accent'}`}>
                  {choice === 'detected'
                    ? `Detectado por la hora de tus ${items.some(item => item.mediaType === 'video') ? 'vídeos' : 'fotos'}`
                    : 'Concierto'}
                </p>
                <p className="mt-0.5 truncate font-display text-base font-bold text-app-ink">{eventTitle(event)}</p>
                <p className="mt-0.5 text-[13px] text-[#c9c5bd]">{eventWhen(event.starts_at)}</p>
              </>
            ) : (
              <>
                <p className="font-mono text-[11px] font-semibold uppercase text-white/50">Concierto</p>
                <p className="mt-0.5 text-sm text-[#c9c5bd]">
                  {items.length ? 'No lo hemos reconocido por la hora. Elígelo.' : 'Lo detectamos por la hora de tus vídeos.'}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="min-h-9 shrink-0 rounded-full border border-app-line px-3 text-xs font-semibold text-app-ink"
          >
            {event ? 'Cambiar' : 'Elegir'}
          </button>
        </section>

        {items.length === 0 ? (
          <div className="flex flex-col gap-3 px-4 pt-5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-app-line text-app-ink"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-app-accent text-[#14151a]">
                <IconPlus size={24} />
              </span>
              <span className="font-display text-base font-bold">Elegir fotos y vídeos</span>
              <span className="max-w-[260px] text-center text-[13px] text-[#c9c5bd]">
                Cada uno irá a su canción según la hora a la que lo grabaste.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-app-line text-sm font-semibold text-app-ink"
            >
              <IconQrCode size={18} />
              Escanear el QR del concierto
            </button>
            <button
              type="button"
              onClick={() => navigate('/importar')}
              className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink"
            >
              Pegar enlace de Instagram, TikTok o YouTube
            </button>
          </div>
        ) : (
          <>
            <h2 className="mx-4 mb-2 mt-[18px] font-display text-base font-bold text-app-ink">
              {setlist.length ? 'Cada uno va a su canción' : 'Tus momentos'}
            </h2>
            {event && setlist.length === 0 ? (
              <p className="mx-4 mb-2 text-[13px] text-white/55">
                Este concierto aún no tiene setlist: los colocamos por la hora.
              </p>
            ) : null}
            <ul className="flex flex-col gap-2 px-4">
              {items.map(item => {
                const song = songFor(item);
                const length = duration(durations[item.id]);
                return (
                  <li key={item.id} className="flex items-center gap-3">
                    <span className="relative h-20 w-16 shrink-0 overflow-hidden rounded-[10px] bg-app-surface">
                      {item.mediaType === 'video' ? (
                        <video
                          src={`${item.previewUrl}#t=0.1`}
                          muted
                          playsInline
                          preload="metadata"
                          aria-label={`Vídeo de las ${clock(item.captureAt)}`}
                          className="h-full w-full object-cover"
                          onLoadedMetadata={eventTarget => {
                            const seconds = eventTarget.currentTarget.duration;
                            setDurations(prev => ({ ...prev, [item.id]: seconds }));
                          }}
                        />
                      ) : (
                        <img src={item.previewUrl} alt={`Foto de las ${clock(item.captureAt)}`} className="h-full w-full object-cover" />
                      )}
                      {length ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 font-mono text-[10px] font-semibold text-app-ink">
                          {length}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Quitar"
                        onClick={() => removeItem(item.id)}
                        className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] font-semibold text-[#8f8b84]">{clock(item.captureAt)}</span>
                      <span className="block font-display text-[15px] font-bold leading-snug text-app-ink line-clamp-2">
                        {song ? `${pad(song.ordinal)} · ${song.song_title || 'Canción'}` : setlist.length ? 'Sin canción' : 'Sin setlist'}
                      </span>
                    </span>
                    {setlist.length ? (
                      <button
                        type="button"
                        aria-label="Cambiar canción"
                        onClick={() => setSongPickerFor(item.id)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line text-[#c9c5bd]"
                      >
                        <IconChevronDown size={18} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-app-line text-sm font-semibold text-[#c9c5bd]"
                >
                  <IconPlus size={18} />
                  Añadir más de la galería
                </button>
              </li>
            </ul>
          </>
        )}

        {error ? <p className="mx-4 mt-3 text-sm text-rose-400">{error}</p> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[1300] border-t border-app-line bg-app-bg/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2.5 backdrop-blur-xl">
        <ReuseConsentCheckbox className="mb-2" />
        <button
          type="button"
          onClick={publish}
          disabled={uploading || !event || items.length === 0}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-app-accent text-base font-bold text-[#14151a] disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Spinner className="h-4 w-4" />
              Subiendo {progress.current}/{progress.total}
            </>
          ) : items.length ? (
            `Publicar ${items.length} ${items.length === 1 ? 'momento' : 'momentos'}`
          ) : (
            'Publicar'
          )}
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFiles} className="hidden" />

      <Modal isOpen={pickerOpen} onDidDismiss={() => setPickerOpen(false)} initialBreakpoint={0.8} title="Elegir concierto">
        <div className="flex max-h-[85dvh] flex-col px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <h3 className="font-display text-lg font-bold text-app-ink">¿En qué concierto fue?</h3>
          <input
            type="search"
            value={search}
            onChange={eventInput => setSearch(eventInput.target.value)}
            placeholder="Artista, sala o ciudad"
            className="mt-3 min-h-11 rounded-full border border-app-line bg-app-surface px-4 text-sm text-app-ink placeholder:text-white/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setPickerOpen(false);
              setShowScanner(true);
            }}
            className="mt-2 flex min-h-11 items-center gap-2 px-1 text-sm font-semibold text-app-accent"
          >
            <IconQrCode size={18} />
            Escanear el QR del concierto
          </button>
          <ul className="mt-1 min-h-0 flex-1 overflow-y-auto">
            {filteredCandidates.length === 0 ? (
              <li className="py-6 text-center text-sm text-white/55">No hay conciertos en esas fechas.</li>
            ) : (
              filteredCandidates.map(candidate => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => selectEvent(candidate)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left ${
                      candidate.id === event?.id ? 'bg-white/[0.08]' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-bold text-app-ink">{eventTitle(candidate)}</span>
                      <span className="block text-[13px] text-[#c9c5bd]">{eventWhen(candidate.starts_at)}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </Modal>

      <Modal isOpen={Boolean(pickingSongFor)} onDidDismiss={() => setSongPickerFor(null)} initialBreakpoint={0.7} title="Elegir canción">
        <div className="flex max-h-[80dvh] flex-col px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <h3 className="font-display text-lg font-bold text-app-ink">¿Qué canción sonaba?</h3>
          <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {[...setlist, null].map(entry => {
              const current = pickingSongFor ? songFor(pickingSongFor) : null;
              const active = entry ? current?.ordinal === entry.ordinal : !current;
              return (
                <li key={entry ? entry.ordinal : 'none'}>
                  <button
                    type="button"
                    onClick={() => {
                      if (pickingSongFor) setSongOverrides(prev => ({ ...prev, [pickingSongFor.id]: entry ? entry.ordinal : null }));
                      setSongPickerFor(null);
                    }}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left ${active ? 'bg-app-accent/[0.12] text-app-accent' : 'text-app-ink'}`}
                  >
                    <span className="w-6 font-mono text-xs font-semibold text-[#8f8b84]">{entry ? pad(entry.ordinal) : '—'}</span>
                    <span className="flex-1 text-[15px] font-semibold">{entry ? entry.song_title || 'Canción' : 'Sin canción'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>

      <Modal isOpen={showScanner} onDidDismiss={() => setShowScanner(false)} title="Escanear QR del concierto">
        <Content fullscreen>
          <div className="flex flex-col gap-4 bg-app-bg p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-lg font-bold text-white">Escanear QR</h2>
              <button
                type="button"
                className="min-h-9 rounded-full border border-app-line px-3 text-xs font-semibold text-white"
                onClick={() => setShowScanner(false)}
              >
                Cerrar
              </button>
            </div>
            <QrScanner onDetected={handleQrDetected} />
          </div>
        </Content>
      </Modal>
    </AppShell>
  );
};

export default Upload;
