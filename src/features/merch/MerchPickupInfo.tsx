import React from 'react';
import { IconClock, IconMap, IconWallet } from '../../components/icons';
import { formatEuros } from '../../services/merch.service';
import { PaymentMethod, reservationExpiresAt } from './merchRules';

type MerchPickupInfoProps = {
  pickupPoint: string;
  paymentMethod: PaymentMethod;
  startsAt: string;
  endsAt?: string | null;
  /** On the order page: the amount still to pay at the stand. */
  amountDueCents?: number | null;
};

const time = (date: Date) => date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// Where, until when and how to pay, in one glanceable line of icons. Pickup
// is always at the concert's merch stand: no shipping.
const MerchPickupInfo: React.FC<MerchPickupInfoProps> = ({ pickupPoint, paymentMethod, startsAt, endsAt, amountDueCents }) => {
  const holdsUntil = reservationExpiresAt(startsAt, endsAt);
  const atStand = paymentMethod === 'at_stand';
  const item = 'inline-flex min-w-0 items-center gap-1.5';
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-white/70">
      <li className={item}>
        <IconMap size={14} />
        <span className="truncate">{pickupPoint}</span>
      </li>
      <li className={item}>
        <IconClock size={14} />
        Hasta las {time(holdsUntil)}
      </li>
      <li className={item}>
        <IconWallet size={14} />
        {atStand ? `En el puesto${amountDueCents ? ` · ${formatEuros(amountDueCents)}` : ''}` : 'Pagado'}
      </li>
    </ul>
  );
};

export default MerchPickupInfo;
