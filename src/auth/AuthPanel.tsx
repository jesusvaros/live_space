import React, { useEffect, useId, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link } from 'react-router-dom';
import { legalAppPath } from '../features/legal/paths';
import { Spinner } from '../components/ui/AppPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { fetchEnabledProviders, signInWithProvider, type OAuthProvider } from './nativeAuth';
import { track } from '../features/analytics/analytics';
import { rememberPendingSignIn, trackSignInTap } from '../features/analytics/signInEvents';
import { continueWithEmail, validateEmailForm } from './emailFlow';

// Sign-in / sign-up block: the account sheet (askForAccount), /welcome, the
// first-run onboarding and «Publicar» after a QR upload. Google and Apple
// first; «Continuar con email» opens one email + password box that signs in
// or creates the account. Nothing else is asked: the @username is made on the
// server and the rest (name, city, photo) is optional, later, in Ajustes.
//
// Google/Apple finish outside this component (deep link on the app, full page
// redirect on the web): the parent notices the new session through useAuth.

export type AuthPanelResult = 'signed-in' | 'signed-up' | 'confirmation-sent';

const ACCENT = '#ff5b2e';

const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirma tu email antes de entrar: revisa tu bandeja de entrada.'],
  [/already registered|already been registered/i, 'Ya hay una cuenta con ese email. Prueba a entrar.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
  [/rate limit|too many/i, 'Demasiados intentos. Espera un momento y vuelve a probar.'],
  [/username/i, 'Ese nombre de usuario no está disponible.'],
  [/expired|invalid.*link|link.*invalid/i, 'El enlace ha caducado o ya se usó. Pide uno nuevo.'],
  [/access_denied|cancel/i, 'Has cancelado el acceso. Puedes intentarlo de nuevo.'],
];

export const authErrorToSpanish = (message: string) =>
  ERROR_MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? 'Algo ha fallado. Vuelve a intentarlo.';

const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

const AppleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.37 12.71c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.66-2.15.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.54zM14.18 6.24c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.68-.92 2.68.97.07 1.96-.49 2.56-1.23z" />
  </svg>
);

const MailGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);

const inputClass =
  'min-h-12 w-full rounded-2xl border border-white/15 bg-black/40 px-4 text-base text-white placeholder:text-white/40 focus:border-[#ff5b2e] focus:outline-none focus:ring-2 focus:ring-[#ff5b2e]/30';

type AuthPanelProps = {
  // Shown when the email link must be pressed before entering.
  confirmationNotice?: string;
  // Error carried in from an auth link (?error= on /welcome).
  initialError?: string;
  // Email sign-in / sign-up finished here (Google/Apple do not come back here).
  onDone?: (result: AuthPanelResult) => void;
  // Runs before the browser leaves the page for Google/Apple (web only), so
  // whatever the user was doing can be saved first.
  beforeProviderRedirect?: () => Promise<void>;
  // Where Google/Apple bring the user back to on the web.
  providerReturnPath?: string;
};

const AuthPanel: React.FC<AuthPanelProps> = ({
  confirmationNotice = 'Te hemos mandado un email. Pulsa el enlace y vuelve aquí.',
  initialError = '',
  onDone,
  beforeProviderRedirect,
  providerReturnPath,
}) => {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | OAuthProvider | 'reset'>(null);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [wrongPassword, setWrongPassword] = useState(false);
  const [providers, setProviders] = useState<Record<OAuthProvider, boolean>>({ google: false, apple: false });
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  useEffect(() => {
    let active = true;
    fetchEnabledProviders()
      .then((enabled) => {
        if (active) setProviders(enabled);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setProvidersLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setWrongPassword(false);
    const invalid = validateEmailForm(email, password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy('email');
    trackSignInTap('email');
    try {
      const outcome = await continueWithEmail({ signIn, signUp: (address, secret) => signUp(address, secret) }, email, password);
      if (outcome.kind === 'signed-in') {
        track('sign_in', { provider: 'email', mode: 'signin' });
        onDone?.('signed-in');
      } else if (outcome.kind === 'signed-up') {
        track('sign_in', { provider: 'email', mode: 'signup', confirmed: true });
        onDone?.('signed-up');
      } else if (outcome.kind === 'confirmation-sent') {
        track('sign_in', { provider: 'email', mode: 'signup', confirmed: false });
        setNotice(confirmationNotice);
        onDone?.('confirmation-sent');
      } else if (outcome.kind === 'wrong-password') {
        track('sign_in_failed', { provider: 'email', reason: 'wrong_password' });
        setWrongPassword(true);
        setError('Esa contraseña no es la de tu cuenta.');
      } else {
        track('sign_in_failed', { provider: 'email' });
        setError(authErrorToSpanish(outcome.message));
      }
    } catch {
      track('sign_in_failed', { provider: 'email' });
      setError('Algo ha fallado. Vuelve a intentarlo.');
    } finally {
      setBusy(null);
    }
  };

  const handleProvider = async (provider: OAuthProvider) => {
    setError('');
    setBusy(provider);
    trackSignInTap(provider);
    try {
      const native = Capacitor.isNativePlatform();
      if (!native) await beforeProviderRedirect?.();
      // Through a page (the web redirect leaves this one; the in-app browser
      // comes back by deep link) the sign-in counts when the session lands.
      if (!native) rememberPendingSignIn(provider);
      const { error: providerError, outcome } = await signInWithProvider(provider, providerReturnPath);
      if (native && outcome === 'redirecting') rememberPendingSignIn(provider);
      if (outcome === 'signed-in') track('sign_in', { provider, via: 'native' });
      else if (outcome === 'cancelled') track('sign_in_cancelled', { provider });
      if (providerError) {
        track('sign_in_failed', { provider });
        setError(authErrorToSpanish(providerError.message));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    setError('');
    setNotice('');
    setBusy('reset');
    try {
      const { error: resetError } = await sendPasswordReset(email.trim().toLowerCase());
      if (resetError) setError(authErrorToSpanish(resetError.message));
      else setNotice('Te hemos mandado un enlace para cambiarla.');
    } finally {
      setBusy(null);
    }
  };

  const anyProvider = providers.google || providers.apple;
  // Google/Apple first; the email box only opens on request (or straight
  // away when no provider works on this device).
  const showEmailForm = emailOpen || (providersLoaded && !anyProvider);

  return (
    <div className="flex flex-col gap-3">
      {providers.apple ? (
        <button
          type="button"
          onClick={() => handleProvider('apple')}
          disabled={busy !== null}
          className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-full border-0 bg-white text-base font-semibold text-black disabled:opacity-60"
        >
          {busy === 'apple' ? <Spinner /> : <AppleLogo />}
          Continuar con Apple
        </button>
      ) : null}
      {providers.google ? (
        <button
          type="button"
          onClick={() => handleProvider('google')}
          disabled={busy !== null}
          className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-full border border-white/20 bg-[#17191f] text-base font-semibold text-white disabled:opacity-60"
        >
          {busy === 'google' ? <Spinner /> : <GoogleLogo />}
          Continuar con Google
        </button>
      ) : null}

      {showEmailForm ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <label htmlFor={emailId} className="sr-only">Email</label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            value={email}
            autoComplete="email"
            placeholder="Email"
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
          <label htmlFor={passwordId} className="sr-only">Contraseña</label>
          <input
            id={passwordId}
            type="password"
            value={password}
            autoComplete="current-password"
            placeholder="Contraseña"
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />

          {error ? <p role="alert" className="m-0 text-sm text-[#ffb4a0]">{error}</p> : null}
          {notice ? <p role="status" className="m-0 text-sm text-emerald-300">{notice}</p> : null}

          <button
            type="submit"
            disabled={busy !== null}
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border-0 text-base font-semibold text-[#0d0e12] disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {busy === 'email' ? <Spinner /> : null}
            Continuar
          </button>

          {wrongPassword ? (
            <button
              type="button"
              onClick={handleReset}
              disabled={busy !== null}
              className="min-h-11 border-0 bg-transparent text-sm font-semibold text-white/75 disabled:opacity-60"
            >
              {busy === 'reset' ? 'Enviando…' : 'Mandarme un enlace para cambiarla'}
            </button>
          ) : null}
        </form>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            disabled={busy !== null}
            className="inline-flex min-h-[52px] items-center justify-center gap-2.5 rounded-full border border-white/20 bg-transparent text-base font-semibold text-white disabled:opacity-60"
          >
            <MailGlyph />
            Continuar con email
          </button>
          {error ? <p role="alert" className="m-0 text-sm text-[#ffb4a0]">{error}</p> : null}
        </>
      )}

      <p className="m-0 mt-1 text-center text-xs leading-relaxed text-white/50">
        Al continuar aceptas las{' '}
        <Link to={legalAppPath('condiciones')} className="text-white/75 underline underline-offset-2">Condiciones</Link>
        {' '}y la{' '}
        <Link to={legalAppPath('privacidad')} className="text-white/75 underline underline-offset-2">Privacidad</Link>.
      </p>
    </div>
  );
};

export default AuthPanel;
