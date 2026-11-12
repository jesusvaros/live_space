// Links printed in a concert's QR, and how the app reads them back.
//
// The link carries the event's upload token (?qr=), never in the public share
// link (/event/:id). Without a token (migration not applied) it falls back to
// ?event=<id>, which is public anyway.

import { resolvePublicSiteUrl } from '../shared/siteUrl';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

export const publicAppBaseUrl = () => {
  const configured = env.VITE_PUBLIC_SITE_URL?.trim();
  if (configured) return resolvePublicSiteUrl(configured);
  // A web origin other than localhost: inside the Android app the origin is
  // https://localhost, which must never end up in a printed QR.
  if (
    typeof window !== 'undefined' &&
    /^https?:$/.test(window.location.protocol) &&
    window.location.hostname !== 'localhost'
  ) {
    return window.location.origin;
  }
  return resolvePublicSiteUrl();
};

export const buildUploadQrUrl = (input: { token: string | null; eventId: string }) => {
  const url = new URL('/upload', publicAppBaseUrl());
  if (input.token) url.searchParams.set('qr', input.token);
  else url.searchParams.set('event', input.eventId);
  return url.toString();
};

export type ScannedUploadTarget = { token: string } | { eventId: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const parseScannedUploadValue = (raw: string): ScannedUploadTarget => {
  const value = raw.trim();
  if (!value) return null;
  if (UUID.test(value)) return { eventId: value };
  try {
    const url = new URL(value);
    const token = url.searchParams.get('qr');
    if (token) return { token };
    const eventParam = url.searchParams.get('event');
    if (eventParam) return { eventId: eventParam };
    const last = url.pathname.split('/').filter(Boolean).at(-1) || '';
    return last ? { eventId: last } : null;
  } catch {
    return null;
  }
};

// Back from Stripe (through the public /vuelta page):
// com.livespace.app://merch?pedido=<id> or ?cobros=1.
export const merchDeepLinkPath = (rawUrl: string) => {
  if (!rawUrl.startsWith('com.livespace.app://merch')) return null;
  try {
    const url = new URL(rawUrl.replace(/^com\.livespace\.app:\/\//, 'https://app/'));
    const order = url.searchParams.get('pedido');
    if (order && UUID.test(order)) return `/pedidos/${order}`;
    if (url.searchParams.get('cobros')) return '/gestion/merch';
    return '/pedidos';
  } catch {
    return null;
  }
};

// Concert QR links: com.livespace.app://upload?qr=… (from the public /upload
// page) or https://<site>/upload?qr=… (App Links / Universal Links).
export const uploadDeepLinkPath = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl.replace(/^com\.livespace\.app:\/\//, 'https://app/'));
    const isUpload = url.hostname === 'app' ? url.pathname === '/upload' || url.pathname === '/upload/'
      : /^https?:$/.test(url.protocol) && url.pathname.replace(/\/$/, '') === '/upload';
    if (!isUpload) return null;
    const qr = url.searchParams.get('qr');
    const event = url.searchParams.get('event');
    if (qr) return `/tabs/upload?qr=${encodeURIComponent(qr)}`;
    if (event) return `/tabs/upload?event=${encodeURIComponent(event)}`;
    return '/tabs/upload';
  } catch {
    return null;
  }
};
