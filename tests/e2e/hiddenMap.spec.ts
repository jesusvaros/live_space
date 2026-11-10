import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// «Ocultar del mapa» on a venue page, signed out: the list lives in
// localStorage. Reads one published venue with the public anon key.

const env = (name: string) => {
  if (process.env[name]) return process.env[name] as string;
  try {
    return new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync('.env', 'utf8'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
};

const SHOTS = process.env.LS_SCREENSHOTS_DIR;

test('a venue can be hidden from the map and shown again, without an account', async ({ page, request }, info) => {
  const url = env('VITE_SUPABASE_URL');
  const key = env('VITE_SUPABASE_ANON_KEY');
  test.skip(!url || !key, 'needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  const response = await request.get(`${url}/rest/v1/venue_places?select=id,name&status=eq.published&limit=1`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  const [venue] = (await response.json()) as { id: string; name: string }[];
  test.skip(!venue, 'no published venue');

  await page.addInitScript(() => window.localStorage.setItem('live_space.onboarding_seen', '1'));
  await page.goto(`/tabs/venue/${venue.id}`);
  await page.getByRole('button', { name: 'Más opciones' }).click();
  if (SHOTS && info.project.name === 'mobile-chromium') await page.screenshot({ path: `${SHOTS}/sala-ocultar-del-mapa.png` });
  await page.getByRole('button', { name: 'Ocultar del mapa' }).click();
  await expect(page.getByText(`No verás a ${venue.name} en el mapa. Puedes deshacerlo en Ajustes.`)).toBeVisible();

  const stored = await page.evaluate(() => window.localStorage.getItem('live_space.hidden_map.v1'));
  expect(stored).toContain(venue.id);

  // Survives a reload and can be undone from the same menu.
  await page.reload();
  await page.getByRole('button', { name: 'Más opciones' }).click();
  await page.getByRole('button', { name: 'Mostrar en el mapa' }).click();
  await expect(page.getByText(`${venue.name} vuelve a salir en el mapa.`)).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('live_space.hidden_map.v1'))).toBeNull();
});
