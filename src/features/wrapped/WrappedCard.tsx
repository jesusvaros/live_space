import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
        className="flex items-center gap-4 rounded-2xl border border-app-accent/40 bg-app-accent/10 p-4 pr-12 text-left transition hover:border-app-accent"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-accent">Spotify Wrapped {season}</p>
          <p className="font-display text-[17px] font-bold leading-tight text-app-ink">Importa tu Wrapped</p>
          <p className="text-[13px] leading-snug text-app-ink/65">Sigue a tus artistas del año de un toque y entérate antes de sus conciertos.</p>
        </div>
        <span aria-hidden className="font-poster text-[40px] leading-none text-app-accent">→</span>
      </Link>
      <button
        type="button"
        aria-label="Cerrar Spotify Wrapped"
        onClick={dismiss}
        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-app-ink/60 hover:text-app-ink"
      >
        ×
      </button>
    </div>
  );
};

export default WrappedCard;
