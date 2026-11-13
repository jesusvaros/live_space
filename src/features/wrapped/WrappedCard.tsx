import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronRight } from '../../components/icons';
import { track } from '../analytics/analytics';
import { WRAPPED_PATH } from './sharedImage';

const DISMISSED_KEY = 'ls.wrappedCard.dismissedSeason';

/**
 * The Wrapped people can import right now: Spotify publishes it in early
 * December, so from 1 December the new year's Wrapped is the one; until then,
 * last year's.
 */
export const wrappedSeason = (now: Date) => (now.getMonth() === 11 ? now.getFullYear() : now.getFullYear() - 1);

const readDismissedSeason = () => {
  try {
    return Number(window.localStorage.getItem(DISMISSED_KEY)) || null;
  } catch {
    return null;
  }
};

// Entry point on Inicio: from the Spotify Wrapped card to following them all.
// Closing it hides it on this device until the next Wrapped comes out (next
// 1 December); the import stays reachable at its own route.
const WrappedCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const season = wrappedSeason(new Date());
  const [dismissed, setDismissed] = useState(() => readDismissedSeason() === season);
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    track('wrapped_card_dismissed', { season });
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(season));
    } catch {
      // Private mode: hidden until the app restarts.
    }
  };

  return (
    <div className={`relative ${className}`}>
      <Link
        to={WRAPPED_PATH}
        aria-label={`Importa tu Spotify Wrapped ${season}`}
        className="flex min-h-16 items-center gap-3 overflow-hidden rounded-2xl border border-[#1ed760]/25 bg-[linear-gradient(110deg,rgba(30,215,96,0.16),rgba(30,215,96,0.03)_60%)] py-2.5 pl-3 pr-12 text-left transition hover:border-[#1ed760]/50"
      >
        <SpotifyGlyph />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[16px] font-bold leading-tight text-app-ink">Tu Wrapped {season}</span>
          <span className="block truncate text-[13px] text-app-ink/60">Sigue a tus artistas del año</span>
        </span>
        <IconChevronRight size={18} className="shrink-0 text-[#1ed760]" />
      </Link>
      <button
        type="button"
        aria-label="Cerrar Spotify Wrapped"
        onClick={dismiss}
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none text-app-ink/40 hover:text-app-ink"
      >
        ×
      </button>
    </div>
  );
};

// Spotify's mark as a simple glyph: green disc with the three sound arcs.
const SpotifyGlyph: React.FC = () => (
  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1ed760]">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b0b0b" strokeLinecap="round">
      <path d="M5 9.2c4.6-1.5 9.8-1.1 14 1.2" strokeWidth="2.2" />
      <path d="M6 12.7c3.9-1.1 8.1-.8 11.6 1" strokeWidth="1.9" />
      <path d="M7 16c3.1-.8 6.3-.6 9.1.8" strokeWidth="1.6" />
    </svg>
  </span>
);

export default WrappedCard;
