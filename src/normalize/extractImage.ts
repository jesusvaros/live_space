// Finds the event poster inside a parser payload. Used by the parsers (via
// RawScrapedEvent.imageUrl), by the normalizer and by the backfill of rows
// captured before parsers kept images, whose raw_payload.payload still holds
// the untouched source object (Tribe event, Shopify product, JSON-LD item).

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;

export const toHttpUrl = (value: unknown, baseUrl?: string): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.startsWith('data:')) return null;
  try {
    const url = baseUrl ? new URL(text, baseUrl) : new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

// schema.org `image` may be a URL, an ImageObject or a list of either.
export const imageFromSchema = (value: unknown, baseUrl?: string): string | null => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = imageFromSchema(entry, baseUrl);
      if (url) return url;
    }
    return null;
  }
  const record = asRecord(value);
  if (record) return toHttpUrl(record.url ?? record.contentUrl, baseUrl);
  return toHttpUrl(value, baseUrl);
};

// WordPress originals can be 3456×4608 PNGs of several MB; a mid-size
// rendition is plenty for a card or a detail header.
const TRIBE_SIZE_PREFERENCE = ['large', '1536x1536', 'medium_large'];

export const imageFromTribe = (value: unknown): string | null => {
  const image = asRecord(value);
  if (!image) return null;
  const sizes = asRecord(image.sizes);
  for (const key of TRIBE_SIZE_PREFERENCE) {
    const url = toHttpUrl(asRecord(sizes?.[key])?.url);
    if (url) return url;
  }
  return toHttpUrl(image.url);
};

export const imageFromShopify = (product: unknown): string | null => {
  const record = asRecord(product);
  if (!record) return null;
  const images = Array.isArray(record.images) ? record.images : [];
  for (const image of images) {
    const url = toHttpUrl(asRecord(image)?.src ?? image);
    if (url) return url;
  }
  return toHttpUrl(asRecord(record.image)?.src);
};

// Payload shapes, most specific first: our own imageUrl, Tribe `image`
// object with sizes, Shopify `images[]`, JSON-LD `item.image` or `image`.
export const extractImageFromPayload = (payload: unknown): string | null => {
  const record = asRecord(payload);
  if (!record) return null;
  if (asRecord(record.image)?.sizes) return imageFromTribe(record.image);
  if (Array.isArray(record.images)) return imageFromShopify(record);
  const item = asRecord(record.item);
  if (item?.image) return imageFromSchema(item.image);
  return imageFromSchema(record.image);
};

export const extractImageUrl = (rawPayload: unknown): string | null => {
  const raw = asRecord(rawPayload);
  if (!raw) return null;
  return toHttpUrl(raw.imageUrl) ?? extractImageFromPayload(raw.payload);
};
