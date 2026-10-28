import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { EventMerchStand, formatEuros, MerchItem, merchService } from '../../services/merch.service';

type EventMerchSectionProps = { eventId: string; startsAt: string };

const CLOSES_AFTER_MS = 3 * 60 * 60 * 1000;

type Cart = Record<string, number>; // variant id → quantity

// "Merch del concierto": reserve and pay in the app, collect at the stand.
// Hidden when nobody sells at this concert or reservations are closed.
const EventMerchSection: React.FC<EventMerchSectionProps> = ({ eventId, startsAt }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stands, setStands] = useState<EventMerchStand[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const closed = Date.now() > Date.parse(startsAt) + CLOSES_AFTER_MS;

  useEffect(() => {
    if (closed) return undefined;
    let cancelled = false;
    merchService
      .forEvent(eventId)
      .then(list => {
        if (!cancelled) setStands(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId, closed]);

  const variantPrice = useMemo(() => {
    const prices = new Map<string, number>();
    for (const stand of stands) for (const item of stand.items) for (const variant of item.variants) prices.set(variant.id, item.priceCents);
    return prices;
  }, [stands]);

  if (closed || stands.length === 0) return null;

  const change = (variantId: string, delta: number, max: number | null) => {
    setCart(current => {
      const next = Math.max(0, Math.min((current[variantId] || 0) + delta, max ?? 10, 10));
      const copy = { ...current };
      if (next === 0) delete copy[variantId];
      else copy[variantId] = next;
      return copy;
    });
  };

  const pay = async (stand: EventMerchStand) => {
    if (!user) {
      navigate('/welcome');
      return;
    }
    const variantIds = new Set(stand.items.flatMap(item => item.variants.map(variant => variant.id)));
    const lines = Object.entries(cart)
      .filter(([variantId]) => variantIds.has(variantId))
      .map(([variantId, quantity]) => ({ variantId, quantity }));
    if (lines.length === 0) return;
    setPaying(stand.sellerSubjectId);
    setError('');
    try {
      const orderId = await merchService.checkout({ eventId, sellerSubjectId: stand.sellerSubjectId, lines });
      navigate(`/pedidos/${orderId}`);
    } catch (err: any) {
      setError(err?.message || 'No se ha podido iniciar el pago.');
    } finally {
      setPaying(null);
    }
  };

  const renderItem = (item: MerchItem) => (
    <li key={item.id} className="flex gap-3 rounded-2xl border border-app-line bg-app-surface p-2.5">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-bold leading-snug text-app-ink">{item.name}</p>
        <p className="font-mono text-[13px] font-semibold text-app-accent">{formatEuros(item.priceCents)}</p>
        {item.description ? <p className="mt-0.5 text-[13px] text-[#c9c5bd] line-clamp-2">{item.description}</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.variants.map(variant => {
            const quantity = cart[variant.id] || 0;
            const soldOut = variant.stock === 0;
            return (
              <span
                key={variant.id}
                className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-1 text-[13px] font-semibold ${
                  quantity > 0 ? 'border-app-accent text-app-ink' : 'border-app-line text-[#c9c5bd]'
                } ${soldOut ? 'opacity-45' : ''}`}
              >
                {quantity > 0 ? (
                  <button
                    type="button"
                    aria-label={`Quitar una ${variant.label}`}
                    onClick={() => change(variant.id, -1, variant.stock)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                  >
                    −
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={soldOut}
                  aria-label={soldOut ? `${variant.label} agotada` : `Añadir ${variant.label}`}
                  onClick={() => change(variant.id, 1, variant.stock)}
                  className="inline-flex h-8 items-center px-2"
                >
                  {variant.label}
                  {quantity > 0 ? ` × ${quantity}` : soldOut ? ' · agotada' : ''}
                </button>
              </span>
            );
          })}
        </div>
      </div>
    </li>
  );

  return (
    <section aria-labelledby="merch" className="flex flex-col gap-3">
      <div>
        <h2 id="merch" className="font-display text-xl font-bold text-app-ink">
          Merch del concierto
        </h2>
        <p className="text-sm text-[#c9c5bd]">Resérvalo y págalo aquí. Lo recoges esa noche sin hacer cola.</p>
      </div>
      {stands.map(stand => {
        const total = Object.entries(cart).reduce((sum, [variantId, quantity]) => {
          const inStand = stand.items.some(item => item.variants.some(variant => variant.id === variantId));
          return inStand ? sum + (variantPrice.get(variantId) || 0) * quantity : sum;
        }, 0);
        return (
          <div key={stand.sellerSubjectId} className="flex flex-col gap-2">
            {stands.length > 1 ? <p className="font-mono text-[11px] font-semibold uppercase text-[#8f8b84]">{stand.sellerName}</p> : null}
            <ul className="flex flex-col gap-2">{stand.items.map(renderItem)}</ul>
            <p className="text-[13px] text-white/60">Recogida: {stand.pickupPoint}</p>
            {total > 0 ? (
              <button
                type="button"
                disabled={paying !== null}
                onClick={() => pay(stand)}
                className="min-h-12 rounded-full bg-app-accent px-5 text-[15px] font-bold text-[#14151a] disabled:opacity-60"
              >
                {paying === stand.sellerSubjectId ? 'Abriendo el pago…' : `Reservar y pagar · ${formatEuros(total)}`}
              </button>
            ) : null}
          </div>
        );
      })}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {user ? (
        <button type="button" onClick={() => navigate('/pedidos')} className="self-start text-sm font-semibold text-app-accent">
          Ver mis pedidos
        </button>
      ) : null}
    </section>
  );
};

export default EventMerchSection;
