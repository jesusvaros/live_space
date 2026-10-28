import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import AppShell from '../components/AppShell';
import DetailHeader from '../components/ui/DetailHeader';
import { Spinner } from '../components/ui/AppPrimitives';
import { qrSvg } from '../lib/qrPoster';
import { formatEuros, MERCH_STATUS_LABELS, MerchOrder as Order, merchService } from '../services/merch.service';

const POLL_MS = 3000;
const POLL_LIMIT = 40;

const concertDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// A merch order: what was bought, for which concert, and the code to show at
// the stand. Right after paying it waits for Stripe's confirmation.
const MerchOrder: React.FC = () => {
  const { id = '' } = useParams();
  const contentRef = useRef<HTMLElement | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    let timer: number | undefined;
    const load = async () => {
      try {
        const next = await merchService.order(id);
        if (cancelled) return;
        setOrder(next);
        if (next?.status === 'pending' && polls < POLL_LIMIT) {
          polls += 1;
          timer = window.setTimeout(load, POLL_MS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, reload]);

  // Closing the payment sheet: check again.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const listener = Browser.addListener('browserFinished', () => setReload(value => value + 1));
    return () => {
      void listener.then(handle => handle.remove());
    };
  }, []);

  useEffect(() => {
    if (!order?.pickupCode || order.status !== 'paid') return;
    qrSvg(order.pickupCode).then(setQr).catch(() => setQr(''));
  }, [order?.pickupCode, order?.status]);

  return (
    <AppShell headerProps={null} contentRef={contentRef}>
      <DetailHeader title="Tu pedido" scrollRef={contentRef} fallbackHref="/pedidos" />
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-[calc(40px+env(safe-area-inset-bottom,0px))] pt-[calc(72px+env(safe-area-inset-top,0px))]">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : !order ? (
          <p className="text-sm text-white/60">No encontramos este pedido.</p>
        ) : (
          <>
            {order.event ? (
              <Link to={`/event/${order.eventId}`} className="block">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-app-accent">Recuerdo de</p>
                <p className="font-display text-2xl font-bold leading-tight text-app-ink">{order.event.name}</p>
                <p className="text-sm capitalize text-[#c9c5bd]">
                  {[concertDate(order.event.startsAt), order.event.venueName].filter(Boolean).join(' · ')}
                </p>
              </Link>
            ) : null}

            <p className="font-mono text-[12px] font-semibold uppercase text-white/60">{MERCH_STATUS_LABELS[order.status]}</p>

            {order.status === 'pending' ? (
              <p className="rounded-2xl border border-app-line bg-app-surface p-4 text-sm text-white/70">
                Esperando la confirmación del pago… Si cerraste el pago sin terminar, el pedido se cancela solo en 30 minutos.
              </p>
            ) : null}

            {order.status === 'paid' ? (
              <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-5 text-[#14151a]">
                <p className="text-sm font-semibold">Enseña este código en el puesto</p>
                {qr ? <div className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
                <p className="font-mono text-4xl font-bold tracking-[0.2em]">{order.pickupCode}</p>
                <p className="text-center text-sm">Recogida: {order.pickupPoint}</p>
              </div>
            ) : null}

            {order.status === 'collected' && order.collectedAt ? (
              <p className="text-sm text-white/70">
                Recogido el {new Date(order.collectedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.
              </p>
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
                <span>Total</span>
                <span className="font-mono">{formatEuros(order.totalCents)}</span>
              </li>
            </ul>
            <p className="text-xs text-white/45">
              El cobro lo hace el artista o la sala a través de Live Space. Para devoluciones, habla con ellos en el puesto.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default MerchOrder;
