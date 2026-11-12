// Hosting config for the prerendered public site (dist-site/), deployed to
// Vercel as prebuilt static output by .github/workflows/publish-web.yml.
//
// Pages are written as /<path>/index.html and linked with a trailing slash,
// hence trailingSlash: true. Vercel applies that 308 before any redirect or
// rewrite, so every source below is matched in its slashed form.
//
// Vercel caps vercel.json at 2048 redirects and the catalogue already has
// more legacy UUID URLs than that, so those are static pages that redirect
// (redirectStub) instead of config entries. Old app routes are rewrites,
// which Vercel evaluates after the filesystem: a legacy page wins, anything
// else under the route lands on a stub that sends the visitor to "/".

/** Exact path ("/welcome") or a prefix ending in "/*" ("/tabs/*"). */
export type RoutePattern = string;

export type VercelRoute = { source: string; destination: string };

/**
 * Converts a route pattern to Vercel sources. "/tabs/*" becomes
 * "/tabs/:path*\/" (/tabs/ and anything under it, once slashed) plus
 * "/tabs/:path*" for a last segment with a dot, which Vercel does not slash.
 */
export const toVercelSources = (pattern: RoutePattern): string[] => {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    if (base.includes('*') || base.includes(':')) throw new Error(`Unsupported route pattern: ${pattern}`);
    return [`${base}/:path*/`, `${base}/:path*`];
  }
  if (pattern.includes('*') || pattern.includes(':')) throw new Error(`Unsupported route pattern: ${pattern}`);
  return [pattern.endsWith('/') ? pattern : `${pattern}/`];
};

export const buildVercelConfig = (input: { movedRoutes: RoutePattern[]; movedPage: string }) => ({
  $schema: 'https://openapi.vercel.sh/vercel.json',
  // dist-site is already built: the project (linked from the repo root, so
  // Vercel detected Vite) must not run `vite build` on it.
  framework: null,
  buildCommand: '',
  installCommand: '',
  outputDirectory: '.',
  // /x/index.html is served at /x/; /x.html and /x/index.html redirect there.
  cleanUrls: true,
  trailingSlash: true,
  rewrites: input.movedRoutes.flatMap((pattern) =>
    toVercelSources(pattern).map((source): VercelRoute => ({ source, destination: input.movedPage })),
  ),
  headers: [
    {
      source: '/assets/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
    {
      // iOS Universal Links: the file has no extension (docs/runbooks.md).
      source: '/.well-known/apple-app-site-association',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    },
  ],
});

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A page that sends the visitor to `target` (a site path) at once, keeping
 * the query string. The canonical points at the target, which search engines
 * read as a permanent redirect.
 */
export const redirectStub = (target: string, canonicalUrl: string, options: { noindex?: boolean } = {}) => `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Live Space</title>
    <link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />
    ${options.noindex ? '<meta name="robots" content="noindex" />\n    ' : ''}<meta http-equiv="refresh" content="0; url=${escapeAttribute(target)}" />
    <script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')} + location.search + location.hash);</script>
  </head>
  <body>
    <p><a href="${escapeAttribute(target)}">Ir a Live Space</a></p>
  </body>
</html>
`;
