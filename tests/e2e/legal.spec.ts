import { expect, test } from '@playwright/test';

// Store requirements: public privacy policy, terms and account-deletion page
// on the web (no app, no account), and the same texts inside the app.

const SITE_URL = 'http://127.0.0.1:43918';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('live_space.onboarding_seen', '1'));
});

for (const [path, heading] of [
  ['/privacidad', 'Política de privacidad'],
  ['/condiciones', 'Condiciones de uso'],
  ['/borrar-cuenta', 'Borrar tu cuenta de Live Space'],
] as const) {
  test(`the public web serves ${path}`, async ({ page }) => {
    await page.goto(`${SITE_URL}${path}`);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page).toHaveTitle(/Live Space/);
    // The footer links the three pages from every page of the web.
    await expect(page.getByRole('navigation', { name: 'Pie' }).getByRole('link', { name: 'Privacidad' })).toBeVisible();
  });
}

test('the deletion page explains the in-app path and what is kept', async ({ page }) => {
  await page.goto(`${SITE_URL}/borrar-cuenta`);
  await expect(page.getByText('Eliminar cuenta', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué se conserva y cuánto' })).toBeVisible();
  await expect(page.getByText(/14 días/).first()).toBeVisible();
});

test('the landing footer links the legal pages', async ({ page }) => {
  await page.goto(`${SITE_URL}/`);
  const footer = page.getByRole('navigation', { name: 'Pie' });
  await expect(footer.getByRole('link', { name: 'Condiciones' })).toHaveAttribute('href', '/condiciones');
  await expect(footer.getByRole('link', { name: 'Borrar cuenta' })).toHaveAttribute('href', '/borrar-cuenta');
});

test('sign-in links the terms and the privacy policy, which open inside the app', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.getByText('Al continuar aceptas las')).toBeVisible();
  await page.getByRole('link', { name: 'Política de privacidad' }).click();
  await expect(page).toHaveURL(/\/legal\/privacidad$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeVisible();
  await page.getByRole('link', { name: 'Borrar tu cuenta' }).first().click();
  await expect(page).toHaveURL(/\/legal\/borrar-cuenta$/);
});

test('Ajustes needs an account', async ({ page }) => {
  await page.goto('/ajustes/cuenta');
  await expect(page).toHaveURL(/\/welcome$/);
});
