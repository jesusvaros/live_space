import React, { useState } from 'react';
import Button from '../../../components/ui/Button';
import type { ManagedEvent } from '../../../services/eventManagement.service';
import type { MerchStandSettings } from '../../../services/merch.service';
import { PaymentMethod } from '../merchRules';
import ProLockChip from '../../pro/ProLockChip';
import { merchFeeLabel } from '../../pro/planRules';
import { concertDateLabel, fieldClass, labelClass } from './fields';

type MerchStandEditorProps = {
  event: ManagedEvent;
  /** Current settings when already selling at this concert. */
  current: MerchStandSettings | null;
  chargesEnabled: boolean;
  atStandAvailable: boolean;
  /** Paying inside the app is a Pro perk. */
  isPro: boolean;
  onSave: (settings: MerchStandSettings) => Promise<void>;
  onStop: () => Promise<void>;
  onClose: () => void;
};

const Choice: React.FC<{
  checked: boolean;
  disabled?: boolean;
  title: string;
  detail: string;
  aside?: React.ReactNode;
  onSelect: () => void;
}> = ({ checked, disabled, title, detail, aside, onSelect }) => (
  <label
    className={`flex cursor-pointer gap-3 rounded-2xl border p-3.5 ${checked ? 'border-app-accent bg-app-accent/10' : 'border-app-line bg-app-surface'} ${
      disabled ? 'cursor-not-allowed opacity-45' : ''
    }`}
  >
    <input type="radio" name="payment" checked={checked} disabled={disabled} onChange={onSelect} className="mt-1 h-5 w-5 accent-[#ff5b2e]" />
    <span className="min-w-0 flex-1">
      <span className="block font-semibold text-app-ink">{title}</span>
      <span className="block text-[13px] text-white/60">{detail}</span>
    </span>
    {aside}
  </label>
);

// Turning merch on for one concert: where it is collected and how people pay.
const MerchStandEditor: React.FC<MerchStandEditorProps> = ({
  event,
  current,
  chargesEnabled,
  atStandAvailable,
  isPro,
  onSave,
  onStop,
  onClose,
}) => {
  const inAppAllowed = isPro && chargesEnabled;
  const defaultMethod: PaymentMethod = current?.paymentMethod ?? (atStandAvailable || !inAppAllowed ? 'at_stand' : 'in_app');
  const [pickupPoint, setPickupPoint] = useState(current?.pickupPoint ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultMethod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canSave = paymentMethod === 'at_stand' ? atStandAvailable : inAppAllowed;

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (err: any) {
      setError(err?.message || 'No se ha podido guardar.');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-app-line bg-app-surface p-3.5">
        <p className="font-mono text-[11px] font-semibold uppercase text-[#8f8b84]">Concierto</p>
        <p className="font-display text-lg font-bold text-app-ink">{event.headliner?.name || event.name}</p>
        <p className="text-sm capitalize text-white/60">
          {[concertDateLabel(event.starts_at), event.venue_name || event.city].filter(Boolean).join(' · ')}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Dónde se recoge</span>
        <input
          className={fieldClass}
          placeholder="Puesto de merch, junto a la barra"
          maxLength={120}
          value={pickupPoint}
          onChange={e => setPickupPoint(e.target.value)}
        />
        <span className="text-[12px] text-white/50">Lo verá el público con su código. Solo recogida en el concierto, sin envíos.</span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} pb-1.5`}>Cómo paga el público</legend>
        <Choice
          checked={paymentMethod === 'at_stand'}
          disabled={!atStandAvailable}
          title="Pago en el puesto"
          detail={
            atStandAvailable
              ? 'Reservan gratis en la app y pagan al recoger, en efectivo o con tarjeta. Tú cobras como siempre.'
              : 'Disponible en cuanto se actualice la app.'
          }
          onSelect={() => setPaymentMethod('at_stand')}
        />
        <Choice
          checked={paymentMethod === 'in_app'}
          disabled={!inAppAllowed}
          title="Pago en la app"
          detail={
            !isPro
              ? 'Pagan al reservar, con tarjeta.'
              : chargesEnabled
                ? `Pagan al reservar. Te llega a Stripe, menos el ${merchFeeLabel()}.`
                : 'Necesita una cuenta de cobros con Stripe (abajo).'
          }
          aside={isPro ? null : <ProLockChip />}
          onSelect={() => setPaymentMethod('in_app')}
        />
      </fieldset>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          size="lg"
          className="flex-1"
          disabled={busy || !canSave}
          onClick={() => run(() => onSave({ pickupPoint: pickupPoint.trim() || 'Puesto de merch', paymentMethod }))}
        >
          {current ? 'Guardar' : 'Vender en este concierto'}
        </Button>
        <Button size="lg" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
      {current ? (
        <button type="button" disabled={busy} onClick={() => run(onStop)} className="min-h-11 self-start text-sm font-semibold text-rose-300">
          Dejar de vender en este concierto
        </button>
      ) : null}
    </div>
  );
};

export default MerchStandEditor;
