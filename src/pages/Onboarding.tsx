import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthPanel, { type AuthPanelResult } from '../auth/AuthPanel';
import { markOnboardingSeen } from '../app/onboarding';
import { useAuth } from '../contexts/AuthContext';
import { track } from '../features/analytics/analytics';

// First open of the app without an account: three photo screens that tell
// what Live Space is for, then the account (Apple, Google or email). Always
// skippable. Someone who arrives through a concert QR never sees it: they
// go straight to Upload (see Upload's QR welcome).

const ACCENT = '#ff5b2e';

const SLIDES = [
  {
    photo: '/fotos/manos-luz-azul.jpg',
    title: ['Lo grabaste.', 'Súbelo.'],
    text: 'Tus fotos y vídeos del concierto, en un solo sitio.',
  },
  {
    photo: '/fotos/franja-luz-roja.jpg',
    title: ['Cada vídeo,', 'a su canción.'],
    text: 'Los colocamos solos por la hora a la que grabaste.',
  },
  {
    photo: '/fotos/multitud-escenario.jpg',
    title: ['Revive el concierto', 'desde todo el público.'],
    text: 'Escanea el QR de la sala y súmate en un minuto.',
  },
];

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const startX = useRef<number | null>(null);
  const onAccount = step === SLIDES.length;

  const finished = useRef(false);
  const done = (result: 'skipped' | 'signed_up' | 'signed_in') => {
    if (finished.current) return;
    finished.current = true;
    track('onboarding_done', { flow: 'intro', result, step });
  };

  useEffect(() => {
    markOnboardingSeen();
  }, []);

  // Slides 0..2, then 3 = the account.
  useEffect(() => {
    track('onboarding_step', { flow: 'intro', step });
  }, [step]);

  // Google/Apple come back through a deep link: leave once the session lands.
  useEffect(() => {
    if (!user) return;
    done('signed_in');
    navigate('/tabs/events', { replace: true });
  }, [user, navigate]);

  const skip = () => {
    done('skipped');
    navigate('/tabs/events', { replace: true });
  };

  const handleDone = (result: AuthPanelResult) => {
    if (result === 'signed-up') {
      done('signed_up');
      navigate('/empezar', { replace: true, state: { returnTo: '/tabs/events' } });
    } else if (result === 'signed-in') {
      done('signed_in');
      navigate('/tabs/events', { replace: true });
    }
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    if (startX.current === null || onAccount) return;
    const delta = event.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (delta < -50) setStep(current => Math.min(current + 1, SLIDES.length));
    else if (delta > 50) setStep(current => Math.max(current - 1, 0));
  };

  const photo = SLIDES[Math.min(step, SLIDES.length - 1)].photo;

  return (
    <div
      className="relative h-dvh overflow-hidden bg-[#0d0e12] text-white"
      onTouchStart={event => {
        startX.current = event.touches[0].clientX;
      }}
      onTouchEnd={onTouchEnd}
    >
      {SLIDES.map(slide => (
        <img
          key={slide.photo}
          src={slide.photo}
          alt=""
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            slide.photo === photo ? (onAccount ? 'opacity-30' : 'opacity-80') : 'opacity-0'
          }`}
        />
      ))}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(13,14,18,0.25)_0%,rgba(13,14,18,0.55)_45%,#0d0e12_85%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex h-full w-full max-w-md flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-[calc(16px+env(safe-area-inset-top,0px))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="14" cy="14" r="12" fill="none" stroke={ACCENT} strokeWidth="2.5" />
              <circle cx="14" cy="14" r="4.5" fill={ACCENT} />
            </svg>
            <span className="font-display text-lg font-bold">Live Space</span>
          </div>
          <button type="button" onClick={skip} className="min-h-11 px-2 text-sm font-semibold text-white/70">
            {onAccount ? 'Ahora no' : 'Saltar'}
          </button>
        </div>

        {onAccount ? (
          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-2">
            <div>
              <h1 className="m-0 font-display text-[36px] font-bold uppercase leading-[0.95] tracking-tight">
                Crea tu <span style={{ color: ACCENT }}>cuenta</span>
              </h1>
              <p className="m-0 mt-2 text-base text-white/75">Para subir lo que grabes y seguir a tus artistas y salas.</p>
            </div>
            <AuthPanel defaultMode="signup" onDone={handleDone} />
          </div>
        ) : (
          <>
            <div className="mt-auto flex flex-col gap-3" aria-live="polite">
              <h1 className="m-0 font-display text-[44px] font-bold uppercase leading-[0.95] tracking-tight">
                {SLIDES[step].title[0]}
                <br />
                <span style={{ color: ACCENT }}>{SLIDES[step].title[1]}</span>
              </h1>
              <p className="m-0 text-base text-white/75">{SLIDES[step].text}</p>
            </div>

            <div className="mt-8 flex items-center gap-2" aria-hidden="true">
              {[...SLIDES, null].map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full transition-all ${index === step ? 'w-6 bg-white' : 'w-1.5 bg-white/35'}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep(current => current + 1)}
              className="mt-5 inline-flex min-h-14 items-center justify-center rounded-full border-0 text-lg font-semibold text-[#0d0e12]"
              style={{ background: ACCENT }}
            >
              {step === SLIDES.length - 1 ? 'Empezar' : 'Siguiente'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
