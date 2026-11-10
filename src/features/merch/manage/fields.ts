export const fieldClass =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-surface px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none';

export const labelClass = 'text-[13px] font-semibold text-white/80';

export const concertDateLabel = (startsAt: string) =>
  new Date(startsAt).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
