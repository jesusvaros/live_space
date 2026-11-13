// Pure merch rules shared by the concert page and the seller screens. The
// database enforces the same limits (merch_reserve / merch_create_order); here
// they only keep the buttons honest.

export type PaymentMethod = 'in_app' | 'at_stand';

export const MAX_UNITS_PER_ORDER = 10;
/** Reservations close three hours after the start (as in merch_reserve). */
export const RESERVATIONS_CLOSE_AFTER_MS = 3 * 60 * 60 * 1000;
/** «Quedan 3» from this many units down. */
export const LOW_STOCK_THRESHOLD = 5;
export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 50000;
export const SINGLE_VARIANT_LABEL = 'Única';
export const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

const HOUR = 60 * 60 * 1000;

export const reservationsCloseAt = (startsAt: string) => new Date(Date.parse(startsAt) + RESERVATIONS_CLOSE_AFTER_MS);

export const reservationsClosed = (startsAt: string, now = Date.now()) => now > reservationsCloseAt(startsAt).getTime();

/** Mirrors merch_reservation_expires_at: 6 h after the start or 1 h after the end, capped at 24 h. */
export const reservationExpiresAt = (startsAt: string, endsAt: string | null | undefined) => {
  const start = Date.parse(startsAt);
  const end = endsAt ? Date.parse(endsAt) : Number.NaN;
  const latest = Number.isFinite(end) ? Math.max(start + 6 * HOUR, end + HOUR) : start + 6 * HOUR;
  return new Date(Math.min(latest, start + 24 * HOUR));
};

export type Cart = Record<string, number>; // variant id → quantity

export const cartUnits = (cart: Cart, variantIds?: Iterable<string>) => {
  const only = variantIds ? new Set(variantIds) : null;
  return Object.entries(cart).reduce((sum, [id, quantity]) => (only && !only.has(id) ? sum : sum + quantity), 0);
};

export const cartTotalCents = (cart: Cart, priceByVariant: Map<string, number>, variantIds?: Iterable<string>) => {
  const only = variantIds ? new Set(variantIds) : null;
  return Object.entries(cart).reduce(
    (sum, [id, quantity]) => (only && !only.has(id) ? sum : sum + (priceByVariant.get(id) ?? 0) * quantity),
    0,
  );
};

/**
 * Adds or removes units of a variant. Never below 0, never above the stock,
 * never more than 10 units in the order (counted over `orderVariantIds`, the
 * variants of the same stand).
 */
export const changeQuantity = (
  cart: Cart,
  variantId: string,
  delta: number,
  stock: number | null,
  orderVariantIds?: Iterable<string>,
): Cart => {
  const current = cart[variantId] || 0;
  const scope = orderVariantIds ? new Set(orderVariantIds) : null;
  const others = Object.entries(cart).reduce(
    (sum, [id, quantity]) => (id === variantId || (scope && !scope.has(id)) ? sum : sum + quantity),
    0,
  );
  const ceiling = Math.max(0, Math.min(stock ?? MAX_UNITS_PER_ORDER, MAX_UNITS_PER_ORDER - others));
  const next = Math.max(0, Math.min(current + delta, ceiling));
  if (next === current) return cart;
  const copy = { ...cart };
  if (next === 0) delete copy[variantId];
  else copy[variantId] = next;
  return copy;
};

export const cartLines = (cart: Cart, variantIds: Iterable<string>) => {
  const only = new Set(variantIds);
  return Object.entries(cart)
    .filter(([id, quantity]) => only.has(id) && quantity > 0)
    .map(([variantId, quantity]) => ({ variantId, quantity }));
};

/** «Agotada», «Quedan 3» or nothing when there is plenty (or no limit). */
export const stockLabel = (stock: number | null) => {
  if (stock === null) return null;
  if (stock <= 0) return 'Agotada';
  if (stock <= LOW_STOCK_THRESHOLD) return stock === 1 ? 'Queda 1' : `Quedan ${stock}`;
  return null;
};

/** Total units left of an item, or null when any size has no limit. */
export const itemStock = (variants: { stock: number | null }[]) =>
  variants.some(variant => variant.stock === null) ? null : variants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0);

export const paymentLabel = (method: PaymentMethod) => (method === 'at_stand' ? 'Pagas en el puesto' : 'Pagas ahora en la app');

// --- Seller form -------------------------------------------------------------

/** «12», «12,5», «12.50 €» → cents. Null when it is not a valid price. */
export const parsePriceCents = (text: string) => {
  const clean = text.replace(/€/g, '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
};

export const formatPriceInput = (cents: number) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)).replace('.', ',');

/** '' → null (no limit); digits → units. */
export const parseUnits = (text: string): number | null | undefined => {
  const clean = text.trim();
  if (clean === '') return null;
  if (!/^\d{1,5}$/.test(clean)) return undefined;
  return Number(clean);
};

export type SizeDraft = { label: string; units: string };

export type ItemDraft = {
  id: string | null;
  name: string;
  price: string;
  imageUrl: string;
  hasSizes: boolean;
  /** Units when the item has no sizes. */
  units: string;
  sizes: SizeDraft[];
};

export const emptyItemDraft = (): ItemDraft => ({
  id: null,
  name: '',
  price: '',
  imageUrl: '',
  hasSizes: false,
  units: '',
  sizes: [],
});

export const itemToDraft = (item: {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  variants: { label: string; stock: number | null }[];
}): ItemDraft => {
  const single = item.variants.length === 1 && item.variants[0].label === SINGLE_VARIANT_LABEL;
  const unitsText = (stock: number | null) => (stock === null ? '' : String(stock));
  return {
    id: item.id,
    name: item.name,
    price: formatPriceInput(item.priceCents),
    imageUrl: item.imageUrl || '',
    hasSizes: !single && item.variants.length > 0,
    units: single ? unitsText(item.variants[0].stock) : '',
    sizes: single ? [] : item.variants.map(variant => ({ label: variant.label, units: unitsText(variant.stock) })),
  };
};

/** Adds a size (preset or custom) once; same label in another case counts as the same. */
export const addSize = (sizes: SizeDraft[], label: string): SizeDraft[] => {
  const clean = label.trim().slice(0, 20);
  if (!clean || sizes.some(size => size.label.toLowerCase() === clean.toLowerCase())) return sizes;
  return [...sizes, { label: clean, units: '' }];
};

export const removeSize = (sizes: SizeDraft[], label: string) => sizes.filter(size => size.label !== label);

export type DraftResult =
  | { ok: true; name: string; priceCents: number; variants: { label: string; stock: number | null }[] }
  | { ok: false; error: string };

/** Validates the «Añadir producto» form and turns it into what saveItem stores. */
export const draftToItem = (draft: ItemDraft): DraftResult => {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'Ponle un nombre.' };
  if (name.length > 80) return { ok: false, error: 'El nombre es demasiado largo (máximo 80).' };
  const priceCents = parsePriceCents(draft.price);
  if (priceCents === null) return { ok: false, error: 'Escribe el precio en euros, por ejemplo 25 o 12,50.' };
  if (priceCents < MIN_PRICE_CENTS || priceCents > MAX_PRICE_CENTS) {
    return { ok: false, error: 'El precio tiene que estar entre 1 € y 500 €.' };
  }
  if (!draft.hasSizes) {
    const stock = parseUnits(draft.units);
    if (stock === undefined) return { ok: false, error: 'Las unidades tienen que ser un número (o vacío, sin límite).' };
    return { ok: true, name, priceCents, variants: [{ label: SINGLE_VARIANT_LABEL, stock }] };
  }
  if (draft.sizes.length === 0) return { ok: false, error: 'Elige al menos una talla.' };
  const variants: { label: string; stock: number | null }[] = [];
  for (const size of draft.sizes) {
    const stock = parseUnits(size.units);
    if (stock === undefined) return { ok: false, error: `Las unidades de la talla ${size.label} tienen que ser un número.` };
    variants.push({ label: size.label.trim(), stock });
  }
  return { ok: true, name, priceCents, variants };
};

/** Width and height that fit inside a max×max box, keeping the aspect ratio. */
export const fitWithin = (width: number, height: number, max: number) => {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

// --- Profile -----------------------------------------------------------------

export type MerchStandRow = { eventId: string; sellerSubjectId: string; paymentMethod: PaymentMethod };

/**
 * Concerts with merch someone can actually reserve, in the order given: the
 * same filter as the concert page (a stand with active items, and either pay
 * at the stand or a seller who can take card payments).
 */
export const eventsWithReservableMerch = (
  stands: MerchStandRow[],
  canCharge: ReadonlySet<string>,
  sellersWithItems: ReadonlySet<string>,
) => {
  const ids: string[] = [];
  for (const stand of stands) {
    if (!sellersWithItems.has(stand.sellerSubjectId)) continue;
    if (stand.paymentMethod !== 'at_stand' && !canCharge.has(stand.sellerSubjectId)) continue;
    if (!ids.includes(stand.eventId)) ids.push(stand.eventId);
  }
  return ids;
};

/**
 * An order still waiting at the stand: paid or reserved, not expired, and its
 * concert not long over (the same window a reservation lives).
 */
export const isOrderToCollect = (
  order: { status: string; expiresAt: string | null; event: { startsAt: string; endsAt: string | null } | null },
  now = Date.now(),
) => {
  if (order.status !== 'paid' && order.status !== 'reserved') return false;
  if (order.expiresAt && Date.parse(order.expiresAt) < now) return false;
  if (!order.event) return order.status === 'paid';
  return now <= reservationExpiresAt(order.event.startsAt, order.event.endsAt).getTime();
};
