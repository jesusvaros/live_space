import { test, type Page } from '@playwright/test';
import fs from 'node:fs';

// Supabase traffic per screen (calls, KB, time until the network is quiet),
// against the API in .env. Opt-in, never part of the normal e2e run:
//   PERF_OUT=/tmp/perf.txt npm run perf:routes
// The ids below are real concerts, artists and venues of the production data.
// Screens behind a login (/empezar, the manager profiles) are not reachable
// anonymously and are not measured here.

// A 1x1 PNG. Its capture time is the file's date (now), so picking it makes
// the upload screen look for a concert around now.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// [name, path, what to do once it has loaded]
type Route = [string, string, ((page: Page) => Promise<unknown>)?];

const ROUTES: Route[] = [
  ['Inicio', '/tabs/events'],
  ['Explorar (artistas)', '/tabs/discover'],
  ['Subir: elegir concierto', '/tabs/upload', page => page.getByRole('button', { name: 'Elegir', exact: true }).click()],
  [
    'Subir: detectar por la foto',
    '/tabs/upload',
    page => page.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG }),
  ],
  ['Mapa', '/tabs/map'],
  ['Momentos', '/tabs/feed'],
  ['Concierto', '/event/0e733611-37cf-4ccb-b082-9bbcd8cf36a5'],
  ['Concierto con momentos', '/event/d6be3067-d872-4229-9344-b0a0936cdebe'],
  ['Artista', '/tabs/artist/695c02fb-cc06-4d90-926d-f9effbc20c4e'],
  ['Sala', '/tabs/venue/66242507-0439-4b3b-9e72-550d324a1571'],
];

test('api calls per route', async ({ page }) => {
  test.skip(!process.env.PERF_OUT, 'Opt-in: set PERF_OUT to the report file (npm run perf:routes).');
  test.setTimeout(240_000);
  await page.addInitScript(() => window.localStorage.setItem('live_space.onboarding_seen', '1'));
  const rows: string[] = [];
  for (const [name, path, action] of ROUTES) {
    const calls: { url: string; ms: number; bytes: number; status: number }[] = [];
    const started = new Map<string, number>();
    const onReq = (r: any) => started.set(r.url() + r.method(), Date.now());
    const onRes = async (res: any) => {
      const url: string = res.url();
      if (!url.includes('supabase.co')) return;
      const t0 = started.get(url + res.request().method()) ?? Date.now();
      let bytes = 0;
      try { bytes = (await res.body()).length; } catch { /* redirects and aborted requests have no body */ }
      calls.push({ url, ms: Date.now() - t0, bytes, status: res.status() });
    };
    page.on('request', onReq);
    page.on('response', onRes);
    const t = Date.now();
    await page.goto(path);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    if (action) {
      await action(page);
      // The action's requests start after a short debounce or file read.
      await page.waitForTimeout(1_500);
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    }
    const total = Date.now() - t;
    page.off('request', onReq);
    page.off('response', onRes);
    const kb = (calls.reduce((a, c) => a + c.bytes, 0) / 1024).toFixed(0);
    rows.push(`\n## ${name} (${path}) — ${calls.length} llamadas, ${kb} KB, hasta red quieta ${total} ms`);
    for (const c of calls.sort((a, b) => b.bytes - a.bytes)) {
      const u = new URL(c.url);
      rows.push(`  ${String(c.status).padEnd(4)}${String(Math.round(c.bytes / 1024)).padStart(5)} KB ${String(c.ms).padStart(5)} ms  ${u.pathname.replace('/rest/v1/', '')}${u.search.slice(0, 160)}`);
    }
  }
  fs.writeFileSync(process.env.PERF_OUT!, rows.join('\n'));
});
