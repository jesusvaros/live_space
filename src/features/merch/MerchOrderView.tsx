import React from 'react';
import { Link } from 'react-router-dom';
import { formatEuros, MerchOrder, orderStatusLabel } from '../../services/merch.service';
import MerchPickupInfo from './MerchPickupInfo';

type MerchOrderViewProps = {
  order: MerchOrder;
  /** QR of the pickup code as an SVG string (empty while it renders). */
  qr: string;
  onCancel?: () => void;
  cancelling?: boolean;
  error?: string;
};

const concertDate = (iso: string) => {
  const text = new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// What was reserved, for which concert, the code to show at the stand and
// how pickup works. Presentational: the page loads the order.
const MerchOrderView: React.FC<MerchOrderViewProps> = ({ order, qr, onCancel, cancelling, error }) => {
  const expired = order.status === 'reserved' && order.expiresAt !== null && Date.parse(order.expiresAt) < Date.now();
  const showCode = (order.status === 'paid' || order.status === 'reserved') && !expired;
  const atStand = order.paymentMethod === 'at_stand';

  return (
    <>
      {order.event ? (
        <Link to={`/event/${order.eventId}`} className="block">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-app-accent">Merch de</p>
          <p className="font-display text-2xl font-bold leading-tight text-app-ink">{order.event.name}</p>
          <p className="text-sm text-[#c9c5bd]">
            {[concertDate(order.event.startsAt), order.event.venueName].filter(Boolean).join(' · ')}
          </p>
        </Link>
      ) : null}

      <p className="font-mono text-[12px] font-semibold uppercase text-white/60">{orderStatusLabel(order)}</p>

      {order.status === 'pending' ? (
        <p className="rounded-2xl border border-app-line bg-app-surface p-4 text-sm text-white/70">
          Esperando la confirmación del pago… Si cerraste el pago sin terminar, el pedido se cancela solo en 30 minutos.
        </p>
      ) : null}

      {showCode ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-5 text-[#14151a]">
          <p className="text-sm font-semibold">{atStand ? 'Reservado. Enséñalo en el puesto' : 'Pagado. Enséñalo en el puesto'}</p>
          {qr ? (
            <div className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
          ) : (
            <div className="h-44 w-44 rounded-xl bg-black/5" aria-hidden />
          )}
          <p className="font-mono text-4xl font-bold tracking-[0.2em]" aria-label={`Código ${order.pickupCode.split('').join(' ')}`}>
            {order.pickupCode}
          </p>
          {atStand ? (
            <p className="rounded-full bg-[#14151a] px-3 py-1 text-[13px] font-bold text-white">
              Pagas {formatEuros(order.totalCents)} al recoger
            </p>
          ) : null}
        </div>
      ) : null}

      {expired ? (
        <p className="rounded-2xl border border-app-line bg-app-surface p-4 text-sm text-white/70">
          El puesto ya cerró y la reserva se ha liberado. Si aún estás allí, pregunta en el puesto.
        </p>
      ) : null}

      {order.status === 'collected' && order.collectedAt ? (
        <p className="text-sm text-white/70">
          Recogido el {new Date(order.collectedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
          {order.paidCents ? ` · pagado en el puesto ${formatEuros(order.paidCents)}` : ''}.
        </p>
      ) : null}

      {showCode && order.event ? (
        <MerchPickupInfo
          pickupPoint={order.pickupPoint}
          paymentMethod={order.paymentMethod}
          startsAt={order.event.startsAt}
          endsAt={order.event.endsAt}
          venueName={order.event.venueName}
          amountDueCents={atStand ? order.totalCents : null}
          hasCode
          reserved
        />
      ) : null}

      <ul className="flex flex-col divide-y divide-app-line rounded-2xl border border-app-line bg-app-surface">
        {order.lines.map((line, index) => (
          <li key={index} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px] text-app-ink">
            <span className="min-w-0">
              {line.quantity} × {line.itemName} <span className="text-white/55">· {line.variantLabel}</span>
            </span>
            <span className="font-mono text-sm">{formatEuros(line.unitPriceCents * line.quantity)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between px-4 py-3 font-semibold text-app-ink">
          <span>{atStand && order.status === 'reserved' ? 'A pagar en el puesto' : 'Total'}</span>
          <span className="font-mono">{formatEuros(order.totalCents)}</span>
        </li>
      </ul>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {order.status === 'reserved' && !expired && onCancel ? (
        <button
          type="button"
          disabled={cancelling}
          onClick={onCancel}
          className="min-h-12 rounded-full border border-app-line px-5 text-[15px] font-semibold text-app-ink disabled:opacity-60"
        >
          {cancelling ? 'Cancelando…' : 'Cancelar reserva'}
        </button>
      ) : null}

      <p className="text-xs text-white/45">
        {atStand
          ? 'Vende el artista o la sala; Live Space solo guarda tu reserva. Para cambios o devoluciones, habla con ellos en el puesto.'
          : 'El cobro lo hace el artista o la sala a través de Live Space. Para devoluciones, habla con ellos en el puesto.'}
      </p>
    </>
  );
};

export default MerchOrderView;
