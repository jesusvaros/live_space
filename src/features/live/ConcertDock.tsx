import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconCamera, IconQrCode } from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import { merchService, type MerchOrder } from '../../services/merch.service';
import { useAppResume } from '../../shared/hooks/useAppResume';
import { scheduleOpenNotification } from '../alerts/concertAlerts';
import { useUserConcertHero } from '../events/hooks/useUserConcertHero';

// Floating over every tab, just above the tab bar:
// - the merch pickup code, for the whole concert (from a few hours before
//   doors until the reservation is released), so it is one tap away at the
//   stand; plus a notification with the code when the concert starts;
// - «Sube lo de anoche» after a concert you went to, until you close it
//   (the morning-after notification is momentNudge.ts).

const HOUR = 60 * 60 * 1000;
const SHOW_BEFORE_MS = 3 * HOUR;
const FALLBACK_AFTER_START_MS = 10 * HOUR;
const NOTIFY_BEFORE_MS = 30 * 60 * 1000;

const activeStatuses = new Set(['reserved', 'paid']);

export const orderWindow = (order: Pick<MerchOrder, 'event' | 'expiresAt'>) => {
  if (!order.event) return null;
  const start = Date.parse(order.event.startsAt);
  const end = order.expiresAt ? Date.parse(order.expiresAt) : start + FALLBACK_AFTER_START_MS;
  return { start, from: start - SHOW_BEFORE_MS, to: end };
};

/** The code floats from a few hours before the concert until the reservation is released. */
export const isLive = (order: Pick<MerchOrder, 'event' | 'expiresAt'>, now: number) => {
  const span = orderWindow(order);
  return span ? now >= span.from && now <= span.to : false;
};

// Full-screen flows, and pages that already show the same thing.
const hiddenOn = (pathname: string) =>
  ['/tabs/upload', '/subir', '/pedidos/', '/welcome', '/bienvenida'].some(prefix => pathname.startsWith(prefix));

const pill =
  'pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 rounded-full border border-app-line bg-app-surface/95 py-1.5 pl-1.5 pr-2 text-left shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-md';

const ConcertDock: React.FC = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const resumeTick = useAppResume();
  const { hero, dismissPendingMoments } = useUserConcertHero();
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) {
      setOrders([]);
      return undefined;
    }
    let live = true;
    merchService
      .myOrders()
      .then(list => {
        if (!live) return;
        const active = list.filter(order => activeStatuses.has(order.status) && order.event);
        setOrders(active);
        // The code arrives as a notification half an hour before the concert.
        active.forEach(order => {
          const span = orderWindow(order);
          if (!span) return;
          void scheduleOpenNotification({
            key: `merch:${order.id}`,
            title: `Tu merch de ${order.event!.name}`,
            body: `Código ${order.pickupCode} · ${order.pickupPoint}`,
            at: new Date(span.start - NOTIFY_BEFORE_MS),
            path: `/pedidos/${order.id}`,
          }).catch(() => undefined);
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user, resumeTick]);

  // The window opens and closes on its own while the app stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (hiddenOn(pathname)) return null;

  const liveOrder = orders.find(order => isLive(order, now));
  // On Inicio the big hero already asks for last night's videos.
  const pending = hero.kind === 'just_attended' && pathname !== '/tabs/events' ? hero.event : null;

  if (!liveOrder && !pending) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-40 flex flex-col items-center gap-2 px-4">
      {liveOrder ? (
        <button type="button" onClick={() => navigate(`/pedidos/${liveOrder.id}`)} className={pill} aria-label={`Código de tu merch: ${liveOrder.pickupCode}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-accent text-[#14151a]">
            <IconQrCode size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[17px] font-bold tracking-[0.18em] text-app-ink">{liveOrder.pickupCode}</span>
            <span className="block truncate text-[12px] text-white/60">{liveOrder.pickupPoint}</span>
          </span>
        </button>
      ) : null}

      {pending ? (
        <div className={pill}>
          <button
            type="button"
            onClick={() => navigate(`/tabs/upload?event=${pending.id}`)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-ink text-app-bg">
              <IconCamera size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-app-ink">Sube lo de anoche</span>
              <span className="block truncate text-[12px] text-white/60">{pending.name}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => dismissPendingMoments(pending.id)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default ConcertDock;
