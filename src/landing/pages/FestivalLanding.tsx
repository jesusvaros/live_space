import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { festivalBySlug, festivalPath } from '../festivals';
import {
  ContactButton,
  DownloadCta,
  LandingFooter,
  LandingHeader,
  LiveDot,
  PhotoMarquee,
  PrimaryCta,
  QrTile,
} from '../parts';
import { MARQUEE_A, MARQUEE_B } from '../photos';

// Festival landing at /festival/:slug, one per entry in src/landing/festivals.ts.
// Same structure for every festival; only the config changes.

const LINEUP_PHOTOS = [...MARQUEE_A, ...MARQUEE_B];

const FestivalLanding: React.FC = () => {
  const { slug } = useParams();
  const festival = festivalBySlug(slug);
  if (!festival) return <Navigate to="/" replace />;

  const shareUrl = typeof window !== 'undefined' ? `${window.location.host}${festivalPath(festival)}` : '';
  const lineup = festival.lineup ?? [];

  return (
    <div className="ls-root h-dvh overflow-y-auto overflow-x-hidden text-[17px] leading-normal">
      <section className="relative flex min-h-[720px] flex-col overflow-hidden md:min-h-[820px]">
        <img src={festival.hero} alt={festival.heroAlt} className="ls-kenburns absolute inset-0 h-full w-full object-cover" />
        <div
          className="absolute inset-0 bg-[linear-gradient(0deg,rgba(13,14,18,0.95)_0%,rgba(13,14,18,0.35)_55%,rgba(13,14,18,0.6)_100%)]"
          aria-hidden="true"
        />
        <LandingHeader partner={festival.name} />
        <div className="ls-rise relative mx-auto mt-auto flex w-full max-w-[1280px] flex-col gap-6 px-5 pb-16 md:px-8 md:pb-20">
          <span className="ls-mono inline-flex items-center gap-2.5 self-start rounded-full border border-[rgba(243,239,231,0.18)] bg-[rgba(13,14,18,0.7)] px-3.5 py-2 text-sm font-semibold">
            <LiveDot />
            {festival.dates ? `${festival.place} · ${festival.dates}` : festival.place}
          </span>
          <h1 className="ls-display max-w-[72rem] text-[clamp(64px,9.4vw,144px)] leading-[0.86]">
            ¿Estuviste en <span className="text-[var(--ls-accent)]">{festival.name}</span>?
          </h1>
          <p className="max-w-[32rem] text-[21px] text-[#dedad2]">
            Sube lo que grabaste desde la app. Cada concierto del cartel tiene su página.
          </p>
          <PrimaryCta className="self-start">Descárgate la app</PrimaryCta>
        </div>
      </section>

      <PhotoMarquee rows={[MARQUEE_A]} label="Fotos de conciertos" />

      {lineup.length > 0 ? (
        <section className="mx-auto flex max-w-[1280px] flex-col gap-9 px-5 py-20 md:px-8 md:py-24">
          <h2 className="ls-display text-[clamp(48px,6vw,84px)]">Elige el concierto.</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {lineup.map((band, index) => {
              const photo = LINEUP_PHOTOS[index % LINEUP_PHOTOS.length];
              return (
                <li key={band} className="ls-zoom relative h-[300px] overflow-hidden rounded-[20px] bg-[var(--ls-surface)]">
                  <img src={photo.src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,14,18,0)_35%,rgba(13,14,18,0.92)_100%)]" aria-hidden="true" />
                  <strong className="ls-display absolute inset-x-[18px] bottom-[18px] text-[30px] leading-[0.95]">{band}</strong>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section id="descargar" className="bg-[var(--ls-accent)] text-[#0d0e12]">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-12 px-5 py-16 md:px-8 md:py-20">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-5">
            <h2 className="ls-display text-[clamp(52px,7vw,104px)]">Descárgate la app y súbelo.</h2>
            <DownloadCta source={`festival:${festival.slug}`} tone="accent" />
            {shareUrl ? <p className="ls-mono break-all text-base font-semibold">En el recinto, busca el QR o entra en {shareUrl}</p> : null}
            <ContactButton subject={`${festival.name} en Live Space`} tone="dark">
              ¿Organizas {festival.name}?
            </ContactButton>
          </div>
          <QrTile className="h-[220px] w-[220px] flex-none rounded-[28px] shadow-[0_30px_60px_rgba(13,14,18,0.35)]" iconSize={160} />
        </div>
      </section>

      <LandingFooter lead={`${festival.name} en Live Space · los conciertos, contados por el público.`} />
    </div>
  );
};

export default FestivalLanding;
