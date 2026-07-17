import { expect, test } from '@playwright/test';

test('shows the shared sign-in experience', async ({ page }) => {
  await page.goto('/welcome');

  await expect(page.getByRole('heading', { name: 'Live Space' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('keeps unknown routes inside the app', async ({ page }) => {
  await page.goto('/does-not-exist');

  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'Live Space' })).toBeVisible();
});
