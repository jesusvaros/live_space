import React from 'react';
import { IconCheckCircle, IconWallet } from '../../components/icons';
import { EventMerchStand, formatEuros } from '../../services/merch.service';
import MerchItemCard from './MerchItemCard';
import MerchPickupInfo from './MerchPickupInfo';
import { Cart, cartTotalCents, cartUnits, paymentLabel } from './merchRules';

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

// One seller's merch at the concert: products, how to pay, the pickup
// instructions and «Reservar». Presentational: EventMerchSection feeds it.
const MerchStandView: React.FC<MerchStandViewProps> = ({
  stand,
  startsAt,
  endsAt,
  venueName,
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
      <div className="flex flex-wrap items-center gap-2">
        {showSellerName ? <p className="font-mono text-[11px] font-semibold uppercase text-[#8f8b84]">{stand.sellerName}</p> : null}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-app-accent/40 bg-app-accent/10 px-2.5 py-1 text-[12px] font-semibold text-app-accent">
          <IconWallet size={14} />
          {paymentLabel(stand.paymentMethod)}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {stand.items.map(item => (
          <MerchItemCard key={item.id} item={item} quantities={cart} onChange={onChange} disabled={busy} />
        ))}
      </ul>

      <MerchPickupInfo
        pickupPoint={stand.pickupPoint}
        paymentMethod={stand.paymentMethod}
        startsAt={startsAt}
        endsAt={endsAt}
        venueName={venueName}
      />

      {needsAttendance ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-app-accent bg-app-accent/10 p-3.5">
          <p className="font-display text-[15px] font-bold text-app-ink">El merch es para quien va al concierto</p>
          <p className="text-[13px] text-[#c9c5bd]">Márcate «Voy» y seguimos con tu reserva. Puedes quitarlo cuando quieras.</p>
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
        <button
          type="button"
          disabled={busy}
          onClick={onReserve}
          className="flex min-h-14 flex-col items-center justify-center rounded-full bg-app-accent px-5 text-[#14151a] disabled:opacity-60"
        >
          <span className="text-[15px] font-bold">
            {busy
              ? atStand
                ? 'Reservando…'
                : 'Abriendo el pago…'
              : `${atStand ? 'Reservar' : 'Reservar y pagar'} · ${units} ${units === 1 ? 'producto' : 'productos'} · ${formatEuros(total)}`}
          </span>
          {!busy ? <span className="text-[12px] font-semibold opacity-75">{paymentLabel(stand.paymentMethod)}</span> : null}
        </button>
      ) : null}
    </div>
  );
};

export default MerchStandView;
