import React from 'react';
import { Link } from 'react-router-dom';
import { IconQrCode } from '../components/icons';
import type { LandingPhoto } from './photos';
import { PHONE_SHOTS } from './photos';
import './landing.css';

export const UPLOAD_PATH = '/tabs/upload';
export const AGENDA_PATH = '/tabs/events';

const env = (import.meta as any).env || {};
// Without a contact address the venue/festival call to action shows no button.
export const CONTACT_EMAIL: string = env.VITE_CONTACT_EMAIL || '';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 16V4M6 10l6-6 6 6M5 20h14" />
  </svg>
);

export const BrandMark: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="12" fill="none" stroke="var(--ls-accent)" strokeWidth="2.5" />
    <circle cx="14" cy="14" r="4.5" fill="var(--ls-accent)" />
  </svg>
);

export const LiveDot: React.FC<{ className?: string }> = ({ className = 'h-2.5 w-2.5 bg-[var(--ls-accent)]' }) => (
  <span className={`ls-pulse inline-block shrink-0 rounded-full ${className}`} aria-hidden="true" />
);

export const PrimaryCta: React.FC<{ to: string; children: React.ReactNode; className?: string }> = ({
  to,
  children,
  className = '',
}) => (
  <Link
    to={to}
    className={`inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full bg-[var(--ls-accent)] px-7 text-lg font-semibold text-[#0d0e12] no-underline transition-transform hover:-translate-y-0.5 ${className}`}
  >
    <UploadIcon />
    {children}
  </Link>
);

export const LandingHeader: React.FC<{ partner?: string }> = ({ partner }) => (
  <header className="relative mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8 md:py-6">
    <Link to="/" className="flex items-center gap-2.5 text-[var(--ls-ink)] no-underline">
      <BrandMark />
      <span className="font-display text-xl font-bold">Live Space</span>
      {partner ? (
        <>
          <span className="text-[#a6a39c]" aria-hidden="true">×</span>
          <span className="font-display text-lg font-bold">{partner}</span>
        </>
      ) : null}
    </Link>
    <nav aria-label="Principal" className="flex flex-wrap items-center gap-1">
      <Link to={AGENDA_PATH} className="hidden px-3.5 py-3 font-medium text-[var(--ls-ink)] no-underline sm:inline-block">
        Conciertos
      </Link>
      <Link
        to={UPLOAD_PATH}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ls-accent)] px-5 font-semibold text-[#0d0e12] no-underline"
      >
        <UploadIcon className="h-[18px] w-[18px]" />
        Sube tu vídeo
      </Link>
    </nav>
  </header>
);

// Two rows of fan photos drifting in opposite directions. Each list is
// rendered twice so the -50% translate loops seamlessly.
export const PhotoMarquee: React.FC<{ rows: LandingPhoto[][]; label: string }> = ({ rows, label }) => (
  <section aria-label={label} className="ls-marquee-track flex flex-col gap-3.5 py-6">
    {rows.map((row, rowIndex) => (
      <div key={rowIndex} className="overflow-hidden">
        <div className={`flex w-max gap-3.5 ${rowIndex % 2 ? 'ls-marquee-reverse' : 'ls-marquee'}`}>
          {[...row, ...row].map((photo, index) => (
            <img
              key={`${photo.src}-${index}`}
              src={photo.src}
              alt={index < row.length ? photo.alt : ''}
              loading="lazy"
              className={`flex-none rounded-2xl object-cover ${
                rowIndex % 2 ? 'h-32 w-48 md:h-40 md:w-60' : 'h-40 w-60 md:h-[200px] md:w-[300px]'
              }`}
            />
          ))}
        </div>
      </div>
    ))}
  </section>
);

// Phone mockup cycling through fan clips, with a REC timestamp, an upload
// bar and a toast naming the song the clip landed on.
export const PhoneMock: React.FC = () => {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % PHONE_SHOTS.length), 3200);
    return () => window.clearInterval(timer);
  }, []);

  const shot = PHONE_SHOTS[index];

  return (
    <div className="ls-float relative h-[560px] w-[276px] overflow-hidden rounded-[44px] border-[10px] border-[#22252d] bg-[var(--ls-ground)] shadow-[0_40px_90px_rgba(0,0,0,0.6)] md:h-[610px] md:w-[300px]">
      {PHONE_SHOTS.map((item, itemIndex) => (
        <img
          key={item.photo.src}
          src={item.photo.src}
          alt={itemIndex === index ? item.photo.alt : ''}
          className="ls-fade absolute inset-0 h-full w-full object-cover"
          style={{ opacity: itemIndex === index ? 1 : 0 }}
        />
      ))}
      <div
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,14,18,0.55)_0%,rgba(13,14,18,0)_28%,rgba(13,14,18,0)_60%,rgba(13,14,18,0.85)_100%)]"
        aria-hidden="true"
      />
      <span className="ls-mono absolute left-4 top-[18px] inline-flex items-center gap-1.5 rounded-full bg-[rgba(13,14,18,0.75)] px-2.5 py-1 text-[11px] font-semibold">
        <LiveDot className="h-[7px] w-[7px] bg-[#ff3b30]" />
        {shot.time}
      </span>
      <div className="absolute inset-x-4 bottom-[18px] flex flex-col gap-2.5" aria-live="polite">
        <div
          key={index}
          className="ls-toast inline-flex items-center gap-2 self-start rounded-xl bg-[var(--ls-paper)] px-3 py-2 text-[13px] font-semibold text-[#0d0e12]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Subido a «{shot.song}»
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(243,239,231,0.25)]">
          <div key={index} className="ls-load h-full rounded-full bg-[var(--ls-accent)]" />
        </div>
      </div>
    </div>
  );
};

export const QrTile: React.FC<{ className?: string; iconSize?: number }> = ({
  className = 'h-[132px] w-[132px] rounded-[20px]',
  iconSize = 96,
}) => (
  <div className={`ls-float flex items-center justify-center bg-[var(--ls-paper)] text-[#0d0e12] ${className}`}>
    <IconQrCode size={iconSize} />
  </div>
);

export const ContactButton: React.FC<{ subject: string; children: React.ReactNode; tone?: 'light' | 'dark' }> = ({
  subject,
  children,
  tone = 'light',
}) =>
  CONTACT_EMAIL ? (
    <a
      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}
      className={`inline-flex min-h-[52px] items-center self-start rounded-full border-[1.5px] px-6 font-semibold no-underline ${
        tone === 'light' ? 'border-[var(--ls-ink)] text-[var(--ls-ink)]' : 'border-[#0d0e12] text-[#0d0e12]'
      }`}
    >
      {children}
    </a>
  ) : null;

export const LandingFooter: React.FC<{ lead?: string }> = ({ lead = 'Live Space · los conciertos, contados por el público.' }) => (
  <footer className="border-t border-[var(--ls-line)]">
    <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-4 px-5 py-8 text-[15px] text-[#a6a39c] md:px-8">
      <span>{lead}</span>
      <nav aria-label="Pie" className="flex flex-wrap gap-5">
        <Link to={AGENDA_PATH} className="text-[var(--ls-muted)]">Conciertos</Link>
        <Link to={UPLOAD_PATH} className="text-[var(--ls-muted)]">Subir vídeo</Link>
      </nav>
    </div>
  </footer>
);
