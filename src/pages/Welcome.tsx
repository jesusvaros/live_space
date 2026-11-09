import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { readReturnTo } from '../auth/returnTo';
import AuthPanel, { authErrorToSpanish, type AuthPanelResult } from '../auth/AuthPanel';

// Sign-in / sign-up screen of the app. Same look as the public landing:
// concert photo, accent #ff5b2e, short Spanish copy.

const ACCENT = '#ff5b2e';

const Welcome: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const linkError = searchParams.get('error');

  const handleDone = (result: AuthPanelResult) => {
    if (result === 'confirmation-sent') return;
    const returnTo = readReturnTo();
    // A brand-new account sets up its agenda first, unless it was on its way
    // somewhere (an upload, a claim…).
    if (result === 'signed-up' && returnTo === '/tabs/events') {
      navigate('/empezar', { replace: true, state: { returnTo: '/tabs/events' } });
      return;
    }
    navigate(returnTo, { replace: true });
  };

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
          <p className="m-0 text-base text-white/75">Tus fotos y vídeos del concierto, ordenados por canción.</p>
        </div>

        <AuthPanel
          key={location.key}
          defaultMode="signin"
          initialError={linkError ? authErrorToSpanish(linkError) : ''}
          onDone={handleDone}
        />

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
