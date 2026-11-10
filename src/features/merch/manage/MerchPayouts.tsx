import React, { useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import { merchService } from '../../../services/merch.service';

type MerchPayoutsProps = { subjectId: string; chargesEnabled: boolean; onChargesEnabled: () => void };

// Optional: a Stripe account so the audience can pay in the app. Selling with
// pay-at-stand needs none of this.
const MerchPayouts: React.FC<MerchPayoutsProps> = ({ subjectId, chargesEnabled, onChargesEnabled }) => {
  const [status, setStatus] = useState<{ started: boolean; chargesEnabled: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (chargesEnabled) return;
    merchService
      .sellerStatus(subjectId)
      .then(next => {
        setStatus(next);
        if (next.chargesEnabled) onChargesEnabled();
      })
      .catch(() => setUnavailable('Los pagos en la app aún no están disponibles (o solo puede activarlos el propietario del perfil).'));
  }, [chargesEnabled, onChargesEnabled, subjectId]);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold">Cobros en la app (opcional)</h2>
      {chargesEnabled ? (
        <p className="text-sm text-white/70">Listo: los pagos en la app llegan a tu cuenta de Stripe, menos la comisión de Live Space.</p>
      ) : unavailable ? (
        <p className="text-sm text-white/60">{unavailable} Mientras tanto, vende con pago en el puesto.</p>
      ) : !status ? (
        <p className="text-sm text-white/50">Comprobando…</p>
      ) : (
        <>
          <p className="text-sm text-white/70">
            Para que paguen al reservar necesitas una cuenta de cobros con Stripe: datos fiscales y una cuenta bancaria. Con pago en el
            puesto no hace falta.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await merchService.startOnboarding(subjectId);
              } catch (err: any) {
                setUnavailable(err?.message || 'No se ha podido abrir Stripe.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {status.started ? 'Completar datos de cobro' : 'Configurar cobros'}
          </Button>
          {status.started ? (
            <button
              type="button"
              onClick={() =>
                merchService
                  .sellerStatus(subjectId)
                  .then(next => {
                    setStatus(next);
                    if (next.chargesEnabled) onChargesEnabled();
                  })
                  .catch(() => undefined)
              }
              className="min-h-11 self-start text-sm font-semibold text-app-accent"
            >
              Ya he terminado, comprobar
            </button>
          ) : null}
        </>
      )}
    </section>
  );
};

export default MerchPayouts;
