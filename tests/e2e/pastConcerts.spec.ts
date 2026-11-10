import { expect, test } from '@playwright/test';

// Real production data: La Riviera has well over a page of past concerts.
const LA_RIVIERA = '66242507-0439-4b3b-9e72-550d324a1571';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('live_space.onboarding_seen', '1'));
});

test('a venue lists its past concerts, most recent first, a page at a time (6, then 12)', async ({ page }) => {
  const pastRequests: string[] = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/rest/v1/events') && url.includes('starts_at=lt.')) pastRequests.push(url);
  });

  await page.goto(`/tabs/venue/${LA_RIVIERA}`);
  await expect(page.getByRole('heading', { name: 'Próximos conciertos' })).toBeVisible();

  const section = page.getByTestId('past-concerts');
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('heading', { name: 'Conciertos pasados' })).toBeVisible();
  const rows = section.getByRole('listitem');
  await expect(rows).toHaveCount(6);
  expect(pastRequests.length).toBe(1);
  // Most recent first.
  expect(pastRequests[0]).toContain('order=starts_at.desc');

  await section.getByRole('button', { name: 'Ver más' }).click();
  await expect(rows).toHaveCount(18);
  expect(pastRequests[1]).toContain('offset=6');

  // Tapping one opens the concert.
  await rows.first().getByRole('button').click();
  await expect(page).toHaveURL(/\/event\/[0-9a-f-]{36}$/);
});
