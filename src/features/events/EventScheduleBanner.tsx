import React from 'react';
import type { EventSchedule } from '../../services/eventManagement.service';
import { scheduleState } from '../../services/eventManagement.service';

// CANCELADO / APLAZADO on a concert page. Told apart by shape: a thick-ruled
// block with a diagonal hatch, the old date struck through; no new colours.

const formatDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace(/\./g, '');

export const scheduleHeadline = (schedule: EventSchedule | null | undefined) => {
  const state = scheduleState(schedule);
  if (state === 'cancelled') return 'CANCELADO';
  if (state === 'tbc') return 'APLAZADO';
  if (state === 'postponed') return 'NUEVA FECHA';
  return null;
};

const EventScheduleBanner: React.FC<{ schedule: EventSchedule | null; startsAt: string; className?: string }> = ({
  schedule,
  startsAt,
  className = '',
}) => {
  const state = scheduleState(schedule);
  const headline = scheduleHeadline(schedule);
  if (!state || !schedule || !headline) return null;
  const reason = schedule.cancelReason;

  return (
    <section
      role="status"
      aria-label={headline}
      className={`overflow-hidden rounded-2xl border-2 border-app-ink bg-[repeating-linear-gradient(135deg,transparent_0,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)] px-4 py-3 ${className}`}
    >
      <p className="font-poster text-[34px] leading-none text-app-ink">{headline}</p>
      {state === 'postponed' ? (
        <p className="mt-1.5 font-mono text-[12px] font-semibold uppercase text-app-ink">
          {schedule.postponedFrom ? <span className="mr-2 text-white/45 line-through">{formatDate(schedule.postponedFrom)}</span> : null}
          {formatDate(startsAt)}
        </p>
      ) : null}
      {state === 'tbc' ? <p className="mt-1.5 text-[14px] text-white/70">Fecha por confirmar</p> : null}
      {state === 'cancelled' && reason ? <p className="mt-1.5 text-[14px] text-white/70">{reason}</p> : null}
    </section>
  );
};

export default EventScheduleBanner;
