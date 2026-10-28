import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import DetailHeader from '../components/ui/DetailHeader';
import { Spinner } from '../components/ui/AppPrimitives';
import { formatEuros, MERCH_STATUS_LABELS, MerchOrder, merchService } from '../services/merch.service';

// Every merch order of the user, newest first: the ones to collect and the
// souvenirs of past concerts.
const MerchOrders: React.FC = () => {
  const navigate = useNavigate();
  const contentRef = useRef<HTMLElement | null>(null);
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    merchService
      .myOrders()
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader title="Mis pedidos" scrollRef={contentRef} fallbackHref="/tabs/profile" />
      <div className="mx-auto flex max-w-lg flex-col gap-2 px-4 pb-[calc(40px+env(safe-area-inset-bottom,0px))] pt-[calc(72px+env(safe-area-inset-top,0px))]">
        <h1 className="pb-2 font-display text-2xl font-bold text-app-ink">Mis pedidos de merch</h1>
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-white/60">Aún no has reservado merch. Lo verás en la ficha de cada concierto que lo venda.</p>
        ) : (
          orders.map(order => (
            <button
              key={order.id}
              type="button"
              onClick={() => navigate(`/pedidos/${order.id}`)}
              className="flex w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-bold text-app-ink">{order.event?.name || 'Concierto'}</span>
                <span className="block truncate text-[13px] text-[#c9c5bd]">
                  {order.lines.map(line => `${line.quantity} × ${line.itemName}`).join(', ')}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-sm text-app-ink">{formatEuros(order.totalCents)}</span>
                <span className={`block text-[11px] font-semibold ${order.status === 'paid' ? 'text-app-accent' : 'text-white/50'}`}>
                  {MERCH_STATUS_LABELS[order.status]}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </AppShell>
  );
};

export default MerchOrders;
