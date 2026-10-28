import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../api';
import { isMissingRelation } from './claims.service';

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
  items: MerchItem[];
};

export type MerchOrderStatus = 'pending' | 'paid' | 'collected' | 'cancelled' | 'refunded';

export type MerchOrderLine = { itemName: string; variantLabel: string; quantity: number; unitPriceCents: number };

export type MerchOrder = {
  id: string;
  eventId: string;
  sellerSubjectId: string;
  status: MerchOrderStatus;
  totalCents: number;
  pickupCode: string;
  pickupPoint: string;
  createdAt: string;
  collectedAt: string | null;
  lines: MerchOrderLine[];
  event: { name: string; startsAt: string; venueName: string | null; city: string | null } | null;
};

export const formatEuros = (cents: number) =>
  (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });

export const MERCH_STATUS_LABELS: Record<MerchOrderStatus, string> = {
  pending: 'Pendiente de pago',
  paid: 'Pagado · por recoger',
  collected: 'Recogido',
  cancelled: 'Cancelado',
  refunded: 'Devuelto',
};

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

const ORDER_COLUMNS =
  'id,event_id,seller_subject_id,status,total_cents,pickup_code,pickup_point,created_at,collected_at,' +
  'lines:merch_order_lines(item_name,variant_label,quantity,unit_price_cents),' +
  'event:events(name,starts_at,city,venue:venue_places!events_venue_place_id_fkey(name))';

const mapOrder = (row: any): MerchOrder => ({
  id: row.id,
  eventId: row.event_id,
  sellerSubjectId: row.seller_subject_id,
  status: row.status,
  totalCents: row.total_cents,
  pickupCode: row.pickup_code,
  pickupPoint: row.pickup_point,
  createdAt: row.created_at,
  collectedAt: row.collected_at ?? null,
  lines: (row.lines || []).map((line: any) => ({
    itemName: line.item_name,
    variantLabel: line.variant_label,
    quantity: line.quantity,
    unitPriceCents: line.unit_price_cents,
  })),
  event: row.event
    ? { name: row.event.name, startsAt: row.event.starts_at, venueName: row.event.venue?.name ?? null, city: row.event.city ?? null }
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

export const merchService = {
  // Stands with something to sell at this concert. Empty until the migration runs.
  async forEvent(eventId: string): Promise<EventMerchStand[]> {
    const { data: stands, error } = await supabase
      .from('event_merch')
      .select('seller_subject_id,pickup_point')
      .eq('event_id', eventId);
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
      .map((row: any) => ({
        sellerSubjectId: String(row.seller_subject_id),
        sellerName: names.get(String(row.seller_subject_id)) || 'Merch',
        pickupPoint: row.pickup_point,
        items: (items || []).map(mapItem).filter(item => item.sellerSubjectId === String(row.seller_subject_id)),
      }))
      .filter(stand => canCharge.has(stand.sellerSubjectId) && stand.items.length > 0);
  },

  // Reserves the stock and opens Stripe Checkout. Returns the order id.
  async checkout(input: { eventId: string; sellerSubjectId: string; lines: { variantId: string; quantity: number }[] }) {
    const result = await invoke<{ orderId: string; url: string }>('merch-checkout', input);
    await openExternal(result.url);
    return result.orderId;
  },

  async myOrders(): Promise<MerchOrder[]> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];
    const { data, error } = await supabase
      .from('merch_orders')
      .select(ORDER_COLUMNS)
      .eq('buyer_id', auth.user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      if (isMissingRelation(error)) return [];
      throw error;
    }
    return (data || []).map(mapOrder);
  },

  async order(orderId: string): Promise<MerchOrder | null> {
    const { data, error } = await supabase.from('merch_orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle();
    if (error) throw error;
    return data ? mapOrder(data) : null;
  },

  // --- Sellers -------------------------------------------------------------

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

  // Creates or updates an item and replaces its variants by label.
  async saveItem(input: {
    id?: string | null;
    sellerSubjectId: string;
    name: string;
    description: string;
    imageUrl: string;
    priceCents: number;
    variants: { label: string; stock: number | null }[];
  }) {
    const values = {
      seller_subject_id: input.sellerSubjectId,
      name: input.name.trim(),
      description: input.description.trim() || null,
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

  async standsForSeller(subjectId: string): Promise<Map<string, string>> {
    const { data, error } = await supabase.from('event_merch').select('event_id,pickup_point').eq('seller_subject_id', subjectId);
    if (error) throw error;
    return new Map((data || []).map((row: any) => [String(row.event_id), row.pickup_point as string]));
  },

  async openStand(eventId: string, subjectId: string, pickupPoint: string) {
    const { error } = await supabase
      .from('event_merch')
      .upsert({ event_id: eventId, seller_subject_id: subjectId, pickup_point: pickupPoint.trim() || 'Puesto de merch' });
    if (error) throw error;
  },

  async closeStand(eventId: string, subjectId: string) {
    const { error } = await supabase.from('event_merch').delete().eq('event_id', eventId).eq('seller_subject_id', subjectId);
    if (error) throw error;
  },

  async ordersForStand(eventId: string, subjectId: string): Promise<MerchOrder[]> {
    const { data, error } = await supabase
      .from('merch_orders')
      .select(ORDER_COLUMNS)
      .eq('event_id', eventId)
      .eq('seller_subject_id', subjectId)
      .in('status', ['paid', 'collected', 'refunded'])
      .order('created_at');
    if (error) throw error;
    return (data || []).map(mapOrder);
  },

  async collect(eventId: string, code: string) {
    const { data, error } = await supabase.rpc('merch_collect', { p_event_id: eventId, p_code: code });
    if (error) {
      const reason = /merch:([a-z_]+)/.exec(error.message ?? '')?.[1];
      throw new Error(
        reason === 'already_collected'
          ? 'Ese pedido ya se entregó.'
          : reason === 'not_paid'
            ? 'Ese pedido no está pagado.'
            : 'Código no encontrado en este concierto.',
      );
    }
    return data as string;
  },
};
