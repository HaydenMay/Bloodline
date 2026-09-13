import { test, expect } from '@playwright/test';

test('Dossier flow returns to the race card without losing the field', async ({ page }, testInfo) => {
  await page.goto('/?test-race-day');
  await expect(page).toHaveTitle('Bloodline');
  await expect(page.getByRole('heading', { name: 'Race Day' })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('race-day.png') });
  await page.getByRole('button', { name: 'Opponents' }).click();

  const dossier = page.locator('.dossier-carousel');
  await expect(dossier).toBeVisible();
  await expect(page.getByText('Field Dossier')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('dossier.png') });

  await page.getByRole('button', { name: 'Back to Race Card' }).click();
  await expect(page.getByRole('heading', { name: 'Race Day' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Opponents' })).toBeVisible();
  await expect(dossier).toHaveCount(0);
});
