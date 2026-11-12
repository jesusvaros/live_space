import { describe, expect, it } from 'vitest';

import { isPrivateAddress, safeFetchHtml } from './safeFetch';

const publicResolve = async () => ['93.184.216.34'];

const response = (status: number, body = '', headers: Record<string, string> = {}) =>
  new Response(status >= 300 && status < 400 ? null : body, { status, headers });

describe('isPrivateAddress', () => {
  it('blocks loopback, private, link-local (cloud metadata) and IPv6 equivalents', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'not-an-ip']) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('lets public addresses through', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::6810:84e5']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});

describe('safeFetchHtml', () => {
  it('returns the HTML of a public page and sends the bot User-Agent', async () => {
    let userAgent = '';
    const result = await safeFetchHtml('https://tickets.example/e/1', {
      resolve: publicResolve,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        userAgent = new Headers(init.headers).get('user-agent') ?? '';
        return response(200, '<html>ok</html>', { 'content-type': 'text/html; charset=utf-8' });
      }) as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: true, html: '<html>ok</html>', url: 'https://tickets.example/e/1' });
    expect(userAgent).toMatch(/^LiveSpaceBot/);
  });

  it('never follows a redirect into a private address', async () => {
    const requested: string[] = [];
    const result = await safeFetchHtml('https://tickets.example/e/1', {
      resolve: async host => (host === 'tickets.example' ? ['93.184.216.34'] : ['169.254.169.254']),
      fetchImpl: (async (url: string) => {
        requested.push(url);
        return response(302, '', { location: 'http://metadata.internal.example/latest' });
      }) as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, error: 'private-address', permanent: true });
    expect(requested).toEqual(['https://tickets.example/e/1']);
  });

  it('refuses localhost, IP literals in private ranges and odd ports without a request', async () => {
    const fetchImpl = (async () => {
      throw new Error('must not be called');
    }) as unknown as typeof fetch;
    for (const url of ['http://localhost/x', 'http://127.0.0.1/', 'http://[::1]/', 'https://tickets.example:8443/', 'ftp://tickets.example/']) {
      const result = await safeFetchHtml(url, { fetchImpl, resolve: publicResolve });
      expect(result.ok, url).toBe(false);
    }
  });

  it('404 is permanent, 503 is retried, non-HTML is refused', async () => {
    const fetchWith = (status: number, type = 'text/html') =>
      (async () => response(status, 'x', { 'content-type': type })) as unknown as typeof fetch;
    expect(await safeFetchHtml('https://t.example/a', { resolve: publicResolve, fetchImpl: fetchWith(404) })).toMatchObject({
      ok: false,
      error: 'http-404',
      permanent: true,
    });
    expect(await safeFetchHtml('https://t.example/a', { resolve: publicResolve, fetchImpl: fetchWith(503) })).toMatchObject({
      ok: false,
      permanent: false,
    });
    expect(await safeFetchHtml('https://t.example/a', { resolve: publicResolve, fetchImpl: fetchWith(200, 'application/pdf') })).toMatchObject({
      ok: false,
      error: 'not-html',
    });
  });

  it('caps the body size', async () => {
    const result = await safeFetchHtml('https://t.example/a', {
      resolve: publicResolve,
      maxBytes: 10,
      fetchImpl: (async () => response(200, 'a'.repeat(100), { 'content-type': 'text/html' })) as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: true, html: 'a'.repeat(10) });
  });
});
