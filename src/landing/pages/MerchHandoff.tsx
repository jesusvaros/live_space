import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { LandingFooter, LandingHeader } from '../parts';

// /vuelta on the public site: where Stripe sends people back after paying for
// merch (?pedido=<id>) or setting up payouts (?cobros=1). It hands them back
// to the app with the custom scheme.

const APP_SCHEME = 'com.livespace.app';
const ANDROID_PACKAGE = 'com.livespace.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const safeQuery = (search: string) => {
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  const order = params.get('pedido');
  if (order && UUID.test(order)) out.set('pedido', order);
  else if (params.get('cobros')) out.set('cobros', '1');
  return out.toString();
};

const MerchHandoff: React.FC = () => {
  const location = useLocation();
  const query = useMemo(() => safeQuery(location.search), [location.search]);
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  const openUrl = isAndroid
    ? `intent://merch?${query}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`
    : `${APP_SCHEME}://merch?${query}`;

  // The app opened this page itself, so it is installed: go straight back.
  useEffect(() => {
    if (query) window.location.href = openUrl;
  }, [query, openUrl]);

  return (
    <div className="ls-root h-dvh overflow-y-auto overflow-x-hidden text-[17px] leading-normal">
      <LandingHeader />
      <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-5 pb-16 pt-8 md:px-8">
        <h1 className="ls-display text-[clamp(48px,12vw,88px)] leading-[0.9]">Vuelve a Live Space</h1>
        <p className="text-[var(--ls-muted)]">
          {query.startsWith('pedido') ? 'Tu pedido está en la app, con el código para recogerlo.' : 'Ya puedes volver a la app.'}
        </p>
        <a
          href={openUrl}
          className="inline-flex min-h-14 items-center justify-center self-start rounded-full bg-[var(--ls-accent)] px-7 text-lg font-semibold text-[#0d0e12] no-underline"
        >
          Abrir Live Space
        </a>
      </main>
      <LandingFooter />
    </div>
  );
};

export default MerchHandoff;
