import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MerchItemForm from '../../features/merch/manage/MerchItemForm';
import MerchStandView from '../../features/merch/MerchStandView';
import MerchOrderView from '../../features/merch/MerchOrderView';
import { Cart, changeQuantity, emptyItemDraft } from '../../features/merch/merchRules';
import { qrSvg } from '../../lib/qrPoster';
import type { EventMerchStand, MerchOrder } from '../../services/merch.service';

// DEV ONLY (mounted under import.meta.env.DEV in App.tsx): the merch screens
// with invented data. ?vista=formulario | concierto | pedido.

const shirt = (color: string, print: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e9e4da"/>` +
      `<path d="M62 40l-34 20 14 30 18-8v88h80V82l18 8 14-30-34-20c-6 12-20 18-38 18s-32-6-38-18z" fill="${color}"/>` +
      `<text x="100" y="125" font-family="Arial Black,Arial" font-size="22" font-weight="900" text-anchor="middle" fill="${print}">LOBO</text></svg>`,
  )}`;
const poster = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1d1e24"/>' +
    '<rect x="50" y="22" width="100" height="156" fill="#ff5b2e"/><circle cx="100" cy="85" r="30" fill="#14151a"/>' +
    '<text x="100" y="150" font-family="Arial Black,Arial" font-size="16" font-weight="900" text-anchor="middle" fill="#14151a">GIRA 2026</text></svg>',
)}`;

const startsAt = new Date(Date.now() + 26 * 60 * 60 * 1000);
startsAt.setHours(21, 0, 0, 0);
const STARTS = startsAt.toISOString();

const stand: EventMerchStand = {
  sellerSubjectId: 'dev-seller',
  sellerName: 'Lobo',
  pickupPoint: 'Puesto de merch, a la izquierda de la barra',
  paymentMethod: 'at_stand',
  items: [
    {
      id: 'tee',
      sellerSubjectId: 'dev-seller',
      name: 'Camiseta gira 2026',
      description: null,
      imageUrl: shirt('#14151a', '#ff5b2e'),
      priceCents: 2500,
      active: true,
      variants: [
        { id: 'tee-s', label: 'S', stock: 0, position: 0 },
        { id: 'tee-m', label: 'M', stock: 3, position: 1 },
        { id: 'tee-l', label: 'L', stock: 12, position: 2 },
        { id: 'tee-xl', label: 'XL', stock: 8, position: 3 },
      ],
    },
    {
      id: 'poster',
      sellerSubjectId: 'dev-seller',
      name: 'Póster serigrafiado (50×70)',
      description: null,
      imageUrl: poster,
      priceCents: 1500,
      active: true,
      variants: [{ id: 'poster-u', label: 'Única', stock: null, position: 0 }],
    },
  ],
};

const order: MerchOrder = {
  id: 'dev-order',
  eventId: 'dev-event',
  sellerSubjectId: 'dev-seller',
  status: 'reserved',
  paymentMethod: 'at_stand',
  totalCents: 6500,
  paidCents: null,
  pickupCode: 'K7MPQ3',
  pickupPoint: stand.pickupPoint,
  createdAt: new Date().toISOString(),
  collectedAt: null,
  cancelledAt: null,
  expiresAt: new Date(startsAt.getTime() + 6 * 60 * 60 * 1000).toISOString(),
  lines: [
    { itemName: 'Camiseta gira 2026', variantLabel: 'M', quantity: 2, unitPriceCents: 2500 },
    { itemName: 'Póster serigrafiado (50×70)', variantLabel: 'Única', quantity: 1, unitPriceCents: 1500 },
  ],
  event: { name: 'Lobo · Gira 2026', startsAt: STARTS, endsAt: null, venueName: 'Sala Copérnico', city: 'Madrid' },
};

const MerchPlayground: React.FC = () => {
  const [params] = useSearchParams();
  const view = params.get('vista') || 'concierto';
  const [cart, setCart] = useState<Cart>({ 'tee-m': 2, 'poster-u': 1 });
  const [qr, setQr] = useState('');

  useEffect(() => {
    qrSvg(order.pickupCode).then(setQr).catch(() => setQr(''));
  }, []);

  const variantIds = stand.items.flatMap(item => item.variants.map(variant => variant.id));

  return (
    <div className="min-h-screen bg-app-bg px-4 pb-10 pt-6 text-app-ink">
      {view === 'formulario' ? (
        <>
          <h1 className="pb-4 font-display text-lg font-bold">Añadir producto</h1>
          <MerchItemForm
            initial={{
              ...emptyItemDraft(),
              name: 'Camiseta gira 2026',
              price: '25',
              imageUrl: shirt('#14151a', '#ff5b2e'),
              hasSizes: true,
              sizes: [
                { label: 'S', units: '10' },
                { label: 'M', units: '20' },
                { label: 'L', units: '20' },
                { label: 'XL', units: '' },
              ],
            }}
            uploadPhoto={async file => URL.createObjectURL(file)}
            onSave={async () => undefined}
            onCancel={() => undefined}
          />
        </>
      ) : view === 'pedido' ? (
        <div className="mx-auto flex max-w-lg flex-col gap-4">
          <MerchOrderView order={order} qr={qr} onCancel={() => undefined} />
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-app-ink">Merch del concierto</h2>
            <p className="text-sm text-[#c9c5bd]">Resérvalo ahora y recógelo esa noche en el puesto, sin colas ni agotados.</p>
          </div>
          <MerchStandView
            stand={stand}
            startsAt={STARTS}
            venueName="Sala Copérnico"
            cart={cart}
            onChange={(variantId, delta, stock) => setCart(current => changeQuantity(current, variantId, delta, stock, variantIds))}
            onReserve={() => undefined}
            needsAttendance={params.get('voy') === '0'}
            onAttend={() => undefined}
          />
        </section>
      )}
    </div>
  );
};

export default MerchPlayground;
