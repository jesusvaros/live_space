import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DownloadCta, LandingFooter, LandingHeader, LiveDot } from '../parts';

// /upload on the public site: where a concert QR lands when it is scanned with
// the phone's own camera. It hands the link to the app (custom scheme; App
// Links / Universal Links skip this page entirely once they are set up, see
// docs/runbooks.md) and otherwise invites to install Live Space.

const APP_SCHEME = 'com.livespace.app';
const ANDROID_PACKAGE = 'com.livespace.app';

// Only the two parameters the app understands travel on, and only if they
// look like a token or an id.
const safeQuery = (search: string) => {
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  const qr = params.get('qr');
  const event = params.get('event');
  if (qr && /^[A-Za-z0-9_-]{8,128}$/.test(qr)) out.set('qr', qr);
  else if (event && /^[A-Za-z0-9-]{8,64}$/.test(event)) out.set('event', event);
  return out.toString();
};

const platform = () => {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
};

const UploadHandoff: React.FC = () => {
  const location = useLocation();
  const query = useMemo(() => safeQuery(location.search), [location.search]);
  const os = useMemo(platform, []);
  const [tried, setTried] = useState(false);

  const schemeUrl = `${APP_SCHEME}://upload${query ? `?${query}` : ''}`;
  // Android: an intent URL opens the app if installed and otherwise stays here.
  const openUrl = os === 'android'
    ? `intent://upload${query ? `?${query}` : ''}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`
    : schemeUrl;

  // Try once on Android, where a missing app fails silently. iOS shows an
  // error sheet for an unknown scheme, so there it waits for a tap.
  useEffect(() => {
    if (os !== 'android' || !query) return;
    setTried(true);
    window.location.href = openUrl;
  }, [os, query, openUrl]);

  return (
    <div className="ls-root h-dvh overflow-y-auto overflow-x-hidden text-[17px] leading-normal">
      <LandingHeader />
      <main className="mx-auto flex max-w-[720px] flex-col gap-7 px-5 pb-16 pt-8 md:px-8">
        <span className="ls-mono inline-flex items-center gap-2.5 self-start rounded-full border border-[rgba(243,239,231,0.18)] px-3.5 py-2 text-[13px] font-semibold tracking-[0.1em]">
          <LiveDot />
          QR DEL CONCIERTO
        </span>
        <h1 className="ls-display text-[clamp(56px,14vw,104px)] leading-[0.86]">
          Sube lo que <span className="text-[var(--ls-accent)]">grabes</span> esta noche
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
              {tried
                ? 'Si no se ha abierto la app es que aún no la tienes.'
                : 'Si tienes la app, se abre con el concierto ya elegido.'}
            </p>
          </div>
        ) : null}
        <section id="descargar" className="flex flex-col gap-4 rounded-[24px] border border-[rgba(243,239,231,0.14)] p-6">
          <h2 className="ls-display text-[clamp(40px,9vw,64px)] leading-[0.9]">Descarga Live Space</h2>
          <p className="text-[var(--ls-muted)]">
            Tus fotos y vídeos del concierto, ordenados por canción junto a los del resto del público.
          </p>
          <DownloadCta source="qr-upload" />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
};

export default UploadHandoff;
