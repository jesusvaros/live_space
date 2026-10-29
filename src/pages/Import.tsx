import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import AppShell from '../components/AppShell';
import { Spinner } from '../components/ui/AppPrimitives';
import Button from '../components/ui/Button';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { IconChevronLeft } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { setlistService } from '../services/setlist.service';
import type { EventSetlistEntry } from '../lib/types';
import PlatformIcon from '../features/socialImport/components/PlatformIcon';
import { lookupSocialMetadata, SocialLookupError, type SocialMetadata } from '../features/socialImport/oembed';
import {
  resolveConcert,
  type ConcertCandidate,
  type ConcertResolution,
} from '../features/socialImport/resolveConcert';
import { importPathFor, rememberPendingImport } from '../features/socialImport/ShareTargetListener';
import { parseSocialUrl, SOURCE_LABEL } from '../features/socialImport/socialUrl';
import { canGoBack } from '../app/useGoBack';

// A shared reel/TikTok/YouTube link only tells us which concert and song the
// clip is from. Live Space never shows the link: the person then picks the
// original video from their gallery and it is uploaded like any other clip.
type Step =
  | { kind: 'paste' }
  | { kind: 'loading' }
  | { kind: 'review'; metadata: SocialMetadata; resolution: ConcertResolution };

const formatEventDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

const lookupErrorMessage = (error: unknown) => {
  if (error instanceof SocialLookupError && error.code === 'unresolved_short_link') {
    return 'No hemos podido abrir ese enlace corto. Abre el vídeo en TikTok y copia el enlace completo.';
  }
  return 'No hemos podido leer ese enlace. Comprueba tu conexión e inténtalo otra vez.';
};

const ConcertRow: React.FC<{
  event: ConcertCandidate;
  selected?: boolean;
  onSelect?: () => void;
  trailing?: React.ReactNode;
}> = ({ event, selected, onSelect, trailing }) => {
  const body = (
    <>
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-app-surface-strong">
        {event.image_url ? (
          <img src={event.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <GeneratedPoster title={event.artists[0] || event.name} variant="thumb" className="h-full w-full" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate font-display text-[15px] font-bold text-white">{event.artists[0] || event.name}</p>
        <p className="truncate text-[13px] text-white/60">
          {[event.venue_name, formatEventDate(event.starts_at)].filter(Boolean).join(' · ')}
        </p>
      </div>
      {trailing}
    </>
  );
  if (!onSelect) {
    return <div className="flex items-center gap-3">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${
        selected ? 'border-app-accent bg-app-accent/10' : 'border-app-line bg-app-surface hover:border-white/25'
      }`}
    >
      {body}
    </button>
  );
};

const Import: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const sharedUrl = params.get('url') ?? '';
  const sharedText = params.get('text');

  const [input, setInput] = useState(sharedUrl);
  const [inputError, setInputError] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'paste' });
  const [selectedEvent, setSelectedEvent] = useState<ConcertCandidate | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [setlist, setSetlist] = useState<EventSetlistEntry[]>([]);
  const [setlistLoading, setSetlistLoading] = useState(false);
  const [songPosition, setSongPosition] = useState<number | null>(null);
  const startedFor = useRef<string | null>(null);

  const isIos = Capacitor.getPlatform() === 'ios';

  const goBack = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/tabs/upload', { replace: true });
  };

  const start = async (raw: string) => {
    setInputError('');
    const parsed = parseSocialUrl(raw);
    if (!parsed) {
      setInputError('Ese enlace no es de Instagram, TikTok ni YouTube.');
      return;
    }
    setStep({ kind: 'loading' });
    try {
      const metadata = await lookupSocialMetadata(parsed);
      const resolution = await resolveConcert({ metadata, sharedText, profileId: user?.id ?? null });
      setSelectedEvent(resolution.event);
      setChoosing(!resolution.event);
      setSongPosition(resolution.songPosition);
      setStep({ kind: 'review', metadata, resolution });
    } catch (error) {
      setInputError(lookupErrorMessage(error));
      setStep({ kind: 'paste' });
    }
  };

  // Arriving from the share sheet: go straight to the lookup.
  useEffect(() => {
    if (!sharedUrl || authLoading || !user || startedFor.current === sharedUrl) return;
    startedFor.current = sharedUrl;
    setInput(sharedUrl);
    start(sharedUrl);
  }, [sharedUrl, authLoading, user]);

  useEffect(() => {
    if (!selectedEvent) {
      setSetlist([]);
      return undefined;
    }
    let alive = true;
    setSetlistLoading(true);
    setlistService
      .getEventSetlist(selectedEvent.id)
      .then(entries => {
        if (alive) setSetlist(entries.filter(entry => entry.song_id));
      })
      .catch(() => {
        if (alive) setSetlist([]);
      })
      .finally(() => {
        if (alive) setSetlistLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedEvent?.id]);

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        start(text);
      }
    } catch {
      setInputError('No podemos leer el portapapeles: mantén pulsado el campo y elige Pegar.');
    }
  };

  const pickOriginal = () => {
    if (!selectedEvent) return;
    const query = new URLSearchParams({ event: selectedEvent.id });
    if (songPosition) query.set('song', String(songPosition));
    navigate(`/tabs/upload?${query.toString()}`, { replace: true });
  };

  const header = (
    <div className="sticky top-0 z-[1200] flex items-center gap-2 border-b border-app-line bg-app-bg/95 px-3 pb-2 pt-[calc(8px+env(safe-area-inset-top,0px))] backdrop-blur">
      <button
        type="button"
        onClick={goBack}
        aria-label="Volver"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white"
      >
        <IconChevronLeft size={22} />
      </button>
      <p className="font-display text-base font-bold text-white">Desde tus redes</p>
    </div>
  );

  if (!authLoading && !user) {
    return (
      <AppShell headerProps={null}>
        {header}
        <div className="flex flex-col gap-4 p-4">
          <h1 className="font-poster text-[40px] leading-[0.9] text-white">Inicia sesión para subir tu vídeo</h1>
          <p className="text-[15px] text-white/70">Guardamos el enlace para buscar su concierto en cuanto entres.</p>
          <Button
            size="lg"
            block
            onClick={() => {
              if (sharedUrl) rememberPendingImport(importPathFor(sharedUrl, sharedText));
              navigate('/welcome');
            }}
          >
            Iniciar sesión
          </Button>
        </div>
      </AppShell>
    );
  }

  const reviewing = step.kind === 'review' ? step : null;

  return (
    <AppShell headerProps={null}>
      {header}

      {(step.kind === 'paste' || step.kind === 'loading') && (
        <div className="flex flex-col gap-6 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-accent">
              <PlatformIcon source="instagram" size={14} />
              <PlatformIcon source="tiktok" size={14} />
              <PlatformIcon source="youtube" size={14} />
              Instagram · TikTok · YouTube
            </p>
            <h1 className="font-poster text-[44px] leading-[0.9] text-white">¿Ya lo subiste a tus redes?</h1>
            <p className="text-[15px] leading-relaxed text-white/70">
              Pega el enlace de tu reel, TikTok o vídeo: buscamos de qué concierto y canción es. Luego eliges el vídeo original de tu galería y se ve aquí, en Live Space.
            </p>
          </div>

          <form
            className="space-y-3"
            onSubmit={event => {
              event.preventDefault();
              start(input);
            }}
          >
            <label htmlFor="import-url" className="sr-only">Enlace del clip</label>
            <div className="flex items-center gap-2 rounded-2xl border border-app-line bg-app-surface p-1.5 pl-4 focus-within:border-white/30">
              <input
                id="import-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://www.instagram.com/reel/…"
                value={input}
                onChange={event => {
                  setInput(event.target.value);
                  setInputError('');
                }}
                className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-white/35 focus:outline-none"
              />
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="min-h-11 shrink-0 rounded-xl bg-white/10 px-4 text-[13px] font-semibold text-white"
              >
                Pegar
              </button>
            </div>
            {inputError ? <p className="text-sm text-rose-400" role="alert">{inputError}</p> : null}
            <Button type="submit" size="lg" block disabled={!input.trim() || step.kind === 'loading'}>
              {step.kind === 'loading' ? <Spinner label="Buscando el clip" className="h-4 w-4" /> : null}
              {step.kind === 'loading' ? 'Buscando el clip…' : 'Buscar clip'}
            </Button>
          </form>

          <ol className="space-y-3 rounded-2xl border border-app-line p-4 text-[14px] text-white/75">
            <li className="flex gap-3">
              <span className="font-mono text-app-accent">01</span>
              {isIos
                ? 'En la app, pulsa Compartir y luego Copiar enlace. Vuelve aquí y pulsa Pegar.'
                : 'Más rápido: en la app, pulsa Compartir y elige Live Space.'}
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-app-accent">02</span>
              Te decimos su concierto y su canción.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-app-accent">03</span>
              Elige el vídeo original de tu galería y súbelo.
            </li>
          </ol>
        </div>
      )}

      {reviewing && (
        <div className="flex flex-col gap-6 p-4 pb-[calc(120px+env(safe-area-inset-bottom,0px))]">
          <section className="flex gap-3">
            <div className="relative h-28 w-[84px] shrink-0 overflow-hidden rounded-xl bg-app-surface-strong">
              {reviewing.metadata.thumbnailUrl ? (
                <img src={reviewing.metadata.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                <PlatformIcon source={reviewing.metadata.source} size={36} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/30" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
                <PlatformIcon source={reviewing.metadata.source} size={13} />
                {SOURCE_LABEL[reviewing.metadata.source]}
              </p>
              <p className="mt-1 font-display text-[17px] font-bold text-white">
                {reviewing.metadata.authorHandle ? `@${reviewing.metadata.authorHandle}` : reviewing.metadata.authorName || 'Clip enlazado'}
              </p>
              {reviewing.metadata.title ? (
                <p className="mt-1 line-clamp-3 text-[14px] leading-snug text-white/70">{reviewing.metadata.title}</p>
              ) : (
                <p className="mt-1 text-[13px] text-white/50">
                  Sin descripción.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-white">
                {selectedEvent && !choosing ? 'Concierto' : '¿De qué concierto es?'}
              </h2>
              {selectedEvent && !choosing ? (
                <button type="button" className="min-h-11 px-1 text-[13px] font-semibold text-app-accent" onClick={() => setChoosing(true)}>
                  Cambiar
                </button>
              ) : null}
            </div>

            {selectedEvent && !choosing ? (
              <div className="space-y-2 rounded-2xl border border-app-accent/50 bg-app-accent/10 p-3">
                <ConcertRow event={selectedEvent} />
                {reviewing.resolution.event?.id === selectedEvent.id && reviewing.resolution.reason ? (
                  <p className="text-[13px] text-white/70">
                    {reviewing.resolution.method === 'tag' ? 'Por la etiqueta ' : 'Por la fecha y '}
                    <span className={reviewing.resolution.method === 'tag' ? 'font-mono text-white' : 'text-white'}>
                      {reviewing.resolution.reason}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {[reviewing.resolution.event, ...reviewing.resolution.suggestions]
                  .filter((candidate): candidate is ConcertCandidate => !!candidate)
                  .map(candidate => (
                    <ConcertRow
                      key={candidate.id}
                      event={candidate}
                      selected={selectedEvent?.id === candidate.id}
                      onSelect={() => {
                        setSelectedEvent(candidate);
                        setSongPosition(null);
                        setChoosing(false);
                      }}
                    />
                  ))}
                {!reviewing.resolution.event && reviewing.resolution.suggestions.length === 0 ? (
                  <div className="space-y-3 rounded-2xl border border-app-line p-4">
                    <p className="text-[14px] text-white/70">
                      No encontramos conciertos tuyos cerca de esa fecha. Guarda el concierto o marca que fuiste y vuelve aquí.
                    </p>
                    <Button variant="secondary" onClick={() => navigate('/tabs/events')}>Ver conciertos</Button>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {selectedEvent && !choosing ? (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-bold text-white">Canción</h2>
              {setlistLoading ? (
                <Spinner />
              ) : setlist.length === 0 ? (
                <p className="text-[14px] text-white/55">Este concierto aún no tiene setlist. Lo colocaremos por la hora.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={songPosition === null}
                    onClick={() => setSongPosition(null)}
                    className={`min-h-11 rounded-full border px-4 text-[13px] font-semibold ${
                      songPosition === null ? 'border-white bg-white text-[#14151a]' : 'border-app-line text-white/75'
                    }`}
                  >
                    No sé
                  </button>
                  {setlist.map(entry => (
                    <button
                      key={entry.ordinal}
                      type="button"
                      aria-pressed={songPosition === entry.ordinal}
                      onClick={() => setSongPosition(entry.ordinal)}
                      className={`min-h-11 max-w-full rounded-full border px-4 text-left text-[13px] font-semibold ${
                        songPosition === entry.ordinal
                          ? 'border-app-accent bg-app-accent text-[#14151a]'
                          : 'border-app-line text-white/85'
                      }`}
                    >
                      <span className="mr-1.5 font-mono opacity-70">{String(entry.ordinal).padStart(2, '0')}</span>
                      {entry.song_title || 'Canción'}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <div className="fixed inset-x-0 bottom-0 z-[1300] border-t border-app-line bg-app-bg/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-xl">
            <Button size="lg" block disabled={!selectedEvent || choosing} onClick={pickOriginal}>
              Elegir el vídeo de mi galería
            </Button>
            <p className="mt-2 text-center text-[12px] text-white/50">
              El original que grabaste, en su concierto al momento.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Import;
