import React, { useState } from 'react';
import Button from '../ui/Button';
import { Spinner } from '../ui/AppPrimitives';
import { parseDatetimeLocalValue } from '../../lib/moments';
import { eventManagementService, ManagedEvent, scheduleState } from '../../services/eventManagement.service';

// «Aplazar» and «Cancelar» for one concert in /gestion. Two steps each, no
// browser dialogs. Whoever marked «Voy» or saved it gets a notice in the app.

type Mode = 'postpone' | 'cancel' | null;

const fieldClass =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-bg px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none';

export const cancelResultText = (released: number, paid: number) =>
  [
    'Cancelado.',
    released ? `${released} ${released === 1 ? 'reserva liberada' : 'reservas liberadas'}.` : '',
    paid ? `${paid} ${paid === 1 ? 'pedido pagado' : 'pedidos pagados'}: devuélvelos desde Stripe.` : '',
  ]
    .filter(Boolean)
    .join(' ');

const EventScheduleActions: React.FC<{ event: ManagedEvent; onDone: () => void }> = ({ event, onDone }) => {
  const [mode, setMode] = useState<Mode>(null);
  const [tbc, setTbc] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  if (!event.schedule) return null;
  if (scheduleState(event.schedule) === 'cancelled') {
    return <p className="px-4 pb-4 text-[13px] font-semibold text-white/60">Concierto cancelado.</p>;
  }

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'cancel') {
        const result = await eventManagementService.cancelEvent(event.id, reason.trim() || null);
        setMessage({ kind: 'ok', text: cancelResultText(result.releasedOrders, result.paidOrders) });
      } else {
        const parsed = tbc ? null : parseDatetimeLocalValue(date);
        if (!tbc && !parsed) throw new Error('Elige la nueva fecha o marca «Fecha por confirmar».');
        await eventManagementService.postponeEvent(event.id, parsed ? parsed.toISOString() : null, reason.trim() || null);
        setMessage({ kind: 'ok', text: 'Aplazado. Avisamos a quien iba.' });
      }
      setMode(null);
      onDone();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se ha podido guardar.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-app-line px-4 py-3.5">
      {mode === null ? (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => setMode('postpone')}>
            Aplazar
          </Button>
          <Button variant="secondary" size="sm" className="flex-1 !text-rose-300" onClick={() => setMode('cancel')}>
            Cancelar concierto
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="font-display text-base font-bold text-app-ink">
            {mode === 'cancel' ? '¿Cancelar el concierto?' : 'Aplazar el concierto'}
          </p>
          {mode === 'postpone' ? (
            <>
              <input
                type="datetime-local"
                aria-label="Nueva fecha"
                disabled={tbc}
                value={date}
                onChange={inputEvent => setDate(inputEvent.target.value)}
                className={`${fieldClass} disabled:opacity-40`}
              />
              <label className="flex min-h-11 items-center gap-2.5 text-[14px] text-app-ink">
                <input type="checkbox" checked={tbc} onChange={inputEvent => setTbc(inputEvent.target.checked)} className="h-5 w-5" />
                Fecha por confirmar
              </label>
            </>
          ) : null}
          <input
            type="text"
            maxLength={200}
            placeholder="Motivo (opcional)"
            value={reason}
            onChange={inputEvent => setReason(inputEvent.target.value)}
            className={fieldClass}
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setMode(null)} disabled={busy}>
              Volver
            </Button>
            <Button size="sm" className="flex-1 font-bold" onClick={run} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null}
              {mode === 'cancel' ? 'Sí, cancelar' : 'Aplazar'}
            </Button>
          </div>
        </div>
      )}
      {message ? (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-2 text-[13px] ${message.kind === 'error' ? 'text-rose-300' : 'text-white/70'}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
};

export default EventScheduleActions;
