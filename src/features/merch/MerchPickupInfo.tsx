import React from 'react';
import { IconClock, IconMap, IconQrCode, IconWallet } from '../../components/icons';
import { formatEuros } from '../../services/merch.service';
import { PaymentMethod, reservationExpiresAt, reservationsCloseAt } from './merchRules';

type MerchPickupInfoProps = {
  pickupPoint: string;
  paymentMethod: PaymentMethod;
  startsAt: string;
  endsAt?: string | null;
  venueName?: string | null;
  /** On the order page: the amount still to pay at the stand. */
  amountDueCents?: number | null;
  /** On the order page the code is right above: say so instead of explaining. */
  hasCode?: boolean;
  /** Already reserved: no need to say until when reservations stay open. */
  reserved?: boolean;
};

const time = (date: Date) => date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const day = (date: Date) => {
  const text = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const Row: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <li className="flex gap-3">
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8f8b84]">{title}</span>
      <span className="block text-[14px] leading-snug text-app-ink">{children}</span>
    </span>
  </li>
);

// Where, when, what to bring and how to pay. Pickup is always at the
// concert's merch stand: no shipping.
const MerchPickupInfo: React.FC<MerchPickupInfoProps> = ({
  pickupPoint,
  paymentMethod,
  startsAt,
  endsAt,
  venueName,
  amountDueCents,
  hasCode,
  reserved,
}) => {
  const start = new Date(startsAt);
  const closes = reservationsCloseAt(startsAt);
  const holdsUntil = reservationExpiresAt(startsAt, endsAt);
  const atStand = paymentMethod === 'at_stand';

  return (
    <div className="rounded-2xl border border-app-line bg-app-surface p-3.5">
      <p className="pb-3 font-display text-[15px] font-bold text-app-ink">Recogida en el concierto</p>
      <ul className="flex flex-col gap-3">
        <Row icon={<IconMap size={16} />} title="Dónde">
          {pickupPoint}
          {venueName ? <span className="text-white/55"> · {venueName}</span> : null}
          <span className="block text-[12px] text-white/50">Sin envíos: solo se recoge allí.</span>
        </Row>
        <Row icon={<IconClock size={16} />} title="Cuándo">
          {day(start)}, la noche del concierto (empieza a las {time(start)}).
          <span className="block text-[12px] text-white/50">
            {reserved
              ? atStand
                ? `Tu reserva se guarda hasta las ${time(holdsUntil)}. Si no la recoges, se libera.`
                : 'Recógelo esa misma noche.'
              : `Puedes reservar hasta las ${time(closes)}.${atStand ? ` Lo que no se recoja antes de las ${time(holdsUntil)} se libera.` : ''}`}
          </span>
        </Row>
        <Row icon={<IconQrCode size={16} />} title="Qué llevar">
          {hasCode ? 'Este código o el QR, en el móvil.' : 'El código de 6 letras o el QR que te damos al reservar.'}
          <span className="block text-[12px] text-white/50">Lo tienes siempre en «Mis pedidos».</span>
        </Row>
        <Row icon={<IconWallet size={16} />} title="Cómo pagas">
          {atStand ? (
            <>
              En el puesto, al recoger{amountDueCents ? `: ${formatEuros(amountDueCents)}` : ''}.
              <span className="block text-[12px] text-white/50">Efectivo o tarjeta, lo que acepte el puesto. Reservar no cuesta nada.</span>
            </>
          ) : (
            <>
              Ahora, en la app.
              <span className="block text-[12px] text-white/50">En el puesto solo enseñas el código.</span>
            </>
          )}
        </Row>
      </ul>
    </div>
  );
};

export default MerchPickupInfo;
