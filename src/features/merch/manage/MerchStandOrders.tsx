import React, { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/AppPrimitives';
import { formatEuros, MerchOrder, merchService, orderStatusLabel } from '../../../services/merch.service';
import { fieldClass } from './fields';

type MerchStandOrdersProps = { eventId: string; subjectId: string };

// «Pedidos y entrega» at the stand: type or tap the code and hand it over.
// A pay-at-stand reservation is charged on the spot and recorded as paid.
const MerchStandOrders: React.FC<MerchStandOrdersProps> = ({ eventId, subjectId }) => {
  const [orders, setOrders] = useState<MerchOrder[] | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setOrders(await merchService.ordersForStand(eventId, subjectId));
    } catch (err: any) {
      setError(err?.message || 'No se han podido cargar los pedidos.');
      setOrders([]);
    }
  }, [eventId, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const collect = async (value: string, order?: MerchOrder) => {
    if (!value.trim()) return;
    const due = order ?? orders?.find(candidate => candidate.pickupCode === value.trim().toUpperCase());
    if (due?.status === 'reserved' && !window.confirm(`Cobra ${formatEuros(due.totalCents)} y entrega el pedido ${due.pickupCode}.`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await merchService.collect(eventId, value);
      setCode('');
      setMessage(due?.status === 'reserved' ? `Entregado y cobrado: ${formatEuros(due.totalCents)}.` : 'Entregado.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se ha podido entregar.');
    } finally {
      setBusy(false);
    }
  };

  const toCollect = (orders || []).filter(order => order.status === 'reserved' || order.status === 'paid');
  const dueAtStand = toCollect.filter(order => order.status === 'reserved').reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={event => {
          event.preventDefault();
          void collect(code);
        }}
        className="flex gap-2"
      >
        <input
          className={`${fieldClass} font-mono uppercase tracking-[0.2em]`}
          placeholder="Código"
          aria-label="Código del pedido"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
        />
        <Button type="submit" disabled={busy || code.length !== 6}>
          Entregar
        </Button>
      </form>
      {message ? <p className="text-sm text-[#25d47b]">{message}</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {orders === null ? <Spinner /> : null}
      {orders?.length === 0 ? <p className="text-sm text-white/55">Sin reservas ni pedidos todavía.</p> : null}
      {toCollect.length ? (
        <p className="text-[13px] text-white/60">
          {toCollect.length} por entregar{dueAtStand ? ` · ${formatEuros(dueAtStand)} por cobrar en el puesto` : ''}
        </p>
      ) : null}
      {(orders || []).map(order => (
        <div key={order.id} className="flex items-center gap-3 border-t border-app-line pt-2">
          <span className="font-mono text-sm font-bold tracking-[0.15em]">{order.pickupCode}</span>
          <span className="min-w-0 flex-1 text-sm text-white/70">
            <span className="block truncate">{order.lines.map(line => `${line.quantity} × ${line.itemName} ${line.variantLabel}`).join(', ')}</span>
            <span className="block text-[12px] text-white/50">
              {formatEuros(order.totalCents)} · {order.paymentMethod === 'at_stand' ? 'paga en el puesto' : 'pagado en la app'}
            </span>
          </span>
          {order.status === 'paid' || order.status === 'reserved' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => collect(order.pickupCode, order)}
              className="min-h-11 shrink-0 px-2 text-sm font-semibold text-app-accent"
            >
              {order.status === 'reserved' ? 'Cobrar y entregar' : 'Entregar'}
            </button>
          ) : (
            <span className="shrink-0 text-xs text-white/50">{orderStatusLabel(order)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

export default MerchStandOrders;
