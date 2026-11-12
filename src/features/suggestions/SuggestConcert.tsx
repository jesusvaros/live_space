import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AuthPanel from '../../auth/AuthPanel';
import { rememberReturnTo } from '../../auth/returnTo';
import { IconChevronRight, IconTicket } from '../../components/icons';
import { Modal, Spinner } from '../../components/ui/AppPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { MAX_SUGGESTION_NOTE_LENGTH, normalizeSuggestionUrl } from '../../shared/suggestions/url';
import {
  hasSuggestDraft,
  saveSuggestDraft,
  sendEventLinkSuggestion,
  takeSuggestDraft,
  type SuggestResult,
} from './suggestEventLink';

// «¿No encuentras un concierto? Pásanos el link de las entradas»: a card in
// the search results that opens a sheet with the link and an optional note.
// Without an account the same sheet asks for one (deferred login, as at
// «Publicar» in Upload) and sends what was typed once they are in.

export const SuggestConcertCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-4 py-3 text-left"
  >
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-accent/[0.12] text-app-accent">
      <IconTicket size={18} />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-app-ink">¿No encuentras un concierto?</span>
      <span className="block text-xs text-white/55">Pásanos el link de las entradas</span>
    </span>
    <IconChevronRight size={18} className="shrink-0 text-white/40" />
  </button>
);

const RESULT_ERRORS: Partial<Record<SuggestResult, string>> = {
  invalid_url: 'Pega un link que empiece por http:// o https://.',
  rate_limited: 'Ya nos has pasado muchos links hoy. Vuelve a probar mañana.',
  unavailable: 'Todavía no podemos recibir links. Vuelve a probar en unos días.',
  error: 'No se ha podido enviar. Inténtalo de nuevo.',
};

type Step = 'form' | 'auth' | 'done';

type SuggestConcertSheetProps = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export const SuggestConcertSheet: React.FC<SuggestConcertSheetProps> = ({ isOpen, onOpen, onClose }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [alreadySent, setAlreadySent] = useState(false);
  const sendAfterAuth = useRef(false);

  // Back from signing in with Google/Apple or an email link: the sheet opens
  // again with what they had typed.
  // (Signed in from the sheet itself: the effect below sends it.)
  useEffect(() => {
    if (!user || sendAfterAuth.current || !hasSuggestDraft()) return;
    const draft = takeSuggestDraft();
    if (!draft) return;
    setUrl(draft.url);
    setNote(draft.note);
    setStep('form');
    onOpen();
  }, [user]);

  const reset = () => {
    setUrl('');
    setNote('');
    setStep('form');
    setError('');
    setAlreadySent(false);
    sendAfterAuth.current = false;
  };

  const close = () => {
    onClose();
    if (step === 'done') reset();
    // Closed while signing in: nothing is sent behind their back; the saved
    // draft reopens the sheet if they sign in within the next minutes.
    if (step === 'auth') {
      sendAfterAuth.current = false;
      setStep('form');
    }
  };

  const send = async () => {
    setError('');
    if (!normalizeSuggestionUrl(url)) {
      setError(RESULT_ERRORS.invalid_url ?? '');
      return;
    }
    if (!user) {
      // Nothing is saved without an account. Keep what they typed and come
      // back here after signing in.
      rememberReturnTo(`${location.pathname}${location.search}`);
      saveSuggestDraft({ url, note });
      sendAfterAuth.current = true;
      setStep('auth');
      return;
    }
    setSending(true);
    try {
      const result = await sendEventLinkSuggestion(url, note);
      if (result === 'sent' || result === 'already_sent') {
        takeSuggestDraft();
        setAlreadySent(result === 'already_sent');
        setStep('done');
        return;
      }
      if (result === 'signed_out') {
        setStep('auth');
        return;
      }
      setError(RESULT_ERRORS[result] ?? RESULT_ERRORS.error ?? '');
    } catch {
      setError(RESULT_ERRORS.error ?? '');
    } finally {
      setSending(false);
    }
  };

  // Signed in from the sheet (email here): send what was waiting.
  useEffect(() => {
    if (!user || step !== 'auth' || !sendAfterAuth.current) return;
    sendAfterAuth.current = false;
    setStep('form');
    void send();
  }, [user, step]);

  return (
    <Modal isOpen={isOpen} onDidDismiss={close} initialBreakpoint={0.9} title="Pásanos el link del concierto">
      <div className="max-h-[90dvh] overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden />

        {step === 'done' ? (
          <div className="flex flex-col gap-4 pb-2">
            <h3 className="m-0 font-display text-2xl font-bold text-app-ink">¡Recibido!</h3>
            <p className="m-0 text-sm text-[#c9c5bd]">
              {alreadySent ? 'Ya nos habías pasado este link. ' : ''}
              Gracias. Lo buscaremos en el próximo repaso de conciertos y te avisamos.
            </p>
            <button
              type="button"
              onClick={close}
              className="flex h-12 w-full items-center justify-center rounded-full bg-app-accent text-base font-bold text-[#14151a]"
            >
              Cerrar
            </button>
          </div>
        ) : step === 'auth' ? (
          <div>
            <h3 className="m-0 font-display text-2xl font-bold text-app-ink">Último paso</h3>
            <p className="m-0 mt-1.5 text-sm text-[#c9c5bd]">
              Crea tu cuenta o entra para enviarnos el link. Así te avisamos cuando el concierto esté en Live Space.
            </p>
            <div className="mt-5">
              <AuthPanel
                defaultMode="signup"
                minimal
                confirmationNotice="Te hemos enviado un email. Pulsa el enlace en este móvil y te traemos aquí con el link que pegaste. Si lo abres en otro dispositivo, vuelve aquí y pulsa «Entrar»."
                providerReturnPath={`${location.pathname}${location.search}`}
                beforeProviderRedirect={async () => saveSuggestDraft({ url, note })}
              />
            </div>
            <button type="button" onClick={() => setStep('form')} className="mt-4 min-h-11 w-full text-sm font-semibold text-white/60">
              Volver
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
              <h3 className="m-0 font-display text-2xl font-bold text-app-ink">¿Qué concierto falta?</h3>
              <p className="m-0 mt-1.5 text-sm text-[#c9c5bd]">
                Pega el link de la página donde se venden las entradas: la web de la sala, Entradium, DICE…
              </p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">Link de las entradas</span>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={url}
                onChange={event => setUrl(event.target.value)}
                placeholder="https://"
                className="min-h-12 rounded-xl border border-app-line bg-app-surface px-4 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/55">Nota (opcional)</span>
              <textarea
                value={note}
                maxLength={MAX_SUGGESTION_NOTE_LENGTH}
                onChange={event => setNote(event.target.value)}
                rows={3}
                placeholder="Por ejemplo: es el segundo pase, a las 23:00"
                className="rounded-xl border border-app-line bg-app-surface px-4 py-3 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none"
              />
            </label>
            {error ? (
              <p role="alert" className="m-0 text-sm text-[#ff8a6b]">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sending || !url.trim()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-app-accent text-base font-bold text-[#14151a] disabled:opacity-50"
            >
              {sending ? <Spinner className="h-4 w-4" /> : null}
              Enviar
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
};
