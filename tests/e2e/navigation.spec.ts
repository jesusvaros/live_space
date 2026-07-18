import { expect, test } from '@playwright/test';

test('shows the shared sign-in experience', async ({ page }) => {
  await page.goto('/welcome');

  await expect(page.getByRole('heading', { name: 'Live Space' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});

test('keeps unknown routes inside the public app', async ({ page }) => {
  await page.goto('/does-not-exist');

  await expect(page).toHaveURL(/\/tabs\/events$/);
  await expect(page.getByRole('heading', { name: 'Find your next night' })).toBeVisible();
});

test('allows anonymous discovery while protecting creation', async ({ page }) => {
  const renderErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') renderErrors.push(message.text());
  });

  await page.goto('/tabs/events');
  await expect(page.getByRole('heading', { name: 'Find your next night' })).toBeVisible();

  await page.goto('/tabs/discover');
  await expect(page.getByRole('heading', { name: 'Artists' })).toBeVisible();

  await page.goto('/tabs/feed');
  await expect(page.getByRole('heading', { name: 'Tonight' })).toBeVisible();

  await page.goto('/tabs/upload');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  expect(renderErrors.filter(message => message.includes('Maximum update depth'))).toEqual([]);
});
