import { expect, test, type Page, type Route } from '@playwright/test';
import { ME, signInWithFakeBackend, supabaseUrl } from './fakeSession';

// Inicio paints what it showed last time on the next open, before (and
// without waiting for) the network. Supabase is answered from a fixture; on
// the second open every answer is held back for seconds, so anything on
// screen right away came from the saved copy (IndexedDB survives a reload).

const STARTS_AT = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();

const card = {
  id: '30000000-0000-4000-8000-000000000001',
  venue_place_id: '10000000-0000-4000-8000-000000000001',
  name: 'Grupo Guardado en directo',
  description: null,
  starts_at: STARTS_AT,
  ends_at: null,
  city: 'Madrid',
  address: null,
  latitude: 40.42,
  longitude: -3.7,
  genres: [],
  is_free: false,
  price_tiers: null,
  ticket_url: null,
  source_url: null,
  status: 'published',
  created_by: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  image_url: null,
  poster_thumb_url: null,
  poster_url: null,
  share_tag: null,
  festival_id: null,
  room: null,
  venue_place: { id: '10000000-0000-4000-8000-000000000001', name: 'Sala Guardada', city: 'Madrid', address: null, latitude: 40.42, longitude: -3.7 },
  event_artists: [{ artist: { id: '20000000-0000-4000-8000-000000000001', name: 'Grupo Guardado', genres: [], image_url: null } }],
  media_assets: [],
};

const serveFixtures = async (page: Page, delayMs: { value: number }) => {
  await page.route(`${supabaseUrl}/**`, async (route: Route) => {
    if (delayMs.value) await new Promise(resolve => setTimeout(resolve, delayMs.value));
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => undefined);
    if (path === '/rest/v1/rpc/get_upcoming_cities') {
      return json([{ city: 'Madrid', event_count: 1, latitude: 40.42, longitude: -3.7 }]);
    }
    if (path === '/rest/v1/events' && url.searchParams.get('city')) return json([card]);
    if (path.startsWith('/auth/v1/')) return json({});
    return json([]);
  });
};

test('a reload shows Inicio from the saved copy without the skeleton', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('live_space.onboarding_seen', '1');
    window.localStorage.setItem('live_space.city', 'Madrid');
  });
  const delay = { value: 0 };
  await serveFixtures(page, delay);

  // First open: from the network.
  await page.goto('/tabs/events');
  await expect(page.getByRole('button', { name: /Grupo Guardado/ }).first()).toBeVisible();
  // Saved copies are written shortly after (and when the page hides).
  await page.waitForTimeout(800);

  // Second open: the network answers only after 8 s.
  delay.value = 8_000;
  await page.reload();
  await expect(page.getByRole('button', { name: /Grupo Guardado/ }).first()).toBeVisible({ timeout: 2_000 });
  await expect(page.locator('.h-\\[88px\\].animate-pulse')).toHaveCount(0);
});

const savedKeys = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>(resolve => {
        const request = indexedDB.open('live-space-cache');
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('entries')) return resolve([]);
          const keys = database.transaction('entries', 'readonly').objectStore('entries').getAllKeys();
          keys.onsuccess = () => resolve(keys.result.map(String));
          keys.onerror = () => resolve([]);
        };
        request.onerror = () => resolve([]);
      }),
  );

test('deleting the account leaves none of its saved data on the device', async ({ page }) => {
  await signInWithFakeBackend(page);
  await page.goto('/tabs/profile');
  await expect(page.getByRole('button', { name: 'Ajustes' })).toBeVisible();
  await expect.poll(() => savedKeys(page), { timeout: 5_000 }).toContain(`u:${ME}:auth:profile`);

  await page.goto('/ajustes/cuenta');
  await page.getByRole('button', { name: 'Eliminar cuenta' }).click();
  await page.getByLabel(/Escribe ELIMINAR/).fill('ELIMINAR');
  await page.getByRole('button', { name: 'Eliminar mi cuenta para siempre' }).click();
  await expect(page).toHaveURL(/\/tabs\/events$/);
  await expect.poll(async () => (await savedKeys(page)).filter(key => key.startsWith('u:')), { timeout: 5_000 }).toEqual([]);
});
