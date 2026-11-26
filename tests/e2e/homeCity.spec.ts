import { expect, test, type Page, type Route } from '@playwright/test';
import { signInWithFakeBackend, supabaseUrl } from './fakeSession';

// The home city is one choice for the whole app: the button on top of Inicio
// and «Ciudad principal» in Ajustes → Perfil open the same picker, and what
// is picked there is what Inicio lists. Supabase is answered from fixtures.

const SHOTS = process.env.LS_SCREENSHOTS_DIR;
const shot = async (page: Page, name: string, projectName: string) => {
  if (SHOTS && projectName === 'mobile-chromium') await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const cities = [
  { city: 'Madrid', event_count: 12, latitude: 40.42, longitude: -3.7 },
  { city: 'Barcelona', event_count: 8, latitude: 41.39, longitude: 2.17 },
  { city: 'A Coruña', event_count: 2, latitude: 43.36, longitude: -8.41 },
];

const serveVisitor = async (page: Page) => {
  await page.route(`${supabaseUrl}/**`, async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => undefined);
    if (path === '/rest/v1/rpc/get_upcoming_cities') return json(cities);
    if (path.startsWith('/auth/v1/')) return json({});
    return json([]);
  });
};

const cityButton = (page: Page, city: string) => page.getByRole('button', { name: `Ciudad: ${city}. Cambiar` }).first();

test('a visitor changes the city from the top of Inicio and it sticks', async ({ page }, info) => {
  await page.addInitScript(() => window.localStorage.setItem('live_space.onboarding_seen', '1'));
  await serveVisitor(page);
  await page.goto('/tabs/events');

  // Nothing chosen yet: Inicio shows Madrid and asks about it.
  await expect(cityButton(page, 'Madrid')).toBeVisible();
  await expect(page.getByText('¿Es Madrid tu ciudad?')).toBeVisible();
  await shot(page, 'inicio-ciudad', info.project.name);

  await cityButton(page, 'Madrid').click();
  const sheet = page.getByRole('dialog', { name: 'Elegir ciudad' });
  await expect(sheet.getByRole('button', { name: 'Usar mi ubicación' })).toBeVisible();
  await sheet.getByRole('searchbox', { name: 'Buscar ciudad' }).fill('barc');
  await expect(sheet.getByRole('button', { name: /A Coruña/ })).toHaveCount(0);
  await shot(page, 'inicio-ciudad-sheet', info.project.name);
  await sheet.getByRole('button', { name: /Barcelona/ }).click();

  await expect(cityButton(page, 'Barcelona')).toBeVisible();
  await expect(page.getByText(/tu ciudad\?/)).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('live_space.city'))).toBe('Barcelona');

  await page.reload();
  await expect(cityButton(page, 'Barcelona')).toBeVisible();
});

test('«Ciudad principal» in Ajustes opens the same picker and saves to the profile', async ({ page }) => {
  const backend = await signInWithFakeBackend(page);
  await page.route(`${supabaseUrl}/rest/v1/rpc/get_upcoming_cities*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cities) }),
  );
  await page.goto('/ajustes/perfil');

  // The profile's city (Madrid in the fixture) is the home's.
  await cityButton(page, 'Madrid').click();
  await page.getByRole('dialog', { name: 'Elegir ciudad' }).getByRole('button', { name: /Barcelona/ }).click();
  await expect(cityButton(page, 'Barcelona')).toBeVisible();

  await expect
    .poll(() =>
      backend.calls.some(call => call.method === 'POST' && call.path.startsWith('/rest/v1/profiles') && (call.body || '').includes('"primary_city":"Barcelona"')),
    )
    .toBe(true);
  expect(await page.evaluate(() => window.localStorage.getItem('live_space.city'))).toBe('Barcelona');
});
