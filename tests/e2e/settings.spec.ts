import { expect, test } from '@playwright/test';
import { OTHER, signInWithFakeBackend } from './fakeSession';

// Ajustes, account deletion and blocking with a fake session: every Supabase
// request is answered by tests/e2e/fakeSession.ts, nothing is written.

const SHOTS = process.env.LS_SCREENSHOTS_DIR;
const shot = async (page: import('@playwright/test').Page, name: string, projectName: string) => {
  if (SHOTS && projectName === 'mobile-chromium') await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test('the gear in Perfil opens Ajustes; each row opens its page and back returns to the list', async ({ page }, info) => {
  await signInWithFakeBackend(page);
  await page.goto('/tabs/profile');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/ajustes$/);
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Perfil.*@ana/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Cuenta.*ana@example\.test/ })).toBeVisible();
  await shot(page, 'ajustes', info.project.name);

  await page.getByRole('link', { name: /^Privacidad/ }).click();
  await expect(page).toHaveURL(/\/ajustes\/privacidad$/);
  await expect(page.getByRole('link', { name: /Usuarios bloqueados/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ocultos del mapa/ })).toBeVisible();
  await expect(page.getByRole('switch', { name: /reutilicen/ })).toBeVisible();
  await shot(page, 'ajustes-privacidad', info.project.name);

  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page).toHaveURL(/\/ajustes$/);

  await page.getByRole('link', { name: /Legal/ }).click();
  await page.getByRole('link', { name: 'Condiciones de uso' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Condiciones de uso' })).toBeVisible();
});

test('an unknown section goes back to the list; old ?edit links open Perfil', async ({ page }) => {
  await signInWithFakeBackend(page);
  await page.goto('/ajustes/no-existe');
  await expect(page).toHaveURL(/\/ajustes$/);
  await page.goto('/tabs/profile?edit=profile');
  await expect(page).toHaveURL(/\/ajustes\/perfil$/);
  await expect(page.getByText('Nombre visible')).toBeVisible();
});

test('deleting the account needs the word, then signs out and lands on the home', async ({ page }, info) => {
  const backend = await signInWithFakeBackend(page);
  await page.goto('/ajustes/cuenta');
  await page.getByRole('button', { name: 'Eliminar cuenta' }).click();
  await expect(page.getByRole('heading', { name: '¿Eliminar tu cuenta?' })).toBeVisible();
  await expect(page.getByText('Todos los momentos que has subido: fotos y vídeos.')).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Eliminar mi cuenta para siempre' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Escribe ELIMINAR/).fill('eliminar');
  await expect(confirm).toBeEnabled();
  await shot(page, 'eliminar-cuenta', info.project.name);
  await confirm.click();
  await expect(page).toHaveURL(/\/tabs\/events$/);
  await expect(page.getByText('Tu cuenta se ha eliminado.')).toBeVisible();
  expect(backend.calls.some(call => call.method === 'POST' && call.path.startsWith('/rest/v1/rpc/delete_my_account'))).toBe(true);
});

test('without the backend function the deletion offers the email request', async ({ page }) => {
  await signInWithFakeBackend(page, { deleteAccount: 'missing' });
  await page.goto('/ajustes/cuenta');
  await page.getByRole('button', { name: 'Eliminar cuenta' }).click();
  await page.getByLabel(/Escribe ELIMINAR/).fill('ELIMINAR');
  await page.getByRole('button', { name: 'Eliminar mi cuenta para siempre' }).click();
  await expect(page.getByRole('alert')).toContainText('Ahora mismo no podemos borrarla desde la app');
  await expect(page).toHaveURL(/\/ajustes\/cuenta$/);
});

test('blocking from a profile asks first, then hides their moments', async ({ page }, info) => {
  const backend = await signInWithFakeBackend(page);
  await page.goto(`/profile/${OTHER}`);
  await page.getByRole('button', { name: 'Bloquear a @ruido' }).click();
  await expect(page.getByRole('heading', { name: '¿Bloquear a @ruido?' })).toBeVisible();
  await shot(page, 'bloquear-usuario', info.project.name);
  await page.getByRole('button', { name: 'Bloquear a @ruido' }).last().click();
  await expect(page.getByText('Has bloqueado a @ruido.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desbloquear a @ruido' })).toBeVisible();
  const insert = backend.calls.find(call => call.method === 'POST' && call.path.startsWith('/rest/v1/user_blocks'));
  expect(insert?.body).toContain(OTHER);
});

test('Ajustes lists what is hidden from the map and shows it again', async ({ page }, info) => {
  const backend = await signInWithFakeBackend(page);
  await page.goto('/ajustes/privacidad');
  await expect(page.getByRole('link', { name: /Ocultos del mapa.*2/ })).toBeVisible();
  await page.getByRole('link', { name: /Ocultos del mapa/ }).click();
  await expect(page.getByText('Sala Ejemplo')).toBeVisible();
  await expect(page.getByText('Banda Ejemplo')).toBeVisible();
  await shot(page, 'ajustes-ocultos-del-mapa', info.project.name);
  await page.getByRole('button', { name: 'Mostrar' }).first().click();
  await expect(page.getByText('Sala Ejemplo')).toHaveCount(0);
  expect(backend.calls.some(call => call.method === 'DELETE' && call.path.startsWith('/rest/v1/hidden_map_subjects'))).toBe(true);
});

test('Usuarios bloqueados lists blocks and unblocks', async ({ page }, info) => {
  const backend = await signInWithFakeBackend(page, { blocked: true });
  await page.goto('/ajustes/bloqueados');
  await expect(page.getByText('@ruido')).toBeVisible();
  await shot(page, 'ajustes-bloqueados', info.project.name);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByText('No has bloqueado a nadie.')).toBeVisible();
  expect(backend.calls.some(call => call.method === 'DELETE' && call.path.startsWith('/rest/v1/user_blocks'))).toBe(true);
});
