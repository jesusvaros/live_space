import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconCamera, IconChevronDown, IconChevronUp, IconPlus } from '../../components/icons';
import { Modal, Spinner } from '../../components/ui/AppPrimitives';
import { recognizeImageText, usesNativeOcr } from '../wrapped/recognizeText';
import {
  isSetlistJunk,
  normalizeSetlistLine,
  MAX_SETLIST_TITLE_LENGTH,
  MAX_SETLIST_TITLES,
  setlistLines,
  validateSetlistTitles,
} from '../../shared/setlist/titles';
import { ocrBlocksToSetlistLines } from './ocrLines';
import { submitSetlistProposal, type SubmitResult } from './setlistProposals';

// «¿Tienes el setlist? Propónlo»: a list of songs, one item each (edit,
// reorder with ↑ ↓, remove), typed or read from a photo (on-device OCR, the image is not uploaded). Sending creates a
// proposal that the artist, the venue or moderation approve before it shows.

const SUBMIT_ERRORS: Partial<Record<SubmitResult['kind'], string>> = {
  rate_limited: 'Ya has enviado muchos setlists hoy. Vuelve a probar mañana.',
  not_attended: 'Marca que fuiste al concierto para proponer su setlist.',
  not_started: 'El setlist se puede proponer cuando empiece el concierto.',
  setlist_locked: 'Este concierto ya tiene su setlist oficial.',
  invalid_titles: 'Revisa la lista: entre 1 y 60 canciones.',
  signed_out: 'Entra en tu cuenta para proponer el setlist.',
  unavailable: 'Todavía no podemos recibir setlists. Vuelve a probar en unos días.',
  error: 'No se ha podido enviar. Inténtalo de nuevo.',
};

const validationMessage = (result: ReturnType<typeof validateSetlistTitles>) => {
  if (result.ok) return '';
  switch (result.reason) {
    case 'too_many':
      return `Como mucho ${MAX_SETLIST_TITLES} canciones.`;
    case 'too_long':
      return `«${result.line?.slice(0, 30)}…» es demasiado largo (máximo ${MAX_SETLIST_TITLE_LENGTH} caracteres).`;
    case 'control':
      return 'Hay caracteres raros en la lista. Bórralos y vuelve a probar.';
    default:
      return 'Escribe al menos una canción.';
  }
};

type Song = { id: string; title: string };

let songSeq = 0;
const toSongs = (titles: readonly string[]): Song[] => titles.map(title => ({ id: `song-${(songSeq += 1)}`, title }));

type SetlistProposalSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  /** Prefill: the current audience setlist or their pending proposal. */
  initialTitles?: readonly string[];
  /** Correcting an existing setlist rather than adding the first one. */
  correcting?: boolean;
  onSubmitted?: (result: Extract<SubmitResult, { titles: string[] }>) => void;
};

const SetlistProposalSheet: React.FC<SetlistProposalSheetProps> = ({
  isOpen,
  onClose,
  eventId,
  initialTitles,
  correcting = false,
  onSubmitted,
}) => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [draft, setDraft] = useState('');
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'pending' | 'approved' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSongs(toSongs(initialTitles || []));
    setDraft('');
    setError('');
    setDone(null);
  }, [isOpen]);

  // The typed-but-not-added line counts too, so «Enviar» never drops it.
  const allTitles = useMemo(() => [...songs.map(song => song.title), draft].join('\n'), [songs, draft]);
  const checked = useMemo(() => validateSetlistTitles(setlistLines(allTitles)), [allTitles]);

  // New lines (typed, pasted or read) become items, cleaned like before:
  // numbering and «Setlist» / «Encore» headers go.
  const addLines = (value: string) => {
    const lines = setlistLines(value).map(normalizeSetlistLine).filter(line => line && !isSetlistJunk(line));
    if (lines.length) setSongs(current => [...current, ...toSongs(lines)]);
  };
  const addDraft = () => {
    addLines(draft);
    setDraft('');
  };
  const rename = (id: string, title: string) =>
    setSongs(current => current.map(song => (song.id === id ? { ...song, title } : song)));
  const remove = (id: string) => setSongs(current => current.filter(song => song.id !== id));
  const move = (index: number, by: -1 | 1) =>
    setSongs(current => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const readPhoto = async (file: File) => {
    setReading(true);
    setError('');
    try {
      const lines = ocrBlocksToSetlistLines(await recognizeImageText(file));
      if (lines.length === 0) {
        setError('No hemos leído canciones en la foto. Prueba con otra más nítida o escríbelas.');
        return;
      }
      setSongs(current => [...current, ...toSongs(lines)]);
    } catch {
      setError('No hemos podido leer la foto. Comprueba tu conexión e inténtalo otra vez.');
    } finally {
      setReading(false);
    }
  };

  const send = async () => {
    if (!checked.ok) {
      setError(validationMessage(checked));
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await submitSetlistProposal(eventId, checked.titles);
      if (result.kind === 'pending' || result.kind === 'approved') {
        setDone(result.kind);
        onSubmitted?.(result);
        return;
      }
      setError(SUBMIT_ERRORS[result.kind] ?? SUBMIT_ERRORS.error ?? '');
    } catch {
      setError(SUBMIT_ERRORS.error ?? '');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.95} title="Proponer el setlist">
      <div className="max-h-[90dvh] overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        {done ? (
          <div className="flex flex-col gap-4 pb-2">
            <h3 className="m-0 font-display text-2xl font-bold text-app-ink">{done === 'approved' ? 'Setlist guardado' : 'Enviado'}</h3>
            <p className="m-0 text-sm text-[#c9c5bd]">
              {done === 'approved'
                ? 'Ya está en el concierto.'
                : 'Enviado. Lo verá el artista o moderación antes de publicarlo.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="flex h-12 w-full items-center justify-center rounded-full bg-app-accent text-base font-bold text-[#14151a]"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={event => {
              event.preventDefault();
              void send();
            }}
          >
            <div>
              <h3 className="m-0 font-display text-2xl font-bold text-app-ink">
                {correcting ? 'Corregir el setlist' : '¿Qué canciones tocaron?'}
              </h3>
              <p className="m-0 mt-1.5 text-sm text-[#c9c5bd]">
                En el orden en que sonaron: ordénalas con las flechas. Lo revisa el artista o moderación antes de publicarlo.
              </p>
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              data-testid="setlist-photo-input"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void readPhoto(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={reading}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-app-line text-sm font-semibold text-app-ink disabled:opacity-60"
            >
              {reading ? <Spinner className="h-4 w-4" label="Leyendo" /> : <IconCamera size={18} />}
              {reading ? 'Leyendo la foto…' : 'Escanear una foto del setlist'}
            </button>
            {reading ? (
              <p className="m-0 -mt-2 text-center text-[12px] text-white/50">
                {usesNativeOcr() ? 'Se lee en tu móvil: la foto no se sube.' : 'La primera vez tarda un poco más. La foto no se sube.'}
              </p>
            ) : null}

            <div>
              <p className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/55">
                {songs.length ? `Canciones · ${songs.length}` : 'Canciones'}
              </p>
              <ol aria-label="Canciones del setlist" className="m-0 flex list-none flex-col gap-1.5 p-0">
                {songs.map((song, index) => (
                  <li key={song.id} className="flex items-center gap-1.5 rounded-xl border border-app-line bg-app-surface py-1 pl-3 pr-1">
                    <span className="w-6 shrink-0 font-mono text-[12px] font-semibold text-[#8f8b84]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <input
                      value={song.title}
                      aria-label={`Canción ${index + 1}`}
                      onChange={event => rename(song.id, event.target.value)}
                      className="min-h-10 min-w-0 flex-1 bg-transparent text-[15px] text-app-ink focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={`Mover arriba ${song.title || 'canción'}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="flex h-10 w-9 items-center justify-center text-[#c9c5bd] disabled:opacity-25"
                    >
                      <IconChevronUp size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover abajo ${song.title || 'canción'}`}
                      disabled={index === songs.length - 1}
                      onClick={() => move(index, 1)}
                      className="flex h-10 w-9 items-center justify-center text-[#c9c5bd] disabled:opacity-25"
                    >
                      <IconChevronDown size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar ${song.title || 'canción'}`}
                      onClick={() => remove(song.id)}
                      className="flex h-10 w-9 items-center justify-center text-[#8f8b84]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </li>
                ))}
                <li className="flex items-center gap-1.5 rounded-xl border border-dashed border-app-line py-1 pl-3 pr-1">
                  <span className="w-6 shrink-0 font-mono text-[12px] font-semibold text-[#8f8b84]">
                    {String(songs.length + 1).padStart(2, '0')}
                  </span>
                  <input
                    value={draft}
                    placeholder="Añadir canción"
                    aria-label="Añadir canción"
                    enterKeyHint="enter"
                    onChange={event => setDraft(event.target.value)}
                    onPaste={event => {
                      // A pasted list: one item per line.
                      const pasted = event.clipboardData.getData('text');
                      if (!pasted.includes('\n')) return;
                      event.preventDefault();
                      addLines(`${draft}${pasted}`);
                      setDraft('');
                    }}
                    onKeyDown={event => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      addDraft();
                    }}
                    className="min-h-10 min-w-0 flex-1 bg-transparent text-[15px] text-app-ink placeholder:text-white/35 focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Añadir"
                    disabled={!draft.trim()}
                    onClick={addDraft}
                    className="flex h-10 w-10 items-center justify-center text-app-accent disabled:opacity-30"
                  >
                    <IconPlus size={18} />
                  </button>
                </li>
              </ol>
            </div>

            {error ? (
              <p role="alert" className="m-0 text-sm text-[#ff8a6b]">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sending || reading || !allTitles.trim()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-app-accent text-base font-bold text-[#14151a] disabled:opacity-50"
            >
              {sending ? <Spinner className="h-4 w-4" /> : null}
              Enviar setlist
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default SetlistProposalSheet;
