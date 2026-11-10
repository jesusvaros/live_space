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
import { fetchEventCardById, fetchUploadCandidates } from '../data/eventQueries';
import { eventService } from '../services/event.service';
import { enqueueMomentUploads } from '../media';
import { songAtTime } from '../lib/songAssignment';
import { detectConcert, hasReliableTime, type DetectionReason } from '../lib/concertDetection';
import { EventListItem } from '../features/events/types';
import { ReuseConsentCheckbox } from '../features/community';
import { getEventCoverImage, getPrimaryArtistName } from '../features/events/utils';
import { parseScannedUploadValue } from '../lib/uploadQr';
import { eventManagementService } from '../services/eventManagement.service';
import { canGoBack } from '../app/useGoBack';
import AuthPanel from '../auth/AuthPanel';
import { clearReturnTo, rememberReturnTo } from '../auth/returnTo';
import { savePendingSelection, takePendingSelection } from '../media/pendingSelection';
import { markOnboardingSeen } from '../app/onboarding';
import { readStoredCity, sameCity } from '../features/agenda/agendaPrefs';
import AttendanceSuggestion from '../features/events/AttendanceSuggestion';

const DAY_MS = 24 * 60 * 60 * 1000;

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

const inCity = (event: EventListItem, city: string | null) =>
  Boolean(city && sameCity((event.city || event.venue_place?.city || '').trim(), city));

const venueOf = (event: EventListItem) => {
  const lat = event.venue_place?.latitude ?? event.latitude;
  const lng = event.venue_place?.longitude ?? event.longitude;
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
};

// The concert that fits the media's capture times and, when the files carry
// it, where they were taken (lib/concertDetection.ts). The locations are only
// compared in memory here; they are never uploaded or stored.
const detectEvent = (items: MomentItem[], events: EventListItem[], city: string | null) =>
  detectConcert(
    items,
    events.map(event => ({
      event,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      venue: venueOf(event),
      local: inCity(event, city),
    })),
  );

const mediaNoun = (items: MomentItem[]) => (items.some(item => item.mediaType === 'video') ? 'vídeos' : 'fotos');

const detectedLabel = (reason: DetectionReason | null, items: MomentItem[]) => {
  const noun = mediaNoun(items);
  if (reason === 'time-place') return `Detectado por la hora y el lugar de tus ${noun}`;
  if (reason === 'place') return `Detectado por el lugar de tus ${noun} · ¿es este?`;
  return `Detectado por la hora de tus ${noun}`;
};

const QrWelcome: React.FC<{
  event: EventListItem | null;
  error: string;
  onPick: () => void;
  onChooseOther: () => void;
  onClose: () => void;
}> = ({ event, error, onPick, onChooseOther, onClose }) => {
  const cover = event ? getEventCoverImage(event) : null;
  const venue = event?.venue_place;
  return (
    <div className="relative flex min-h-full flex-col bg-app-bg">
      <div className="relative h-[46dvh] min-h-[280px] w-full overflow-hidden">
        {event ? (
          cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <GeneratedPoster title={getPrimaryArtistName(event)} variant="hero" />
          )
        ) : (
          <div className="h-full w-full bg-app-surface" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,14,18,0.2)_0%,rgba(13,14,18,0.55)_55%,#0d0e12_100%)]" aria-hidden />
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute left-3 top-[calc(10px+env(safe-area-inset-top,0px))] flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="-mt-24 relative flex flex-1 flex-col gap-5 px-5 pb-[calc(28px+env(safe-area-inset-bottom,0px))]">
        <div>
          <p className="m-0 font-mono text-xs font-semibold uppercase tracking-wide text-app-accent">Enhorabuena, estás aquí</p>
          {event ? (
            <>
              <h1 className="m-0 mt-2 font-display text-[40px] font-bold uppercase leading-[0.95] tracking-tight text-app-ink">
                {getPrimaryArtistName(event)}
              </h1>
              <p className="m-0 mt-2 text-base font-semibold text-app-ink">
                {[venue?.name, venue?.city].filter(Boolean).join(' · ')}
              </p>
              <p className="m-0 mt-0.5 text-sm text-[#c9c5bd]">{eventWhen(event.starts_at)}</p>
            </>
          ) : error ? null : (
            <p className="mt-3 flex items-center gap-2 text-sm text-white/70">
              <Spinner className="h-4 w-4" /> Buscando el concierto…
            </p>
          )}
        </div>

        {error ? <p role="alert" className="m-0 text-sm text-rose-400">{error}</p> : null}

        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            onClick={onPick}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-app-accent text-lg font-bold text-[#14151a]"
          >
            <IconPlus size={22} />
            Sube tus fotos y vídeos
          </button>
          <p className="m-0 text-center text-[13px] text-white/55">
            Cada uno irá a su canción. Sin registrarte para empezar.
          </p>
          <button
            type="button"
            onClick={onChooseOther}
            className="min-h-11 text-sm font-semibold text-white/70"
          >
            {event ? '¿No es este concierto?' : 'Elegir el concierto a mano'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Upload: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  // Where the user goes to concerts, when known: their concerts go first.
  const userCity = readStoredCity() || profile?.primary_city || null;
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  // A concert QR carries ?qr=<upload token> (resolved below) instead of the id.
  const presetToken = params.get('qr');
  // Scanned at the venue: welcome them to the concert and go straight to the
  // picker. The account is only asked for when they press «Publicar».
  const fromQr = Boolean(presetToken);
  const [tokenEventId, setTokenEventId] = useState<string | null>(null);
  const presetEventId = params.get('event') || tokenEventId;
  const presetSong = Number(params.get('song')) || null;

  const [event, setEvent] = useState<EventListItem | null>(null);
  const [choice, setChoice] = useState<EventChoice>('chosen');
  const [detectedBy, setDetectedBy] = useState<DetectionReason | null>(null);
  // Signed in when the concert was recognised: «¿Marcamos que fuiste?» is
  // offered here. Otherwise it is offered on the concert page after publishing.
  const [detectedSignedIn, setDetectedSignedIn] = useState(false);
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
  const [authOpen, setAuthOpen] = useState(false);
  const [publishAfterAuth, setPublishAfterAuth] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<MomentItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => itemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl)), []);

  // Someone who opens the app through a QR has already found out what it is for.
  useEffect(() => {
    if (fromQr) markOnboardingSeen();
  }, [fromQr]);

  // Back from Google/Apple on the web: the page reloaded, so put back what
  // they had picked and finish the publish they had asked for.
  useEffect(() => {
    let cancelled = false;
    takePendingSelection()
      .then(async pending => {
        if (cancelled || !pending) return;
        const built = await buildMomentItems(pending.files);
        if (cancelled) return;
        setItems(built.sort((left, right) => (left.captureAt?.getTime() ?? 0) - (right.captureAt?.getTime() ?? 0)));
        if (pending.eventId && !presetEventId) {
          const found = await fetchEventCardById(pending.eventId).catch(() => null);
          if (!cancelled && found) {
            setEvent(found);
            setChoice(pending.detectedBy ? 'detected' : 'chosen');
            setDetectedBy(pending.detectedBy ?? null);
            setDetectedSignedIn(false);
          }
        }
        if (!cancelled) setPublishAfterAuth(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Concerts to choose from, every city: around the capture times, or the
  // last two weeks. Slim rows: just what the picker and detection need. With
  // only file dates, a day either side (detection by place allows ±1 day).
  const loadCandidates = async (forItems: MomentItem[]) => {
    const times = forItems.map(item => item.captureAt?.getTime()).filter((time): time is number => Boolean(time));
    const now = Date.now();
    const after = hasReliableTime(forItems) ? DAY_MS / 2 : DAY_MS;
    const from = times.length ? Math.min(...times) - DAY_MS : now - 14 * DAY_MS;
    const to = times.length ? Math.max(...times) + after : now + DAY_MS;
    const list = await fetchUploadCandidates({ startIso: new Date(from).toISOString(), endIso: new Date(to).toISOString() });
    setCandidates(list);
    return list;
  };

  // A picked or detected concert comes as a slim row; the full card fills in
  // behind it (and opens the concert page instantly after publishing).
  const completeEvent = (picked: EventListItem) => {
    fetchEventCardById(picked.id)
      .then(full => {
        if (full) setEvent(current => (current?.id === full.id ? full : current));
      })
      .catch(() => undefined);
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
      const found = detectEvent(next, list, userCity);
      if (found) {
        setEvent(found.event);
        setChoice('detected');
        setDetectedBy(found.reason);
        setDetectedSignedIn(Boolean(user));
        completeEvent(found.event);
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

  const selectEvent = (selected: EventListItem, complete = false) => {
    setEvent(selected);
    setChoice('chosen');
    setDetectedBy(null);
    setSongOverrides({});
    setPickerOpen(false);
    if (complete) completeEvent(selected);
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
    if (!event || items.length === 0) return;
    if (!user) {
      // Nothing reaches the database without an account. Ask for one here,
      // keep the selection on screen and carry on once they are in. The
      // return path brings an email-confirmation or Google/Apple deep link
      // back to this same screen.
      rememberReturnTo(`${location.pathname}${location.search}`);
      setPublishAfterAuth(true);
      setAuthOpen(true);
      return;
    }
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
      clearReturnTo();
      // Recognised from the media but they could not be asked here (they
      // signed in to publish): the concert page offers «¿Marcamos que fuiste?».
      const suggestAttendance = choice === 'detected' && !detectedSignedIn;
      navigate(`/event/${event.id}`, { replace: true, state: suggestAttendance ? { suggestAttendance: true } : undefined });
    } catch (err: any) {
      setError(err?.message || 'No se pudo subir. Inténtalo de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  // Signed in from the sheet (email here, Google/Apple or an email link from
  // outside): publish what was waiting.
  useEffect(() => {
    if (!user || !publishAfterAuth || !event || items.length === 0 || uploading) return;
    setPublishAfterAuth(false);
    setAuthOpen(false);
    void publish();
  }, [user, publishAfterAuth, event, items.length]);

  const close = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/tabs/feed', { replace: true });
  };

  const filteredCandidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    // Newest first, the user's city before the rest.
    const sorted = [...candidates].sort(
      (left, right) =>
        Number(inCity(right, userCity)) - Number(inCity(left, userCity)) || right.starts_at.localeCompare(left.starts_at),
    );
    if (!query) return sorted;
    return sorted.filter(candidate =>
      [candidate.name, getPrimaryArtistName(candidate), candidate.venue_place?.name, candidate.city]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query)),
    );
  }, [candidates, search, userCity]);

  const cover = event ? getEventCoverImage(event) : null;
  const pickingSongFor = items.find(item => item.id === songPickerFor) || null;
  const showQrWelcome = fromQr && items.length === 0;

  return (
    <AppShell headerProps={null} contentWrapperClassName={false}>
      {showQrWelcome ? (
        <QrWelcome
          event={event}
          error={error}
          onPick={() => fileInputRef.current?.click()}
          onChooseOther={() => setPickerOpen(true)}
          onClose={close}
        />
      ) : (
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
                  {choice === 'detected' ? detectedLabel(detectedBy, items) : 'Concierto'}
                </p>
                <p className="mt-0.5 truncate font-display text-base font-bold text-app-ink">{eventTitle(event)}</p>
                <p className="mt-0.5 text-[13px] text-[#c9c5bd]">{eventWhen(event.starts_at)}</p>
              </>
            ) : (
              <>
                <p className="font-mono text-[11px] font-semibold uppercase text-white/50">Concierto</p>
                <p className="mt-0.5 text-sm text-[#c9c5bd]">
                  {items.length ? 'No lo hemos reconocido. Elígelo.' : 'Lo detectamos por la hora y el lugar de tus vídeos.'}
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

        {event && choice === 'detected' && detectedSignedIn && !detecting ? (
          <AttendanceSuggestion
            key={event.id}
            eventId={event.id}
            startsAt={event.starts_at}
            endsAt={event.ends_at}
            className="mx-4 mt-2.5"
          />
        ) : null}

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
              ¿Ya lo subiste a Instagram o TikTok?
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
      )}

      {showQrWelcome ? null : (
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
      )}

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
                    onClick={() => selectEvent(candidate, true)}
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

      <Modal
        isOpen={authOpen}
        onDidDismiss={() => {
          setAuthOpen(false);
          setPublishAfterAuth(false);
        }}
        initialBreakpoint={0.95}
        title="Crea tu cuenta para publicar"
      >
        <div className="max-h-[90dvh] overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <h3 className="m-0 font-display text-2xl font-bold text-app-ink">Último paso</h3>
          <p className="m-0 mt-1.5 text-sm text-[#c9c5bd]">
            Crea tu cuenta y {items.length === 1 ? 'tu momento se publica' : `tus ${items.length} momentos se publican`} con tu nombre.
            No pierdes nada de lo que has elegido.
          </p>
          <div className="mt-5">
            <AuthPanel
              defaultMode="signup"
              minimal
              confirmationNotice="Te hemos enviado un email. Pulsa el enlace en este móvil y publicamos solos lo que has elegido. Si lo abres en otro dispositivo, vuelve aquí y pulsa «Entrar»."
              providerReturnPath={`${location.pathname}${location.search}`}
              beforeProviderRedirect={() =>
                savePendingSelection({
                  eventId: event?.id ?? null,
                  files: items.map(item => item.file),
                  detectedBy: choice === 'detected' ? detectedBy : null,
                })
              }
            />
          </div>
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
