import React from 'react';
import {
  AGENDA_LINKS,
  ContactButton,
  DownloadCta,
  LandingFooter,
  LandingHeader,
  LiveDot,
  PhoneMock,
  PhotoMarquee,
  PrimaryCta,
  QrTile,
} from '../parts';
import { MARQUEE_A, MARQUEE_B, PHOTOS } from '../photos';

// Public site landing at "/". Its only job is getting the app installed.
// Generic on purpose: no festival, band or venue names; festivals get their
// own page (FestivalLanding).

const STEPS = [
  { n: '01', title: 'Escanea el QR', photo: PHOTOS.phoneUp },
  { n: '02', title: 'Sube tu clip', photo: PHOTOS.frontRow },
  { n: '03', title: 'Sale en su canción', photo: PHOTOS.drums },
];

// Illustrative night: song slots with how many fan clips each one got.
const TIMELINE = [
  { at: '21:30', song: 'Intro', photo: PHOTOS.smoke, clips: 4, height: 120 },
  { at: '21:36', song: 'Canción 2', photo: PHOTOS.guitarBlueRed, clips: 7, height: 160 },
  { at: '21:49', song: 'Canción 5', photo: PHOTOS.sax, clips: 3, height: 110 },
  { at: '22:05', song: 'El hit', photo: PHOTOS.crowdStage, clips: 21, height: 220 },
  { at: '22:20', song: 'Canción 11', photo: PHOTOS.singer, clips: 6, height: 150 },
  { at: '22:31', song: 'Bis', photo: PHOTOS.blueSpots, clips: 14, height: 190 },
];

const Landing: React.FC = () => (
  <div className="ls-root h-dvh overflow-y-auto overflow-x-hidden text-[17px] leading-normal">
    <section className="relative flex min-h-[760px] flex-col overflow-hidden md:min-h-[860px]">
      <img
        src={PHOTOS.heroRecording.src}
        alt=""
        className="ls-kenburns absolute inset-0 h-full w-full object-cover"
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,14,18,0.6)_0%,rgba(13,14,18,0.85)_100%)] md:bg-[linear-gradient(90deg,rgba(13,14,18,0.94)_0%,rgba(13,14,18,0.72)_45%,rgba(13,14,18,0.25)_100%)]"
        aria-hidden="true"
      />
      <LandingHeader />
      <div className="relative mx-auto flex w-full max-w-[1280px] flex-1 flex-wrap items-center gap-12 px-5 pb-16 pt-6 md:px-8 md:pt-10">
        <div className="ls-rise flex min-w-0 flex-[999_1_520px] flex-col gap-7">
          <span className="ls-mono inline-flex items-center gap-2.5 self-start rounded-full border border-[rgba(243,239,231,0.18)] bg-[rgba(13,14,18,0.7)] px-3.5 py-2 text-[13px] font-semibold tracking-[0.1em]">
            <LiveDot />
            REC
          </span>
          <h1 className="ls-display text-[clamp(72px,10vw,152px)] leading-[0.86]">
            Lo grabaste.
            <br />
            <span className="text-[var(--ls-accent)]">Súbelo.</span>
          </h1>
          <p className="max-w-[30rem] text-[21px] text-[#dedad2]">
            Tus fotos y vídeos del concierto, ordenados por canción.
          </p>
          <DownloadCta source="landing-hero" />
        </div>
        <div className="flex min-w-0 flex-[1_1_320px] justify-center">
          <PhoneMock />
        </div>
      </div>
    </section>

    <PhotoMarquee rows={[MARQUEE_A, MARQUEE_B]} label="Fotos de conciertos" />

    <section id="como" className="mx-auto flex max-w-[1280px] flex-col gap-10 px-5 py-20 md:px-8 md:py-24">
      <h2 className="ls-display text-[clamp(48px,6vw,84px)]">Tres toques.</h2>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
        {STEPS.map((step) => (
          <li key={step.n} className="ls-zoom relative h-[300px] overflow-hidden rounded-3xl bg-[var(--ls-surface)] md:h-[480px]">
            <img src={step.photo.src} alt={step.photo.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,14,18,0)_40%,rgba(13,14,18,0.92)_100%)]" aria-hidden="true" />
            <div className="absolute inset-x-6 bottom-6 flex flex-col gap-1.5">
              <span className="ls-mono text-sm text-[var(--ls-accent)]">{step.n}</span>
              <h3 className="ls-display text-[44px] leading-[0.95]">{step.title}</h3>
            </div>
          </li>
        ))}
      </ol>
    </section>

    <section id="noche" className="bg-[var(--ls-paper)] text-[var(--ls-paper-ink)]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-11 px-5 py-20 md:px-8 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="ls-display text-[clamp(48px,6vw,84px)]">
            La noche,
            <br />
            canción a canción.
          </h2>
          <span className="flex h-9 items-end gap-1" aria-hidden="true">
            {[0, 0.3, 0.15, 0.45, 0.6].map((delay) => (
              <span key={delay} className="ls-eq h-full w-1.5 rounded-sm bg-[var(--ls-paper-ink)]" style={{ animationDelay: `${delay}s` }} />
            ))}
          </span>
        </div>

        <figure className="flex flex-col gap-4">
          <div className="grid min-h-[230px] grid-cols-3 items-end gap-3 md:grid-cols-6">
            {TIMELINE.map((slot, index) => (
              <div
                key={slot.at}
                className="ls-clip-in relative overflow-hidden rounded-[14px] bg-[#d9d3c6]"
                style={{ height: slot.height, animationDelay: `${index * 0.35}s` }}
              >
                <img src={slot.photo.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                <span className="ls-mono absolute left-2 top-2 rounded-md bg-[rgba(13,14,18,0.8)] px-1.5 py-0.5 text-[11px] text-[var(--ls-ink)]">
                  {slot.clips} clips
                </span>
              </div>
            ))}
          </div>
          <div className="relative h-2.5 rounded-full bg-[#d9d3c6]" aria-hidden="true">
            <span className="ls-playhead absolute -top-[9px] -ml-3.5 h-7 w-7 rounded-full bg-[var(--ls-accent)] shadow-[0_0_0_6px_rgba(13,14,18,0.08)]" />
          </div>
          <figcaption className="ls-mono grid grid-cols-3 gap-3 text-[13px] text-[#4b4d55] md:grid-cols-6">
            {TIMELINE.map((slot) => (
              <span key={slot.at}>
                {slot.at} · {slot.song}
              </span>
            ))}
          </figcaption>
        </figure>
      </div>
    </section>

    <section className="relative flex min-h-[520px] items-end overflow-hidden md:min-h-[640px] md:items-center">
      <img src={PHOTOS.redBand.src} alt={PHOTOS.redBand.alt} loading="lazy" className="ls-kenburns absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(13,14,18,0.92)_0%,rgba(13,14,18,0.2)_70%)]" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-[1280px] flex-wrap items-end justify-between gap-8 px-5 py-16 md:px-8 md:py-24">
        <h2 className="ls-display max-w-[52rem] text-[clamp(56px,7.4vw,112px)]">
          ¿Te perdiste el bis? <span className="text-[var(--ls-accent)]">Alguien lo grabó.</span>
        </h2>
        <PrimaryCta>Descárgate la app</PrimaryCta>
      </div>
    </section>

    <section id="salas" className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-12 px-5 py-20 md:px-8 md:py-24">
      <div className="ls-zoom relative h-[300px] min-w-0 flex-[1_1_460px] overflow-hidden rounded-[28px] md:h-[440px]">
        <img src={PHOTOS.festivalCrowd.src} alt={PHOTOS.festivalCrowd.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute bottom-7 right-7">
          <QrTile />
        </div>
      </div>
      <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
        <p className="ls-mono text-sm uppercase tracking-[0.12em] text-[var(--ls-accent)]">Salas y festivales</p>
        <h2 className="ls-display text-[clamp(44px,5vw,72px)] leading-[0.92]">Pon un QR. El público hace el resto.</h2>
        <p className="max-w-[28rem] text-[19px] text-[var(--ls-muted)]">
          Cada noche tuya, con su página y lo que grabó la gente.
        </p>
        <ContactButton subject="Quiero un QR de Live Space">Pide tu QR</ContactButton>
        <a href={AGENDA_LINKS[0].href} className="self-start text-[var(--ls-muted)]">
          Ver la agenda de conciertos
        </a>
      </div>
    </section>

    <section id="descargar" className="bg-[var(--ls-accent)] text-[#0d0e12]">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-12 px-5 py-16 md:px-8 md:py-20">
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
          <h2 className="ls-display text-[clamp(56px,7vw,104px)]">Llévatelo en el bolsillo.</h2>
          <DownloadCta source="landing-descargar" tone="accent" />
        </div>
        <img
          src={PHOTOS.screenFrontRow.src}
          alt={PHOTOS.screenFrontRow.alt}
          loading="lazy"
          className="ls-float h-[360px] w-[200px] flex-none rounded-[34px] border-[8px] border-[#0d0e12] object-cover shadow-[0_30px_60px_rgba(13,14,18,0.35)]"
        />
      </div>
    </section>

    <LandingFooter />
  </div>
);

export default Landing;
