import React from 'react';
import { IconCheckCircle } from '../../components/icons';
import { EventMerchStand, formatEuros } from '../../services/merch.service';
import MerchItemCard from './MerchItemCard';
import MerchPickupInfo from './MerchPickupInfo';
import { Cart, cartTotalCents, cartUnits } from './merchRules';

export type MerchStandViewProps = {
  stand: EventMerchStand;
  startsAt: string;
  endsAt?: string | null;
  venueName?: string | null;
  showSellerName?: boolean;
  cart: Cart;
  onChange: (variantId: string, delta: number, stock: number | null) => void;
  onReserve: () => void;
  busy?: boolean;
  error?: string;
  /** The buyer pressed «Reservar» but is not marked as going yet. */
  needsAttendance?: boolean;
  onAttend?: () => void;
  attending?: boolean;
};

// One seller's merch at the concert: a grid of product photos, one line on
// pickup, and «Reservar» fixed at the bottom of the screen while something is
// in the reservation. Presentational: EventMerchSection feeds it.
const MerchStandView: React.FC<MerchStandViewProps> = ({
  stand,
  startsAt,
  endsAt,
  venueName: _venueName,
  showSellerName,
  cart,
  onChange,
  onReserve,
  busy,
  error,
  needsAttendance,
  onAttend,
  attending,
}) => {
  const variantIds = stand.items.flatMap(item => item.variants.map(variant => variant.id));
  const prices = new Map(stand.items.flatMap(item => item.variants.map(variant => [variant.id, item.priceCents] as const)));
  const total = cartTotalCents(cart, prices, variantIds);
  const units = cartUnits(cart, variantIds);
  const atStand = stand.paymentMethod === 'at_stand';

  return (
    <div className="flex flex-col gap-3">
      {showSellerName ? <p className="font-mono text-[11px] font-semibold uppercase text-[#8f8b84]">{stand.sellerName}</p> : null}

      <ul className="grid grid-cols-2 gap-x-3 gap-y-4">
        {stand.items.map(item => (
          <MerchItemCard key={item.id} item={item} quantities={cart} onChange={onChange} disabled={busy} />
        ))}
      </ul>

      <MerchPickupInfo
        pickupPoint={stand.pickupPoint}
        paymentMethod={stand.paymentMethod}
        startsAt={startsAt}
        endsAt={endsAt}
      />

      {needsAttendance ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-app-accent bg-app-accent/10 p-3.5">
          <p className="font-display text-[15px] font-bold text-app-ink">Solo para quien va</p>
          <button
            type="button"
            disabled={attending}
            onClick={onAttend}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-app-accent px-5 text-[15px] font-bold text-[#14151a] disabled:opacity-60"
          >
            <IconCheckCircle size={18} />
            {attending ? 'Guardando…' : 'Voy al concierto'}
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {units > 0 && !needsAttendance ? (
        // Fixed above the tab bar so it is always on screen while reserving.
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-4">
          <button
            type="button"
            disabled={busy}
            onClick={onReserve}
            className="pointer-events-auto flex min-h-[52px] w-full max-w-md items-center justify-between gap-3 rounded-full bg-app-accent pl-5 pr-2 text-[#14151a] shadow-[0_12px_30px_rgba(0,0,0,0.55)] disabled:opacity-60"
          >
            <span className="text-[16px] font-bold">{busy ? 'Reservando…' : atStand ? 'Reservar' : 'Reservar y pagar'}</span>
            <span className="flex items-center gap-2 rounded-full bg-[#14151a] px-3.5 py-2 font-mono text-[14px] font-bold text-app-ink">
              {formatEuros(total)}
              <span className="text-white/50">· {units}</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default MerchStandView;
