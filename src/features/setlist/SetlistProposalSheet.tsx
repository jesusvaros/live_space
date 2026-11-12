import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconCamera } from '../../components/icons';
import { Modal, Spinner } from '../../components/ui/AppPrimitives';
import { recognizeImageText, usesNativeOcr } from '../wrapped/recognizeText';
import {
  MAX_SETLIST_TITLE_LENGTH,
  MAX_SETLIST_TITLES,
  setlistLines,
  validateSetlistTitles,
} from '../../shared/setlist/titles';
import { ocrBlocksToSetlistLines } from './ocrLines';
import { submitSetlistProposal, type SubmitResult } from './setlistProposals';

// «¿Tienes el setlist? Propónlo»: one song per line, typed or read from a
// photo (on-device OCR, the image is not uploaded). Sending creates a
// proposal that the artist, the venue or moderation approve before it shows.

const SUBMIT_ERRORS: Partial<Record<SubmitResult['kind'], string>> = {
  rate_limited: 'Ya has enviado muchos setlists hoy. Vuelve a probar mañana.',
  not_attended: 'Marca que fuiste al concierto para proponer su setlist.',
  not_started: 'El setlist se puede proponer cuando empiece el concierto.',
  setlist_locked: 'Este concierto ya tiene su setlist oficial.',
  invalid_titles: 'Revisa la lista: entre 1 y 60 canciones, una por línea.',
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
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'pending' | 'approved' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setText((initialTitles || []).join('\n'));
    setError('');
    setDone(null);
  }, [isOpen]);

  const checked = useMemo(() => validateSetlistTitles(setlistLines(text)), [text]);
  const preview = checked.ok ? checked.titles : [];

  const readPhoto = async (file: File) => {
    setReading(true);
    setError('');
    try {
      const lines = ocrBlocksToSetlistLines(await recognizeImageText(file));
      if (lines.length === 0) {
        setError('No hemos leído canciones en la foto. Prueba con otra más nítida o escríbelas.');
        return;
      }
      setText(current => (current.trim() ? `${current.trimEnd()}\n${lines.join('\n')}` : lines.join('\n')));
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
                Una canción por línea, en el orden en que sonaron. Lo revisa el artista o moderación antes de publicarlo.
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

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">Canciones</span>
              <textarea
                value={text}
                onChange={event => setText(event.target.value)}
                rows={8}
                placeholder={'Primera canción\nSegunda canción\n…'}
                className="rounded-xl border border-app-line bg-app-surface px-4 py-3 text-[15px] leading-relaxed text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none"
              />
            </label>

            {preview.length > 0 ? (
              <div>
                <p className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/55">
                  Así queda · {preview.length} {preview.length === 1 ? 'canción' : 'canciones'}
                </p>
                <ol aria-label="Vista previa del setlist" className="m-0 flex list-none flex-col gap-1 p-0">
                  {preview.map((title, index) => (
                    <li key={`${index}-${title}`} className="flex items-baseline gap-3 text-[14px] text-app-ink">
                      <span className="w-6 shrink-0 font-mono text-[12px] font-semibold text-[#8f8b84]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 break-words">{title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="m-0 text-sm text-[#ff8a6b]">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sending || reading || !text.trim()}
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
