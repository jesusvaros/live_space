import React from 'react';
import { Link } from 'react-router-dom';
import { WRAPPED_PATH } from './sharedImage';

// Entry point in Explorar: from the Spotify Wrapped card to following them all.
const WrappedCard: React.FC = () => (
  <Link
    to={WRAPPED_PATH}
    className="flex items-center gap-4 rounded-2xl border border-app-accent/40 bg-app-accent/10 p-4 text-left transition hover:border-app-accent"
  >
    <div className="min-w-0 flex-1 space-y-1">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-accent">Spotify Wrapped</p>
      <p className="font-display text-[17px] font-bold leading-tight text-app-ink">Importa tu Wrapped</p>
      <p className="text-[13px] leading-snug text-app-ink/65">Sigue a tus artistas del año de un toque y entérate antes de sus conciertos.</p>
    </div>
    <span aria-hidden className="font-poster text-[40px] leading-none text-app-accent">→</span>
  </Link>
);

export default WrappedCard;
