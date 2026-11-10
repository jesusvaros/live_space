import { test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';

// Time to first content per route, cold (empty cache) vs warm (the same page
// reloaded with IndexedDB kept), against the API in .env. Read from the marks
// of src/lib/perfTiming.ts. Opt-in, never part of the normal e2e run:
//   PERF_OUT=/tmp/perf.txt npx playwright test tests/e2e/perf-warm.spec.ts --project=mobile-chromium
// PERF_BASE_URL measures another server instead of the dev one, e.g. the
// production build: `npm run build && npx vite preview --port 43919` and
// PERF_BASE_URL=http://127.0.0.1:43919.

const ROUTES: Array<[name: string, path: string, mark: string]> = [
  ['Inicio', '/tabs/events', 'inicio'],
  ['Mapa', '/tabs/map', 'map'],
  ['Sala', '/tabs/venue/66242507-0439-4b3b-9e72-550d324a1571', 'venue'],
  ['Concierto', '/event/0e733611-37cf-4ccb-b082-9bbcd8cf36a5', 'concert'],
];
const RUNS = 3;
const BASE = process.env.PERF_BASE_URL ?? '';

const firstContent = async (page: Page, mark: string) => {
  const handle = await page.waitForFunction(
    name => (window as any).__lsPerf?.find((entry: any) => entry.route === name) ?? null,
    mark,
    { timeout: 30_000 },
  );
  return (await handle.jsonValue()) as { ms: number; fromCache: boolean };
};

const newPage = async (browser: Browser) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.localStorage.setItem('live_space.onboarding_seen', '1');
    window.localStorage.setItem('live_space.perf', '1');
  });
  return { context, page: await context.newPage() };
};

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

test('first content: cold vs warm', async ({ browser }) => {
  test.skip(!process.env.PERF_OUT, 'Opt-in: set PERF_OUT to the report file.');
  test.setTimeout(600_000);
  const rows: string[] = ['| Pantalla | Frío (caché vacía) | Caliente (recarga) |', '|---|---|---|'];

  // The dev server compiles each module on first request: open every route
  // once so the timings measure the app, not Vite.
  {
    const { context, page } = await newPage(browser);
    for (const [, path, mark] of ROUTES) {
      await page.goto(`${BASE}${path}`);
      await firstContent(page, mark).catch(() => undefined);
    }
    await context.close();
  }

  for (const [name, path, mark] of ROUTES) {
    const cold: number[] = [];
    const warm: number[] = [];
    for (let run = 0; run < RUNS; run += 1) {
      const { context, page } = await newPage(browser);
      await page.goto(`${BASE}${path}`);
      cold.push((await firstContent(page, mark)).ms);
      // Let the saved copies be written and the network settle.
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      await page.reload();
      warm.push((await firstContent(page, mark)).ms);
      await context.close();
    }
    rows.push(`| ${name} | ${median(cold)} ms | ${median(warm)} ms |`);
  }
  fs.writeFileSync(process.env.PERF_OUT!, `${rows.join('\n')}\n`);
});
