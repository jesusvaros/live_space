import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DownloadCta, LandingFooter, LandingHeader } from '../parts';

// /unirse on the public site: where a team invite (?equipo=) or a personal
// claim link (?perfil=) lands when opened from WhatsApp or mail. It hands the
// token to the app (com.livespace.app://join?…) and otherwise invites to
// install it. Same mechanics as /upload.

const APP_SCHEME = 'com.livespace.app';
const ANDROID_PACKAGE = 'com.livespace.app';
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

const safeQuery = (search: string) => {
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  const team = params.get('equipo');
  const claim = params.get('perfil');
  if (team && TOKEN.test(team)) out.set('equipo', team);
  else if (claim && TOKEN.test(claim)) out.set('perfil', claim);
  return out.toString();
};

const JoinHandoff: React.FC = () => {
  const location = useLocation();
  const query = useMemo(() => safeQuery(location.search), [location.search]);
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  const [tried, setTried] = useState(false);
  const isClaim = query.startsWith('perfil');

  const openUrl = isAndroid
    ? `intent://join?${query}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`
    : `${APP_SCHEME}://join?${query}`;

  useEffect(() => {
    if (!isAndroid || !query) return;
    setTried(true);
    window.location.href = openUrl;
  }, [isAndroid, query, openUrl]);

  return (
    <div className="ls-root h-dvh overflow-y-auto overflow-x-hidden text-[17px] leading-normal">
      <LandingHeader />
      <main className="mx-auto flex max-w-[720px] flex-col gap-7 px-5 pb-16 pt-8 md:px-8">
        <h1 className="ls-display text-[clamp(52px,13vw,96px)] leading-[0.88]">
          {isClaim ? 'Tu perfil en Live Space' : 'Únete al equipo'}
        </h1>
        {query ? (
          <div className="flex flex-col gap-3">
            <a
              href={openUrl}
              className="inline-flex min-h-14 items-center justify-center self-start rounded-full bg-[var(--ls-accent)] px-7 text-lg font-semibold text-[#0d0e12] no-underline"
            >
              Abrir en Live Space
            </a>
            <p className="text-[15px] text-[var(--ls-muted)]">
              {tried ? 'Si no se ha abierto, instala la app y vuelve a abrir el enlace.' : 'Se abre en la app.'}
            </p>
          </div>
        ) : (
          <p className="text-[var(--ls-muted)]">Este enlace no es válido.</p>
        )}
        <section className="flex flex-col gap-4 rounded-[24px] border border-[rgba(243,239,231,0.14)] p-6">
          <h2 className="ls-display text-[clamp(40px,9vw,64px)] leading-[0.9]">Descarga Live Space</h2>
          <DownloadCta source={isClaim ? 'claim-link' : 'team-invite'} />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
};

export default JoinHandoff;
