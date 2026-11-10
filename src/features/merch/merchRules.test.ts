import { describe, expect, it } from 'vitest';
import {
  addSize,
  type Cart,
  cartLines,
  cartTotalCents,
  cartUnits,
  changeQuantity,
  draftToItem,
  emptyItemDraft,
  fitWithin,
  itemStock,
  itemToDraft,
  paymentLabel,
  parsePriceCents,
  parseUnits,
  removeSize,
  reservationExpiresAt,
  reservationsClosed,
  stockLabel,
} from './merchRules';

describe('reservation window', () => {
  const startsAt = '2026-11-20T20:00:00.000Z';

  it('closes three hours after the start', () => {
    expect(reservationsClosed(startsAt, Date.parse('2026-11-20T22:59:00.000Z'))).toBe(false);
    expect(reservationsClosed(startsAt, Date.parse('2026-11-20T23:01:00.000Z'))).toBe(true);
  });

  it('holds reservations 6 h after the start without an end time', () => {
    expect(reservationExpiresAt(startsAt, null).toISOString()).toBe('2026-11-21T02:00:00.000Z');
  });

  it('holds them until an hour after a late end, never more than 24 h', () => {
    expect(reservationExpiresAt(startsAt, '2026-11-21T04:00:00.000Z').toISOString()).toBe('2026-11-21T05:00:00.000Z');
    expect(reservationExpiresAt(startsAt, '2026-11-20T22:00:00.000Z').toISOString()).toBe('2026-11-21T02:00:00.000Z');
    expect(reservationExpiresAt(startsAt, '2026-11-24T04:00:00.000Z').toISOString()).toBe('2026-11-21T20:00:00.000Z');
  });
});

describe('cart', () => {
  const prices = new Map([
    ['tee-m', 2500],
    ['tee-l', 2500],
    ['poster', 1000],
    ['other-stand', 9900],
  ]);

  it('adds and removes units, never below zero', () => {
    let cart = changeQuantity({}, 'tee-m', 1, 5);
    cart = changeQuantity(cart, 'tee-m', 1, 5);
    expect(cart).toEqual({ 'tee-m': 2 });
    cart = changeQuantity(cart, 'tee-m', -5, 5);
    expect(cart).toEqual({});
  });

  it('never goes past the stock', () => {
    let cart = changeQuantity({}, 'tee-l', 1, 1);
    cart = changeQuantity(cart, 'tee-l', 1, 1);
    expect(cart['tee-l']).toBe(1);
    expect(changeQuantity({}, 'tee-l', 1, 0)).toEqual({});
  });

  it('caps an order at 10 units across the stand, not across stands', () => {
    const stand = ['tee-m', 'tee-l', 'poster'];
    let cart: Cart = { 'tee-m': 6, 'tee-l': 3, 'other-stand': 4 };
    cart = changeQuantity(cart, 'poster', 5, null, stand);
    expect(cart.poster).toBe(1);
    expect(changeQuantity(cart, 'poster', 1, null, stand)).toBe(cart);
    // A variant with no stock limit still stops at 10.
    expect(changeQuantity({}, 'poster', 50, null)).toEqual({ poster: 10 });
  });

  it('totals and lines only count the stand asked for', () => {
    const cart = { 'tee-m': 2, poster: 1, 'other-stand': 1 };
    const stand = ['tee-m', 'tee-l', 'poster'];
    expect(cartUnits(cart, stand)).toBe(3);
    expect(cartUnits(cart)).toBe(4);
    expect(cartTotalCents(cart, prices, stand)).toBe(6000);
    expect(cartTotalCents(cart, prices)).toBe(15900);
    expect(cartLines(cart, stand)).toEqual([
      { variantId: 'tee-m', quantity: 2 },
      { variantId: 'poster', quantity: 1 },
    ]);
  });
});

describe('stock labels', () => {
  it('only speaks up when stock is low', () => {
    expect(stockLabel(null)).toBeNull();
    expect(stockLabel(40)).toBeNull();
    expect(stockLabel(5)).toBe('Quedan 5');
    expect(stockLabel(1)).toBe('Queda 1');
    expect(stockLabel(0)).toBe('Agotada');
  });

  it('adds up an item unless a size has no limit', () => {
    expect(itemStock([{ stock: 2 }, { stock: 1 }])).toBe(3);
    expect(itemStock([{ stock: 2 }, { stock: null }])).toBeNull();
  });

  it('names how the buyer pays', () => {
    expect(paymentLabel('at_stand')).toBe('Pagas en el puesto');
    expect(paymentLabel('in_app')).toBe('Pagas ahora en la app');
  });
});

describe('prices and units', () => {
  it('reads Spanish prices', () => {
    expect(parsePriceCents('25')).toBe(2500);
    expect(parsePriceCents('12,5')).toBe(1250);
    expect(parsePriceCents('12,50 €')).toBe(1250);
    expect(parsePriceCents('12.99')).toBe(1299);
    expect(parsePriceCents('12,999')).toBeNull();
    expect(parsePriceCents('doce')).toBeNull();
    expect(parsePriceCents('')).toBeNull();
  });

  it('reads units: empty means no limit', () => {
    expect(parseUnits('')).toBeNull();
    expect(parseUnits(' 30 ')).toBe(30);
    expect(parseUnits('0')).toBe(0);
    expect(parseUnits('-1')).toBeUndefined();
    expect(parseUnits('2.5')).toBeUndefined();
  });
});

describe('«Añadir producto» form', () => {
  const base = { ...emptyItemDraft(), name: '  Camiseta gira 2026 ', price: '25' };

  it('an item without sizes becomes one «Única» variant', () => {
    expect(draftToItem({ ...base, units: '40' })).toEqual({
      ok: true,
      name: 'Camiseta gira 2026',
      priceCents: 2500,
      variants: [{ label: 'Única', stock: 40 }],
    });
    expect(draftToItem(base)).toMatchObject({ ok: true, variants: [{ label: 'Única', stock: null }] });
  });

  it('each size keeps its own units', () => {
    let sizes = addSize([], 'M');
    sizes = addSize(sizes, 'L');
    sizes = addSize(sizes, 'm'); // already there
    sizes = addSize(sizes, ' Talla única niño ');
    expect(sizes.map(size => size.label)).toEqual(['M', 'L', 'Talla única niño']);
    sizes = removeSize(sizes, 'Talla única niño');
    sizes = sizes.map(size => (size.label === 'M' ? { ...size, units: '12' } : size));
    expect(draftToItem({ ...base, hasSizes: true, sizes })).toMatchObject({
      ok: true,
      variants: [
        { label: 'M', stock: 12 },
        { label: 'L', stock: null },
      ],
    });
  });

  it('explains what is wrong', () => {
    expect(draftToItem({ ...base, name: ' ' })).toEqual({ ok: false, error: 'Ponle un nombre.' });
    expect(draftToItem({ ...base, price: '0,50' })).toMatchObject({ ok: false });
    expect(draftToItem({ ...base, price: '501' })).toMatchObject({ ok: false });
    expect(draftToItem({ ...base, price: 'gratis' })).toMatchObject({ ok: false });
    expect(draftToItem({ ...base, hasSizes: true, sizes: [] })).toEqual({ ok: false, error: 'Elige al menos una talla.' });
    expect(draftToItem({ ...base, units: 'muchas' })).toMatchObject({ ok: false });
  });

  it('round-trips a saved item', () => {
    const single = itemToDraft({ id: 'a', name: 'Póster', priceCents: 1250, imageUrl: null, variants: [{ label: 'Única', stock: null }] });
    expect(single).toMatchObject({ hasSizes: false, units: '', price: '12,50', sizes: [] });
    const sized = itemToDraft({
      id: 'b',
      name: 'Sudadera',
      priceCents: 4000,
      imageUrl: 'https://x/y.webp',
      variants: [
        { label: 'S', stock: 3 },
        { label: 'M', stock: null },
      ],
    });
    expect(sized).toMatchObject({ hasSizes: true, price: '40', imageUrl: 'https://x/y.webp' });
    expect(sized.sizes).toEqual([
      { label: 'S', units: '3' },
      { label: 'M', units: '' },
    ]);
  });
});

describe('photo resize', () => {
  it('fits inside 1200 px keeping the ratio', () => {
    expect(fitWithin(4032, 3024, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
});
