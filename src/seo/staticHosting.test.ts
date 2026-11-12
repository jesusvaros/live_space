import { describe, expect, it } from 'vitest';

import { DEFAULT_PUBLIC_SITE_URL, resolvePublicSiteUrl } from '../shared/siteUrl';
import { buildVercelConfig, redirectStub, toVercelSources } from './staticHosting';

describe('toVercelSources', () => {
  it('turns a "/*" prefix into a :path* splat, slashed and unslashed', () => {
    expect(toVercelSources('/tabs/*')).toEqual(['/tabs/:path*/', '/tabs/:path*']);
  });

  it('slashes exact paths, as trailingSlash runs first', () => {
    expect(toVercelSources('/welcome')).toEqual(['/welcome/']);
    expect(toVercelSources('/admin/')).toEqual(['/admin/']);
  });

  it('refuses patterns it cannot translate', () => {
    expect(() => toVercelSources('/a/*/b')).toThrow();
    expect(() => toVercelSources('/a/:id')).toThrow();
  });
});

describe('buildVercelConfig', () => {
  const config = buildVercelConfig({ movedRoutes: ['/event/*', '/discover'], movedPage: '/movido/index.html' });

  it('serves /<path>/index.html at /<path>/', () => {
    expect(config.trailingSlash).toBe(true);
    expect(config.cleanUrls).toBe(true);
  });

  it('sends old app routes to the moved page after the filesystem (rewrites)', () => {
    expect(config.rewrites).toEqual([
      { source: '/event/:path*/', destination: '/movido/index.html' },
      { source: '/event/:path*', destination: '/movido/index.html' },
      { source: '/discover/', destination: '/movido/index.html' },
    ]);
    expect(config).not.toHaveProperty('redirects');
  });

  it('keeps immutable assets and the security headers', () => {
    expect(config.headers).toEqual([
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ]);
  });
});

describe('redirectStub', () => {
  it('redirects at once and points the canonical at the target', () => {
    const html = redirectStub('/concierto/x-1/', 'https://site.example/concierto/x-1/');
    expect(html).toContain('<link rel="canonical" href="https://site.example/concierto/x-1/" />');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/concierto/x-1/" />');
    expect(html).toContain('location.replace("/concierto/x-1/" + location.search + location.hash)');
    expect(html).not.toContain('noindex');
  });

  it('escapes the target in attributes and in the script', () => {
    const html = redirectStub('/a"</script>', 'https://site.example/', { noindex: true });
    expect(html).toContain('url=/a&quot;&lt;/script&gt;');
    expect(html).toContain('"/a\\"\\u003c/script>"');
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });
});

describe('resolvePublicSiteUrl', () => {
  it('uses the configured URL without trailing slash, or the default', () => {
    expect(resolvePublicSiteUrl(' https://livespace.example/ ')).toBe('https://livespace.example');
    expect(resolvePublicSiteUrl('')).toBe(DEFAULT_PUBLIC_SITE_URL);
    expect(resolvePublicSiteUrl(undefined)).toBe('https://livespace-dusky.vercel.app');
  });

  it('deploys the prebuilt folder as is (no framework build)', () => {
    const config = buildVercelConfig({ movedRoutes: [], movedPage: '/movido/index.html' });
    expect(config).toMatchObject({ framework: null, buildCommand: '', installCommand: '', outputDirectory: '.' });
  });
});
