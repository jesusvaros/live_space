// Fetches a page whose address came from a user (event link suggestions).
// The runner must never be pointed at itself or at a private network (cloud
// metadata at 169.254.169.254, localhost services), so every hop, redirects
// included, must resolve only to public addresses on the default ports.
// Polite: identifiable User-Agent (same as the other enrichers), timeout and
// a size cap.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const SUGGESTION_USER_AGENT = 'LiveSpaceBot/1.0 (+https://github.com/jesusvaros/live_space)';

export type SafeFetchResult =
  | { ok: true; url: string; status: number; html: string; contentType: string }
  | { ok: false; url: string; status: number | null; error: string; permanent: boolean };

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  resolve?: (hostname: string) => Promise<string[]>;
};

const ipv4ToNumber = (ip: string) => ip.split('.').reduce((total, part) => total * 256 + Number(part), 0);

const IPV4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const inRange = (ip: string, [base, bits]: [string, number]) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipv4ToNumber(ip) & mask) >>> 0) === ((ipv4ToNumber(base) & mask) >>> 0);
};

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export const isPrivateAddress = (address: string): boolean => {
  const version = isIP(address);
  if (version === 4) return IPV4_BLOCKED.some(range => inRange(address, range));
  if (version !== 6) return true;
  const ip = address.toLowerCase();
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (ip === '::' || ip === '::1') return true;
  // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast,
  // 64:ff9b::/96 NAT64 and 2001:db8::/32 documentation.
  return /^(f[cd]|fe[89ab]|ff)/.test(ip) || ip.startsWith('64:ff9b:') || ip.startsWith('2001:db8:') || ip.startsWith('::ffff:');
};

const defaultResolve = async (hostname: string) => (await lookup(hostname, { all: true, verbatim: true })).map(entry => entry.address);

/** Why this URL may not be fetched, or null when it may. */
export const checkTarget = async (url: URL, resolve = defaultResolve): Promise<string | null> => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'unsupported-scheme';
  if (url.port && url.port !== '80' && url.port !== '443') return 'unsupported-port';
  if (url.username || url.password) return 'credentials-in-url';
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return 'private-host';
  }
  let addresses: string[];
  if (isIP(hostname)) addresses = [hostname];
  else {
    try {
      addresses = await resolve(hostname);
    } catch {
      return 'dns-failed';
    }
  }
  if (addresses.length === 0) return 'dns-failed';
  return addresses.some(isPrivateAddress) ? 'private-address' : null;
};

const readCapped = async (response: Response, maxBytes: number): Promise<string> => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const buffer = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const room = buffer.length - offset;
    if (room <= 0) break;
    buffer.set(chunk.subarray(0, room), offset);
    offset += Math.min(chunk.byteLength, room);
  }
  return new TextDecoder('utf-8').decode(buffer);
};

// 4xx that will not change by retrying tomorrow.
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 405, 406, 410, 451]);

export const safeFetchHtml = async (rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> => {
  const { timeoutMs = 20_000, maxBytes = 2_000_000, maxRedirects = 5, fetchImpl = fetch, resolve = defaultResolve } = options;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return { ok: false, url: current, status: null, error: 'invalid-url', permanent: true };
    }
    const blocked = await checkTarget(url, resolve);
    if (blocked) return { ok: false, url: current, status: null, error: blocked, permanent: blocked !== 'dns-failed' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': SUGGESTION_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);
        if (!location) return { ok: false, url: current, status: response.status, error: 'redirect-without-location', permanent: true };
        current = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return {
          ok: false,
          url: current,
          status: response.status,
          error: `http-${response.status}`,
          permanent: PERMANENT_STATUS.has(response.status),
        };
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !/html|xml/i.test(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        return { ok: false, url: current, status: response.status, error: 'not-html', permanent: true };
      }
      const html = await readCapped(response, maxBytes);
      return { ok: true, url: current, status: response.status, html, contentType };
    } catch (error) {
      const aborted = (error as { name?: string })?.name === 'AbortError';
      return { ok: false, url: current, status: null, error: aborted ? 'timeout' : 'network-error', permanent: false };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, url: current, status: null, error: 'too-many-redirects', permanent: true };
};
