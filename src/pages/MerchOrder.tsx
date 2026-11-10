import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import AppShell from '../components/AppShell';
import DetailHeader from '../components/ui/DetailHeader';
import { Spinner } from '../components/ui/AppPrimitives';
import MerchOrderView from '../features/merch/MerchOrderView';
import { qrSvg } from '../lib/qrPoster';
import { MerchOrder as Order, merchService } from '../services/merch.service';

const POLL_MS = 3000;
const POLL_LIMIT = 40;

// A merch order: code + QR for the stand, pickup instructions and, for a
// pay-at-stand reservation, «Cancelar reserva». Right after paying in the app
// it waits for Stripe's confirmation.
const MerchOrder: React.FC = () => {
  const { id = '' } = useParams();
  const contentRef = useRef<HTMLElement | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState('');
  const [reload, setReload] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

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
    if (!order?.pickupCode || (order.status !== 'paid' && order.status !== 'reserved')) return;
    qrSvg(order.pickupCode).then(setQr).catch(() => setQr(''));
  }, [order?.pickupCode, order?.status]);

  const cancel = async () => {
    if (!order || !window.confirm('¿Cancelar la reserva? Las unidades vuelven a estar disponibles para otros.')) return;
    setCancelling(true);
    setError('');
    try {
      await merchService.cancelReservation(order.id);
      setReload(value => value + 1);
    } catch (err: any) {
      setError(err?.message || 'No se ha podido cancelar.');
    } finally {
      setCancelling(false);
    }
  };

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
          <MerchOrderView order={order} qr={qr} onCancel={cancel} cancelling={cancelling} error={error} />
        )}
      </div>
    </AppShell>
  );
};

export default MerchOrder;
