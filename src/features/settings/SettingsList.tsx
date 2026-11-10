import React from 'react';
import { Link } from 'react-router-dom';
import { useGoBack } from '../../app/useGoBack';
import { IconChevronLeft, IconChevronRight } from '../../components/icons';

// Pieces of Ajustes: grouped cards of rows (icon, title, current value,
// chevron), the way iOS and Android settings look, and the top bar of each
// section page.

export const SettingsGroup: React.FC<{ children: React.ReactNode; label?: string }> = ({ children, label }) => (
  <section className="mt-6 first:mt-4">
    {label ? <h2 className="m-0 mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</h2> : null}
    <ul className="m-0 list-none overflow-hidden rounded-2xl bg-app-surface p-0 [&>li+li]:border-t [&>li+li]:border-app-line">
      {children}
    </ul>
  </section>
);

const RowBody: React.FC<{ icon: React.ReactNode; title: string; value?: string | null; tone?: 'danger' }> = ({
  icon,
  title,
  value,
  tone,
}) => (
  <>
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${
        tone === 'danger' ? 'bg-rose-500/15 text-rose-300' : 'bg-app-accent/15 text-app-accent'
      }`}
    >
      {icon}
    </span>
    <span className={`min-w-0 flex-1 text-[16px] font-semibold ${tone === 'danger' ? 'text-rose-200' : 'text-app-ink'}`}>{title}</span>
    {value ? <span className="max-w-[45%] truncate text-[15px] text-white/50">{value}</span> : null}
  </>
);

export const SettingsRow: React.FC<{ to: string; icon: React.ReactNode; title: string; value?: string | null }> = ({
  to,
  icon,
  title,
  value,
}) => (
  <li>
    <Link to={to} className="flex min-h-[54px] items-center gap-3 px-3.5 py-2 text-left no-underline">
      <RowBody icon={icon} title={title} value={value} />
      <IconChevronRight size={18} className="shrink-0 text-white/40" />
    </Link>
  </li>
);

/** A row whose right side is a control (a switch, a button) instead of a chevron. */
export const SettingsItem: React.FC<{ icon: React.ReactNode; title: string; children?: React.ReactNode; value?: string | null }> = ({
  icon,
  title,
  children,
  value,
}) => (
  <li className="flex min-h-[54px] items-center gap-3 px-3.5 py-2">
    <RowBody icon={icon} title={title} value={value} />
    {children}
  </li>
);

export const SettingsHelp: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="m-0 mt-2.5 px-3.5 text-[13.5px] leading-snug text-white/50">{children}</p>
);

// Back = the previous page (the list, when the section was opened from it,
// so the system back gesture and this button agree); opened directly (a
// deep link) it goes to `back`.
export const SettingsTopBar: React.FC<{ title: string; back: string }> = ({ title, back }) => {
  const goBack = useGoBack(back);
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-app-line bg-app-bg/95 px-3 pb-2 pt-[calc(8px+env(safe-area-inset-top,0px))] backdrop-blur">
      <button
        type="button"
        onClick={goBack}
        aria-label="Volver"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
      >
        <IconChevronLeft size={22} />
      </button>
      <h1 className="m-0 min-w-0 flex-1 truncate font-display text-lg font-bold text-app-ink">{title}</h1>
    </header>
  );
};

export const Switch: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? 'bg-app-accent' : 'bg-white/20'}`}
  >
    <span
      className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
      }`}
    />
  </button>
);
