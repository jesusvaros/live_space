import { expect, test, type Page } from '@playwright/test';
import { signInWithFakeBackend } from './fakeSession';

// Ajustes → Notificaciones with a fake session (tests/e2e/fakeSession.ts):
// nothing reaches the database. On the web there is no system permission;
// the dev server lets a test pretend one with live_space.dev.push_permission.

const SHOTS = process.env.LS_SCREENSHOTS_DIR;
const shot = async (page: Page, name: string, projectName: string) => {
  if (SHOTS && projectName === 'mobile-chromium') await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

const pretendPermission = (page: Page, permission: 'granted' | 'denied' | 'prompt') =>
  page.addInitScript(value => window.localStorage.setItem('live_space.dev.push_permission', value), permission);

test('Ajustes lists Notificaciones; its page has the switches and the quiet hours, and saves', async ({ page }, info) => {
  const backend = await signInWithFakeBackend(page);
  await pretendPermission(page, 'granted');
  await page.goto('/ajustes');
  await expect(page.getByRole('link', { name: /Notificaciones.*Activadas/ })).toBeVisible();

  await page.getByRole('link', { name: /Notificaciones/ }).click();
  await expect(page).toHaveURL(/\/ajustes\/notificaciones$/);
  await expect(page.getByRole('heading', { name: 'Notificaciones' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Recibir notificaciones' })).toHaveAttribute('aria-checked', 'true');
  for (const name of ['El día del concierto', '¿Subes lo de anoche?', 'Recoger tu merch', 'Momentos nuevos', 'Conciertos nuevos']) {
    await expect(page.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.getByLabel('Silencio desde')).toHaveValue('23:00');
  await expect(page.getByLabel('Silencio hasta')).toHaveValue('09:00');
  await expect(page.getByText('Permitidas', { exact: true })).toBeVisible();
  await shot(page, 'notif-ajustes', info.project.name);

  await page.getByRole('switch', { name: 'Momentos nuevos' }).click();
  await expect(page.getByRole('switch', { name: 'Momentos nuevos' })).toHaveAttribute('aria-checked', 'false');
  await expect
    .poll(() => backend.calls.find(call => call.method === 'POST' && call.path.startsWith('/rest/v1/notification_preferences'))?.body ?? '')
    .toContain('"new_moments":false');

  await page.getByRole('switch', { name: 'Recibir notificaciones' }).click();
  await expect(page.getByRole('switch', { name: 'El día del concierto' })).toBeDisabled();
  await expect(page.getByText('No te enviamos ninguna')).toBeVisible();
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('link', { name: /Notificaciones.*Desactivadas/ })).toBeVisible();
});

test('a denied permission shows «Sin permiso» and how to turn it back on', async ({ page }, info) => {
  await signInWithFakeBackend(page);
  await pretendPermission(page, 'denied');
  await page.goto('/ajustes');
  await expect(page.getByRole('link', { name: /Notificaciones.*Sin permiso/ })).toBeVisible();
  await shot(page, 'notif-ajustes-lista', info.project.name);
  await page.goto('/ajustes/notificaciones');
  await expect(page.getByText('Bloqueadas', { exact: true })).toBeVisible();
  await expect(page.getByText(/tiene bloqueadas las notificaciones de Live Space/)).toBeVisible();
  await shot(page, 'notif-ajustes-denegado', info.project.name);
});

test('a permission not asked yet can be asked from Ajustes', async ({ page }, info) => {
  await signInWithFakeBackend(page);
  await pretendPermission(page, 'prompt');
  await page.goto('/ajustes/notificaciones');
  await expect(page.getByText('Sin preguntar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Permitir notificaciones' })).toBeVisible();
  await shot(page, 'notif-ajustes-sin-preguntar', info.project.name);
});

test('on the web the page explains notices arrive on the phone; dev builds show the token tool', async ({ page }, info) => {
  await signInWithFakeBackend(page);
  await page.goto('/ajustes/notificaciones');
  await expect(page.getByText('Solo en el móvil')).toBeVisible();
  await expect(page.getByText(/Los avisos llegan a la app del móvil/)).toBeVisible();

  await page.goto('/ajustes/acerca');
  await expect(page.getByRole('button', { name: 'Ver token de notificaciones' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver token de notificaciones' }).click();
  await expect(page.getByText(/solo Android por ahora/)).toBeVisible();
  await shot(page, 'notif-acerca-dev', info.project.name);
});
