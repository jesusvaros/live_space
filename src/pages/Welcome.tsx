import React, { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/ui/AppPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { readReturnTo } from '../auth/returnTo';
import { supabase } from '../lib/supabase';
import { fetchEnabledProviders, signInWithProvider, type OAuthProvider } from '../auth/nativeAuth';

// Sign-in / sign-up screen of the app. Same look as the public landing:
// concert photo, accent #ff5b2e, short Spanish copy.

type Mode = 'signin' | 'signup';

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

const toSpanish = (message: string) =>
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

const Field: React.FC<{
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  optional?: boolean;
}> = ({ label, type = 'text', value, onChange, autoComplete, placeholder, optional }) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-white/80">
        {label}
        {optional ? <span className="font-normal text-white/50"> (opcional)</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-2xl border border-white/15 bg-black/40 px-4 text-base text-white placeholder:text-white/35 focus:border-[#ff5b2e] focus:outline-none focus:ring-2 focus:ring-[#ff5b2e]/30"
      />
    </div>
  );
};

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, sendPasswordReset } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [primaryCity, setPrimaryCity] = useState('');
  const [busy, setBusy] = useState<null | 'email' | OAuthProvider | 'reset'>(null);
  const location = useLocation();
  // Arrived from a concert QR without an account.
  const fromConcertQr = readReturnTo().startsWith('/tabs/upload');
  const linkError = searchParams.get('error');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [providers, setProviders] = useState<Record<OAuthProvider, boolean>>({ google: false, apple: false });

  // Errors from auth links (expired email link, cancelled Google/Apple).
  useEffect(() => {
    if (linkError) setError(toSpanish(linkError));
  }, [linkError, location.key]);

  useEffect(() => {
    let active = true;
    fetchEnabledProviders().then((enabled) => {
      if (active) setProviders(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setShowReset(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!email || !password || (mode === 'signup' && !username)) {
      setError(mode === 'signup' ? 'Rellena email, contraseña y nombre de usuario.' : 'Rellena email y contraseña.');
      return;
    }
    setBusy('email');
    try {
      if (mode === 'signup') {
        const { error: signUpError } = await signUp(email, password, { username, displayName, primaryCity });
        if (signUpError) {
          setError(toSpanish(signUpError.message));
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setNotice('Te hemos enviado un email para confirmar la cuenta. Ábrelo desde este móvil y volverás a la app.');
          return;
        }
        navigate('/empezar', { replace: true, state: { returnTo: '/tabs/events' } });
        return;
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(toSpanish(signInError.message));
          return;
        }
      }
      navigate(readReturnTo(), { replace: true });
    } catch {
      setError('Algo ha fallado. Vuelve a intentarlo.');
    } finally {
      setBusy(null);
    }
  };

  const handleProvider = async (provider: OAuthProvider) => {
    setError('');
    setBusy(provider);
    try {
      const { error: providerError } = await signInWithProvider(provider);
      if (providerError) setError(toSpanish(providerError.message));
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    setError('');
    setNotice('');
    if (!email) {
      setError('Escribe tu email y te mandamos el enlace.');
      return;
    }
    setBusy('reset');
    try {
      const { error: resetError } = await sendPasswordReset(email);
      if (resetError) setError(toSpanish(resetError.message));
      else setNotice('Te hemos enviado un enlace para cambiar la contraseña.');
    } finally {
      setBusy(null);
    }
  };

  const anyProvider = providers.google || providers.apple;

  return (
    <div className="relative h-dvh overflow-y-auto bg-[#0d0e12] text-white">
      <img src="/auth/fondo-login.jpg" alt="" className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-70" />
      <div
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgba(13,14,18,0.35)_0%,rgba(13,14,18,0.75)_35%,#0d0e12_70%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex min-h-full w-full max-w-md flex-col gap-7 px-5 pb-[calc(32px+env(safe-area-inset-bottom,0px))] pt-[calc(28px+env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="14" cy="14" r="12" fill="none" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="14" cy="14" r="4.5" fill={ACCENT} />
          </svg>
          <span className="font-display text-xl font-bold">Live Space</span>
        </div>

        <div className="mt-[18vh] flex flex-col gap-3">
          <h1 className="m-0 font-display text-[44px] font-bold uppercase leading-[0.95] tracking-tight">
            Lo grabaste.
            <br />
            <span style={{ color: ACCENT }}>Súbelo.</span>
          </h1>
          <p className="m-0 text-base text-white/75">
            {fromConcertQr
              ? 'Entra o crea tu cuenta en un minuto y sube lo que grabes en este concierto.'
              : 'Tus fotos y vídeos del concierto, ordenados por canción.'}
          </p>
        </div>

        {anyProvider ? (
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
            <p className="m-0 flex items-center gap-3 text-sm text-white/50" aria-hidden="true">
              <span className="h-px flex-1 bg-white/15" />o con tu email<span className="h-px flex-1 bg-white/15" />
            </p>
          </div>
        ) : null}

        <div role="tablist" aria-label="Acceso" className="grid grid-cols-2 gap-1 rounded-full bg-white/10 p-1">
          {(['signin', 'signup'] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              onClick={() => switchMode(item)}
              className={`min-h-11 rounded-full border-0 text-sm font-semibold transition-colors ${
                mode === item ? 'bg-white text-black' : 'bg-transparent text-white/70'
              }`}
            >
              {item === 'signin' ? 'Entrar' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {mode === 'signup' ? (
            <>
              <Field label="Nombre de usuario" value={username} onChange={setUsername} autoComplete="username" placeholder="tunombre" />
              <Field label="Cómo te llamamos" value={displayName} onChange={setDisplayName} autoComplete="name" optional />
              <Field label="Tu ciudad" value={primaryCity} onChange={setPrimaryCity} autoComplete="address-level2" placeholder="Madrid" optional />
            </>
          ) : null}
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="tu@email.com" />
          <Field
            label="Contraseña"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : ''}
          />

          {error ? <p role="alert" className="m-0 text-sm text-[#ffb4a0]">{error}</p> : null}
          {notice ? <p role="status" className="m-0 text-sm text-emerald-300">{notice}</p> : null}

          <button
            type="submit"
            disabled={busy !== null}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border-0 text-lg font-semibold text-[#0d0e12] disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {busy === 'email' ? <Spinner /> : null}
            {mode === 'signup' ? 'Crear cuenta' : 'Entrar'}
          </button>

          {mode === 'signin' ? (
            showReset ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={busy !== null}
                className="min-h-11 rounded-full border border-white/20 bg-transparent text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === 'reset' ? 'Enviando…' : 'Enviarme el enlace para cambiarla'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="min-h-11 border-0 bg-transparent text-sm font-semibold text-white/70"
              >
                ¿Has olvidado la contraseña?
              </button>
            )
          ) : null}
        </form>

        <button
          type="button"
          onClick={() => navigate('/tabs/events')}
          className="mt-auto min-h-11 border-0 bg-transparent text-sm text-white/60"
        >
          Seguir sin cuenta
        </button>
      </main>
    </div>
  );
};

export default Welcome;
