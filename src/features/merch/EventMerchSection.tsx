import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthPanel from '../../auth/AuthPanel';
import { Modal } from '../../components/ui/AppPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { EventMerchStand, merchService } from '../../services/merch.service';
import MerchStandView from './MerchStandView';
import { Cart, cartLines, changeQuantity, reservationsClosed } from './merchRules';

type EventMerchSectionProps = {
  eventId: string;
  startsAt: string;
  endsAt?: string | null;
  venueName?: string | null;
  /** The signed-in user is marked as going (or went). */
  attending: boolean;
  /** Marks the user as going; resolves false if it failed. */
  onAttend: () => Promise<boolean>;
};

// «Merch del concierto». Anyone sees it; only people going to the concert
// reserve. Pickup is always at the stand; each seller picks how to pay
// (in the app or at the stand). Hidden when nobody sells or reservations closed.
const EventMerchSection: React.FC<EventMerchSectionProps> = ({ eventId, startsAt, endsAt, venueName, attending, onAttend }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [stands, setStands] = useState<EventMerchStand[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ stand: string; message: string } | null>(null);
  const [needsAttendance, setNeedsAttendance] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [authFor, setAuthFor] = useState<string | null>(null);
  const closed = reservationsClosed(startsAt);

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

  // Signed in from the sheet: close it and carry on (the «Voy» step shows
  // only if the user is not going yet; the cart is kept).
  useEffect(() => {
    if (!user || !authFor) return;
    setNeedsAttendance(authFor);
    setAuthFor(null);
  }, [user, authFor]);

  if (closed || stands.length === 0) return null;

  const variantIdsOf = (stand: EventMerchStand) => stand.items.flatMap(item => item.variants.map(variant => variant.id));

  const submit = async (stand: EventMerchStand) => {
    const lines = cartLines(cart, variantIdsOf(stand));
    if (lines.length === 0) return;
    setBusy(stand.sellerSubjectId);
    setError(null);
    try {
      const input = { eventId, sellerSubjectId: stand.sellerSubjectId, lines };
      const orderId = stand.paymentMethod === 'at_stand' ? await merchService.reserve(input) : await merchService.checkout(input);
      navigate(`/pedidos/${orderId}`);
    } catch (err: any) {
      setError({ stand: stand.sellerSubjectId, message: err?.message || 'No se ha podido reservar.' });
      // Stock may have changed under us.
      merchService.forEvent(eventId).then(setStands).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const reserve = (stand: EventMerchStand) => {
    if (!user) {
      setAuthFor(stand.sellerSubjectId);
      return;
    }
    if (!attending) {
      setNeedsAttendance(stand.sellerSubjectId);
      return;
    }
    void submit(stand);
  };

  const attend = async (stand: EventMerchStand) => {
    setMarking(true);
    const ok = await onAttend();
    setMarking(false);
    if (!ok) {
      setError({ stand: stand.sellerSubjectId, message: 'No hemos podido marcarte «Voy». Inténtalo de nuevo.' });
      return;
    }
    setNeedsAttendance(null);
    void submit(stand);
  };

  return (
    <section aria-labelledby="merch" className="flex flex-col gap-3">
      <div>
        <h2 id="merch" className="font-display text-xl font-bold text-app-ink">
          Merch del concierto
        </h2>
        <p className="text-sm text-[#c9c5bd]">Resérvalo ahora y recógelo esa noche en el puesto, sin colas ni agotados.</p>
      </div>

      {stands.map(stand => (
        <MerchStandView
          key={stand.sellerSubjectId}
          stand={stand}
          startsAt={startsAt}
          endsAt={endsAt}
          venueName={venueName}
          showSellerName={stands.length > 1}
          cart={cart}
          onChange={(variantId, delta, stock) => setCart(current => changeQuantity(current, variantId, delta, stock, variantIdsOf(stand)))}
          onReserve={() => reserve(stand)}
          busy={busy === stand.sellerSubjectId}
          error={error?.stand === stand.sellerSubjectId ? error.message : ''}
          needsAttendance={needsAttendance === stand.sellerSubjectId && !attending}
          onAttend={() => attend(stand)}
          attending={marking}
        />
      ))}

      {user ? (
        <button type="button" onClick={() => navigate('/pedidos')} className="min-h-11 self-start text-sm font-semibold text-app-accent">
          Ver mis pedidos
        </button>
      ) : null}

      <Modal isOpen={authFor !== null} onDidDismiss={() => setAuthFor(null)} initialBreakpoint={0.95} title="Entra para reservar">
        <div className="max-h-[90dvh] overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <h3 className="m-0 font-display text-2xl font-bold text-app-ink">Entra para reservar</h3>
          <p className="m-0 mt-1.5 text-sm text-[#c9c5bd]">
            Te guardamos el merch con tu cuenta y te damos el código para recogerlo en el puesto.
          </p>
          <div className="mt-5">
            <AuthPanel defaultMode="signup" minimal providerReturnPath={`${location.pathname}${location.search}`} />
          </div>
        </div>
      </Modal>
    </section>
  );
};

export default EventMerchSection;
