import { expect, test } from '@playwright/test';

// A returning visitor: the first-run onboarding has its own test below.
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('onboarding')) return;
  await page.addInitScript(() => window.localStorage.setItem('live_space.onboarding_seen', '1'));
});

test('first open without an account shows the onboarding, which ends in the account', async ({ page }) => {
  await page.goto('/tabs/events');
  await expect(page).toHaveURL(/\/bienvenida$/);
  await expect(page.getByRole('heading', { name: /Lo grabaste/ })).toBeVisible();

  for (let step = 0; step < 3; step += 1) {
    await page.getByRole('button', { name: /Siguiente|Empezar/ }).click();
  }
  await expect(page.getByRole('heading', { name: /Crea tu cuenta/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Crear cuenta' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Ahora no' }).click();
  await expect(page).toHaveURL(/\/tabs\/events$/);

  // Only once.
  await page.goto('/tabs/events');
  await expect(page.getByRole('heading', { name: 'Cartelera' })).toBeVisible();
});

test('a concert QR opens the welcome and the picker without asking for an account', async ({ page }) => {
  await page.goto('/tabs/upload?qr=no-existe');
  await expect(page.getByText('Enhorabuena, estás aquí')).toBeVisible();
  await expect(page.getByRole('button', { name: /Sube tus fotos y vídeos/ })).toBeVisible();
  await expect(page).toHaveURL(/\/tabs\/upload/);
});

test('shows the shared sign-in experience', async ({ page }) => {
  await page.goto('/welcome');

  await expect(page.getByRole('heading', { name: /Lo grabaste/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Ya tengo cuenta' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
});

test('keeps unknown routes inside the public app', async ({ page }) => {
  await page.goto('/does-not-exist');

  await expect(page).toHaveURL(/\/tabs\/events$/);
  await expect(page.getByRole('heading', { name: 'Cartelera' })).toBeVisible();
});

test('allows anonymous discovery and picking moments before signing in', async ({ page }) => {
  const renderErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') renderErrors.push(message.text());
  });

  await page.goto('/tabs/events');
  await expect(page.getByRole('heading', { name: 'Cartelera' })).toBeVisible();

  await page.goto('/tabs/discover');
  await expect(page.getByRole('heading', { name: 'Explorar' })).toBeVisible();

  await page.goto('/tabs/feed');
  await expect(page.getByRole('tab', { name: 'Siguiendo' })).toBeVisible();

  // The account is asked for when publishing, not to open the uploader.
  await page.goto('/tabs/upload');
  await expect(page.getByRole('heading', { name: 'Subir momentos' })).toBeVisible();

  await page.goto('/gestion');
  await expect(page).toHaveURL(/\/welcome$/);
  expect(renderErrors.filter(message => message.includes('Maximum update depth'))).toEqual([]);
});

test('loads the anonymous map without runtime errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/tabs/map');

  await expect(page.locator('.leaflet-container')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
