import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../api';
import { isMissingRelation } from './claims.service';
import { compressProductPhoto } from '../features/merch/compressImage';
import { eventsWithReservableMerch, type MerchStandRow, type PaymentMethod } from '../features/merch/merchRules';

export type { PaymentMethod } from '../features/merch/merchRules';

export type MerchVariant = { id: string; label: string; stock: number | null; position: number };

export type MerchItem = {
  id: string;
  sellerSubjectId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  active: boolean;
  variants: MerchVariant[];
};

// One seller's merch at one concert.
export type EventMerchStand = {
  sellerSubjectId: string;
  sellerName: string;
  pickupPoint: string;
  paymentMethod: PaymentMethod;
  items: MerchItem[];
};

export type MerchOrderStatus = 'pending' | 'reserved' | 'paid' | 'collected' | 'cancelled' | 'refunded';

export type MerchOrderLine = { itemName: string; variantLabel: string; quantity: number; unitPriceCents: number };

export type MerchOrder = {
  id: string;
  eventId: string;
  sellerSubjectId: string;
  status: MerchOrderStatus;
  paymentMethod: PaymentMethod;
  totalCents: number;
  paidCents: number | null;
  pickupCode: string;
  pickupPoint: string;
  createdAt: string;
  collectedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  lines: MerchOrderLine[];
  event: { name: string; startsAt: string; endsAt: string | null; venueName: string | null; city: string | null } | null;
};

/** How a seller sells at one concert. */
export type MerchStandSettings = { pickupPoint: string; paymentMethod: PaymentMethod };

export const formatEuros = (cents: number) =>
  (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });

export const MERCH_STATUS_LABELS: Record<MerchOrderStatus, string> = {
  pending: 'Pendiente de pago',
  reserved: 'Reservado · pagas al recoger',
  paid: 'Pagado · por recoger',
  collected: 'Recogido',
  cancelled: 'Cancelado',
  refunded: 'Devuelto',
};

/** A reservation nobody collected: shown as «Caducado» rather than «Cancelado». */
export const orderStatusLabel = (order: Pick<MerchOrder, 'status' | 'expiresAt' | 'cancelledAt'>) => {
  if (order.status === 'cancelled' && order.expiresAt && order.cancelledAt && order.cancelledAt >= order.expiresAt) {
    return 'Caducado · no se recogió';
  }
  if (order.status === 'reserved' && order.expiresAt && Date.parse(order.expiresAt) < Date.now()) return 'Caducado · no se recogió';
  return MERCH_STATUS_LABELS[order.status];
};

const PHOTO_BUCKET = 'merch-photos';

const ITEM_COLUMNS = 'id,seller_subject_id,name,description,image_url,price_cents,active,variants:merch_variants(id,label,stock,position)';

const mapItem = (row: any): MerchItem => ({
  id: row.id,
  sellerSubjectId: row.seller_subject_id,
  name: row.name,
  description: row.description ?? null,
  imageUrl: row.image_url ?? null,
  priceCents: row.price_cents,
  active: row.active,
  variants: [...(row.variants || [])]
    .map((variant: any) => ({ id: variant.id, label: variant.label, stock: variant.stock ?? null, position: variant.position ?? 0 }))
    .sort((left, right) => left.position - right.position || left.label.localeCompare(right.label, 'es')),
});

// Columns added by 20261110050200_merch_pay_at_stand. Until it runs, reads fall
// back to the old columns and pay-at-stand stays hidden.
const ORDER_BASE = 'id,event_id,seller_subject_id,status,total_cents,pickup_code,pickup_point,created_at,collected_at';
const ORDER_AT_STAND = ',payment_method,expires_at,cancelled_at,paid_cents';
const ORDER_RELATIONS =
  ',lines:merch_order_lines(item_name,variant_label,quantity,unit_price_cents)' +
  ',event:events(name,starts_at,ends_at,city,venue:venue_places!events_venue_place_id_fkey(name))';

let atStandSchema: boolean | null = null;

/** Runs a read with the new columns, retrying with the old ones while the migration is not live. */
const withAtStandColumns = async <T>(
  run: (atStand: boolean) => PromiseLike<{ data: T | null; error: any }>,
): Promise<{ data: T | null; error: any; atStand: boolean }> => {
  if (atStandSchema !== false) {
    const result = await run(true);
    if (!result.error || !isMissingRelation(result.error)) {
      if (!result.error) atStandSchema = true;
      return { ...result, atStand: true };
    }
    atStandSchema = false;
  }
  const legacy = await run(false);
  return { ...legacy, atStand: false };
};

const orderColumns = (atStand: boolean) => ORDER_BASE + (atStand ? ORDER_AT_STAND : '') + ORDER_RELATIONS;

const mapOrder = (row: any): MerchOrder => ({
  id: row.id,
  eventId: row.event_id,
  sellerSubjectId: row.seller_subject_id,
  status: row.status,
  paymentMethod: row.payment_method === 'at_stand' ? 'at_stand' : 'in_app',
  totalCents: row.total_cents,
  paidCents: row.paid_cents ?? null,
  pickupCode: row.pickup_code,
  pickupPoint: row.pickup_point,
  createdAt: row.created_at,
  collectedAt: row.collected_at ?? null,
  cancelledAt: row.cancelled_at ?? null,
  expiresAt: row.expires_at ?? null,
  lines: (row.lines || []).map((line: any) => ({
    itemName: line.item_name,
    variantLabel: line.variant_label,
    quantity: line.quantity,
    unitPriceCents: line.unit_price_cents,
  })),
  event: row.event
    ? {
        name: row.event.name,
        startsAt: row.event.starts_at,
        endsAt: row.event.ends_at ?? null,
        venueName: row.event.venue?.name ?? null,
        city: row.event.city ?? null,
      }
    : null,
});

// Names of artists and venues by subject id.
const subjectNames = async (subjectIds: string[]) => {
  const names = new Map<string, string>();
  if (subjectIds.length === 0) return names;
  const [artists, venues] = await Promise.all([
    supabase.from('v_subject_artists').select('subject_id,name').in('subject_id', subjectIds),
    supabase.from('v_subject_venues').select('subject_id,name').in('subject_id', subjectIds),
  ]);
  for (const row of [...(artists.data || []), ...(venues.data || [])] as any[]) names.set(String(row.subject_id), row.name);
  return names;
};

const invoke = async <T>(name: string, body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // The function's own message (e.g. "No quedan unidades suficientes.").
    const message = await (error as any).context?.json?.().then((json: any) => json?.error).catch(() => null);
    throw new Error(message || 'No se ha podido completar la operación.');
  }
  return data as T;
};

const openExternal = async (url: string) => {
  if (Capacitor.isNativePlatform()) await Browser.open({ url, presentationStyle: 'popover' });
  else window.location.assign(url);
};

// merch_reserve / merch_collect raise "merch:<reason>".
const RESERVE_ERRORS: Record<string, string> = {
  auth: 'Entra en tu cuenta para reservar.',
  closed: 'Las reservas de este concierto ya están cerradas.',
  event: 'Este concierto no admite reservas.',
  not_selling: 'Este merch ya no se puede reservar en este concierto.',
  not_attending: 'Márcate «Voy» en el concierto para reservar su merch.',
  stock: 'No quedan unidades suficientes. Revisa las tallas.',
  variant: 'Uno de los productos ya no está disponible.',
  quantity: 'Como mucho 10 unidades por pedido y 10 de cada talla.',
  lines: 'Pedido no válido.',
  too_many_pending: 'Ya tienes tres reservas o pedidos sin pagar. Recoge o cancela alguno.',
};

const reason = (error: { message?: string } | null) => /merch:([a-z_]+)/.exec(error?.message ?? '')?.[1] ?? null;

// Gives back the stock of reservations nobody collected (no cron: lazily).
const releaseExpired = async (eventId: string | null) => {
  try {
    await supabase.rpc('merch_release_expired', eventId ? { p_event_id: eventId } : {});
  } catch {
    // Not live yet or offline: the stock shown may just be a bit low.
  }
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`);

export const merchService = {
  /**
   * Upcoming concerts (from `fromIso`) with merch that can be reserved, in a
   * city and/or among some concerts (the ones the user is going to). Ids only,
   * in no particular order; read-only and public under RLS.
   */
  async upcomingEventIdsWithMerch(options: { fromIso: string; city?: string | null; eventIds?: string[] }): Promise<string[]> {
    const city = options.city?.trim() || null;
    const eventIds = options.eventIds ?? [];
    if (!city && eventIds.length === 0) return [];

    const standsIn = (scope: 'city' | 'ids') =>
      withAtStandColumns<any[]>(withMethod => {
        let query = supabase
          .from('event_merch')
          .select(`event_id,seller_subject_id${withMethod ? ',payment_method' : ''},event:events!inner(starts_at,city,status)`)
          .gte('event.starts_at', options.fromIso)
          .eq('event.status', 'published')
          .limit(200);
        query = scope === 'city' ? query.ilike('event.city', escapeLike(city!)) : query.in('event_id', eventIds);
        return query;
      });

    const results = await Promise.all([
      city ? standsIn('city') : Promise.resolve({ data: [] as any[], error: null, atStand: true }),
      eventIds.length ? standsIn('ids') : Promise.resolve({ data: [] as any[], error: null, atStand: true }),
    ]);
    for (const result of results) {
      if (result.error) {
        if (isMissingRelation(result.error)) return [];
        throw result.error;
      }
    }
    const stands: MerchStandRow[] = results.flatMap(result =>
      (result.data || []).map((row: any) => ({
        eventId: String(row.event_id),
        sellerSubjectId: String(row.seller_subject_id),
        paymentMethod: result.atStand && row.payment_method === 'at_stand' ? ('at_stand' as const) : ('in_app' as const),
      })),
    );
    const sellerIds = [...new Set(stands.map(stand => stand.sellerSubjectId))];
    if (sellerIds.length === 0) return [];

    const [sellers, items] = await Promise.all([
      supabase.from('merch_sellers').select('subject_id,charges_enabled').in('subject_id', sellerIds),
      supabase.from('merch_items').select('seller_subject_id').in('seller_subject_id', sellerIds).eq('active', true),
    ]);
    if (sellers.error) throw sellers.error;
    if (items.error) throw items.error;
    const canCharge = new Set((sellers.data || []).filter((row: any) => row.charges_enabled).map((row: any) => String(row.subject_id)));
    const withItems = new Set((items.data || []).map((row: any) => String(row.seller_subject_id)));
    return eventsWithReservableMerch(stands, canCharge, withItems);
  },

  // Stands with something to sell at this concert. Empty until the migration runs.
  async forEvent(eventId: string): Promise<EventMerchStand[]> {
    await releaseExpired(eventId);
    const { data: stands, error, atStand } = await withAtStandColumns<any[]>(withMethod =>
      supabase
        .from('event_merch')
        .select(withMethod ? 'seller_subject_id,pickup_point,payment_method' : 'seller_subject_id,pickup_point')
        .eq('event_id', eventId),
    );
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    const sellerIds = (stands || []).map((row: any) => String(row.seller_subject_id));
    if (sellerIds.length === 0) return [];

    const [{ data: sellers }, { data: items }, names] = await Promise.all([
      supabase.from('merch_sellers').select('subject_id,charges_enabled').in('subject_id', sellerIds),
      supabase.from('merch_items').select(ITEM_COLUMNS).in('seller_subject_id', sellerIds).eq('active', true).order('created_at'),
      subjectNames(sellerIds),
    ]);
    const canCharge = new Set((sellers || []).filter((row: any) => row.charges_enabled).map((row: any) => String(row.subject_id)));
    return (stands || [])
      .map((row: any): EventMerchStand => ({
        sellerSubjectId: String(row.seller_subject_id),
        sellerName: names.get(String(row.seller_subject_id)) || 'Merch',
        pickupPoint: row.pickup_point,
        paymentMethod: atStand && row.payment_method === 'at_stand' ? 'at_stand' : 'in_app',
        items: (items || []).map(mapItem).filter(item => item.sellerSubjectId === String(row.seller_subject_id)),
      }))
      .filter(stand => (stand.paymentMethod === 'at_stand' || canCharge.has(stand.sellerSubjectId)) && stand.items.length > 0);
  },

  // In-app payment: reserves the stock and opens Stripe Checkout. Returns the order id.
  async checkout(input: { eventId: string; sellerSubjectId: string; lines: { variantId: string; quantity: number }[] }) {
    const result = await invoke<{ orderId: string; url: string }>('merch-checkout', input);
    await openExternal(result.url);
    return result.orderId;
  },

  // Pay at the stand: reserves the stock without paying. Returns the order id.
  async reserve(input: { eventId: string; sellerSubjectId: string; lines: { variantId: string; quantity: number }[] }) {
    const { data, error } = await supabase.rpc('merch_reserve', {
      p_event_id: input.eventId,
      p_seller_subject_id: input.sellerSubjectId,
      p_lines: input.lines.map(line => ({ variant_id: line.variantId, quantity: line.quantity })),
    });
    if (error) {
      const why = reason(error);
      throw new Error((why && RESERVE_ERRORS[why]) || 'No se ha podido reservar. Inténtalo de nuevo.');
    }
    return String((data as { order_id: string }).order_id);
  },

  async cancelReservation(orderId: string) {
    const { data, error } = await supabase.rpc('merch_cancel_reservation', { p_order_id: orderId });
    if (error) throw new Error('No se ha podido cancelar la reserva.');
    if (data !== true) throw new Error('Esta reserva ya no se puede cancelar.');
  },

  async myOrders(): Promise<MerchOrder[]> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];
    await releaseExpired(null);
    const { data, error } = await withAtStandColumns<any[]>(atStand =>
      supabase
        .from('merch_orders')
        .select(orderColumns(atStand))
        .eq('buyer_id', auth.user!.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(100),
    );
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    return (data || []).map(mapOrder);
  },

  async order(orderId: string): Promise<MerchOrder | null> {
    const { data, error } = await withAtStandColumns<any>(atStand =>
      supabase.from('merch_orders').select(orderColumns(atStand)).eq('id', orderId).maybeSingle(),
    );
    if (error) throw error;
    return data ? mapOrder(data) : null;
  },

  // --- Sellers -------------------------------------------------------------

  /** Whether pay-at-stand can be offered (the migration is live). */
  async atStandAvailable() {
    if (atStandSchema !== null) return atStandSchema;
    const { error } = await supabase.from('event_merch').select('payment_method').limit(1);
    atStandSchema = !error || !isMissingRelation(error);
    return atStandSchema;
  },

  /** charges_enabled read straight from the table: works before merch-seller is deployed. */
  async chargesEnabled(subjectId: string) {
    const { data } = await supabase.from('merch_sellers').select('charges_enabled').eq('subject_id', subjectId).maybeSingle();
    return Boolean((data as any)?.charges_enabled);
  },

  async sellerStatus(subjectId: string) {
    return invoke<{ started: boolean; chargesEnabled: boolean; detailsSubmitted?: boolean }>('merch-seller', {
      action: 'status',
      subjectId,
    });
  },

  async startOnboarding(subjectId: string) {
    const { url } = await invoke<{ url: string }>('merch-seller', { action: 'onboard', subjectId });
    await openExternal(url);
  },

  async listItems(subjectId: string): Promise<MerchItem[]> {
    const { data, error } = await supabase
      .from('merch_items')
      .select(ITEM_COLUMNS)
      .eq('seller_subject_id', subjectId)
      .order('created_at');
    if (error) throw error;
    return (data || []).map(mapItem);
  },

  /** Compresses the photo (~1200 px WebP/JPEG) and stores it. Returns its public https URL. */
  async uploadPhoto(subjectId: string, file: Blob) {
    const { blob, extension } = await compressProductPhoto(file);
    const path = `${subjectId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (error) throw new Error('No se ha podido subir la foto. Puedes guardar el producto sin ella y añadirla luego.');
    return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  },

  // Creates or updates an item and replaces its variants by label.
  async saveItem(input: {
    id?: string | null;
    sellerSubjectId: string;
    name: string;
    imageUrl: string;
    priceCents: number;
    variants: { label: string; stock: number | null }[];
  }) {
    const values = {
      seller_subject_id: input.sellerSubjectId,
      name: input.name.trim(),
      image_url: input.imageUrl.trim() || null,
      price_cents: input.priceCents,
    };
    const saved = input.id
      ? await supabase.from('merch_items').update(values).eq('id', input.id).select('id').single()
      : await supabase.from('merch_items').insert(values).select('id').single();
    if (saved.error) throw saved.error;
    const itemId = saved.data.id as string;

    const labels = input.variants.map(variant => variant.label.trim()).filter(Boolean);
    const { data: existing, error: existingError } = await supabase.from('merch_variants').select('id,label').eq('item_id', itemId);
    if (existingError) throw existingError;
    const removed = (existing || []).filter((row: any) => !labels.includes(row.label)).map((row: any) => row.id);
    if (removed.length) {
      const { error } = await supabase.from('merch_variants').delete().in('id', removed);
      if (error) throw error;
    }
    const { error: upsertError } = await supabase.from('merch_variants').upsert(
      input.variants
        .filter(variant => variant.label.trim())
        .map((variant, position) => ({ item_id: itemId, label: variant.label.trim(), stock: variant.stock, position })),
      { onConflict: 'item_id,label' },
    );
    if (upsertError) throw upsertError;
    return itemId;
  },

  async setItemActive(itemId: string, active: boolean) {
    const { error } = await supabase.from('merch_items').update({ active }).eq('id', itemId);
    if (error) throw error;
  },

  async standsForSeller(subjectId: string): Promise<Map<string, MerchStandSettings>> {
    const { data, error, atStand } = await withAtStandColumns<any[]>(withMethod =>
      supabase
        .from('event_merch')
        .select(withMethod ? 'event_id,pickup_point,payment_method' : 'event_id,pickup_point')
        .eq('seller_subject_id', subjectId),
    );
    if (error) throw error;
    return new Map(
      (data || []).map((row: any) => [
        String(row.event_id),
        { pickupPoint: row.pickup_point as string, paymentMethod: atStand && row.payment_method === 'at_stand' ? 'at_stand' : 'in_app' },
      ]),
    );
  },

  async openStand(eventId: string, subjectId: string, settings: MerchStandSettings) {
    const row: Record<string, unknown> = {
      event_id: eventId,
      seller_subject_id: subjectId,
      pickup_point: settings.pickupPoint.trim() || 'Puesto de merch',
    };
    // Without the migration every stand is in-app, which is the column's default.
    if (atStandSchema !== false) row.payment_method = settings.paymentMethod;
    const { error } = await supabase.from('event_merch').upsert(row);
    if (error) throw error;
  },

  async closeStand(eventId: string, subjectId: string) {
    const { error } = await supabase.from('event_merch').delete().eq('event_id', eventId).eq('seller_subject_id', subjectId);
    if (error) throw error;
  },

  async ordersForStand(eventId: string, subjectId: string): Promise<MerchOrder[]> {
    await releaseExpired(eventId);
    const { data, error } = await withAtStandColumns<any[]>(withAtStand =>
      supabase
        .from('merch_orders')
        .select(orderColumns(withAtStand))
        .eq('event_id', eventId)
        .eq('seller_subject_id', subjectId)
        .in('status', withAtStand ? ['reserved', 'paid', 'collected', 'refunded'] : ['paid', 'collected', 'refunded'])
        .order('created_at'),
    );
    if (error) throw error;
    return (data || []).map(mapOrder);
  },

  async collect(eventId: string, code: string) {
    const { data, error } = await supabase.rpc('merch_collect', { p_event_id: eventId, p_code: code });
    if (error) {
      const why = reason(error);
      throw new Error(
        why === 'already_collected'
          ? 'Ese pedido ya se entregó.'
          : why === 'not_paid'
            ? 'Ese pedido no está pagado.'
            : why === 'cancelled'
              ? 'Esa reserva se canceló o caducó.'
              : 'Código no encontrado en este concierto.',
      );
    }
    return data as string;
  },
};
