import React from 'react';

type ConcertRowProps = {
  startsAt: string;
  title: string;
  subtitle?: string | null;
  onSelect: () => void;
};

// A concert as a list row: the date in a block on the left.
const ConcertRow: React.FC<ConcertRowProps> = ({ startsAt, title, subtitle, onSelect }) => {
  const date = new Date(startsAt);
  const weekday = date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase();
  const month = date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toUpperCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3 py-2.5 text-left text-app-ink"
    >
      <span className="w-[54px] shrink-0 text-center">
        <span className="block font-mono text-[11px] font-semibold text-app-accent">{weekday}</span>
        <span className="block font-poster text-[28px] leading-none">{date.getDate()}</span>
        <span className="block font-mono text-[10px] font-semibold text-[#8f8b84]">{month}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-bold">{title}</span>
        {subtitle ? <span className="block truncate text-[13px] text-[#c9c5bd]">{subtitle}</span> : null}
      </span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-white/50">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
};

export default ConcertRow;
