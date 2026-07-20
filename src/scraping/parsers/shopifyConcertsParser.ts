import type { RawScrapedEvent, ScrapeSource, VenueParser } from '../../types/scrape.js';

type ShopifyProduct = {
  id?: number | string;
  title?: string;
  handle?: string;
  body_html?: string;
  product_type?: string;
  tags?: string[];
};

type ShopifyProductsResponse = {
  products?: ShopifyProduct[];
};

const stripHtml = (value: string | undefined): string | undefined => {
  const result = value
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return result || undefined;
};

const hasConcertDate = (title: string): boolean =>
  /\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(title);

const artistFromTitle = (title: string): string => {
  const beforeDate = title.split(
    /\s+-\s+(?=(?:lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b)/i,
  )[0];
  const artist = beforeDate
    .split(/\s+-\s+/)[0]
    .replace(/^20\d{2}\s+/, '')
    .replace(/\s+(?:white lotus\s+)?world tour(?:\s+20\d{2})?$/i, '')
    .replace(/\s+tour\s+20\d{2}$/i, '')
    .replace(/\s+en madrid$/i, '')
    .trim();
  return artist || beforeDate.trim();
};

export const mapShopifyConcert = (
  product: ShopifyProduct,
  source: Pick<ScrapeSource, 'base_url' | 'name' | 'city'>,
): RawScrapedEvent | null => {
  const title = product.title?.trim();
  if (!title || !product.handle || !hasConcertDate(title)) return null;

  const sourceEventUrl = new URL(`/products/${product.handle}`, source.base_url).toString();
  return {
    sourceUrl: source.base_url,
    sourceEventUrl,
    sourceEventId: product.id == null ? sourceEventUrl : String(product.id),
    title,
    description: stripHtml(product.body_html),
    dateText: title,
    startsAt: null,
    venueName: source.name,
    city: source.city ?? undefined,
    artistNames: [artistFromTitle(title)],
    // Shopify refreshes product/variant `updated_at` values on reads. Keeping
    // only catalog fields makes the staging hash stable while preserving the
    // official content needed for provenance and change detection.
    rawPayload: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      body_html: product.body_html,
      product_type: product.product_type,
      tags: product.tags,
    },
  };
};

export const shopifyConcertsParser: VenueParser = {
  key: 'shopify-concerts',
  canHandle: (_url, html) => html.includes('cdn.shopify.com') || html.includes('Shopify.theme'),
  parseListPage: async (page, source) => {
    const endpoint = new URL('/collections/conciertos/products.json', source.base_url);
    endpoint.searchParams.set('limit', '250');
    const response = await page.context().request.get(endpoint.toString());
    if (!response.ok()) {
      throw new Error(`Shopify products API returned HTTP ${response.status()}`);
    }

    const payload = (await response.json()) as ShopifyProductsResponse;
    return (Array.isArray(payload.products) ? payload.products : [])
      .filter((product) =>
        product.product_type === 'Event' &&
        (product.tags || []).some((tag) => tag.toLocaleLowerCase('es') === 'conciertos'),
      )
      .map((product) => mapShopifyConcert(product, source))
      .filter((event): event is RawScrapedEvent => event !== null);
  },
};
