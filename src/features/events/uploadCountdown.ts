// «en 3 d 4 h», «en 2 h 05 min», «en 12 min»: time left until the concert
// starts, for the disabled «Subir» button on the concert page.
export const uploadCountdown = (startsAt: Date, now: Date): string | null => {
  const ms = startsAt.getTime() - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `en ${days} d ${hours} h` : `en ${days} d`;
  if (hours > 0) return `en ${hours} h ${String(mins).padStart(2, '0')} min`;
  return `en ${mins} min`;
};
