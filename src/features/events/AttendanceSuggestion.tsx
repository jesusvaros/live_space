import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { AttendanceStatus } from '../../lib/types';
import { attendanceTargetFor, fetchAttendanceStatus, markAttendance } from './attendance';

type Props = {
  eventId: string;
  startsAt: string;
  endsAt: string | null;
  className?: string;
  onMarked?: (status: AttendanceStatus) => void;
  onClose?: () => void;
};

/**
 * «¿Marcamos que fuiste?» after we recognised the concert from the user's
 * photos. One tap marks it; nothing is ever set without that tap. Renders
 * nothing when signed out or when the concert is already marked.
 */
const AttendanceSuggestion: React.FC<Props> = ({ eventId, startsAt, endsAt, className = '', onMarked, onClose }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<'loading' | 'ask' | 'saving' | 'done' | 'error' | 'hidden'>('loading');
  const target = attendanceTargetFor(startsAt, endsAt);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    if (!userId) return undefined;
    fetchAttendanceStatus(eventId, userId)
      .then(status => {
        if (!cancelled) setState(status ? 'hidden' : 'ask');
      })
      .catch(() => {
        if (!cancelled) setState('hidden');
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, userId]);

  const close = () => {
    setState('hidden');
    onClose?.();
  };

  // The confirmation goes away on its own.
  useEffect(() => {
    if (state !== 'done') return undefined;
    const timer = window.setTimeout(close, 3000);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!userId || state === 'loading' || state === 'hidden') return null;

  const mark = async () => {
    setState('saving');
    try {
      await markAttendance(eventId, userId, target);
      setState('done');
      onMarked?.(target);
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <section role="status" className={`rounded-2xl border border-app-line bg-app-surface p-3.5 ${className}`}>
        <p className="m-0 text-sm font-semibold text-app-ink">
          {target === 'attended' ? 'Hecho: está en tus conciertos.' : 'Hecho: has dicho «Voy».'}
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Marcar asistencia" className={`rounded-2xl border border-app-line bg-app-surface p-3.5 ${className}`}>
      <p className="m-0 font-display text-base font-bold text-app-ink">
        {target === 'attended' ? '¿Marcamos que fuiste?' : '¿Marcamos que vas?'}
      </p>
      <p className="m-0 mt-0.5 text-[13px] text-[#c9c5bd]">
        Lo hemos reconocido por tus fotos y vídeos. Así aparece en tus conciertos.
      </p>
      {state === 'error' ? <p role="alert" className="m-0 mt-1 text-[13px] text-rose-400">No se ha podido guardar. Inténtalo otra vez.</p> : null}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={mark}
          disabled={state === 'saving'}
          className="min-h-11 flex-1 rounded-full bg-app-accent px-4 text-sm font-bold text-[#14151a] disabled:opacity-50"
        >
          {target === 'attended' ? 'Sí, fui' : 'Sí, voy'}
        </button>
        <button
          type="button"
          onClick={close}
          className="min-h-11 rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink"
        >
          Ahora no
        </button>
      </div>
    </section>
  );
};

export default AttendanceSuggestion;
