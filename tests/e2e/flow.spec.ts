import { test, expect, type Page } from '@playwright/test';

async function openDossier(page: Page): Promise<void> {
  await page.goto('/?test-race-day');
  await expect(page.getByRole('heading', { name: 'Race Day' })).toBeVisible();
  await page.getByRole('button', { name: 'Opponents' }).click();
  await expect(page.locator('.dossier-carousel')).toBeVisible();
}

test.describe('Race day dossier', () => {
  test('shows every opponent and returns to the preserved race card', async ({ page }, testInfo) => {
    await openDossier(page);
    const dossier = page.locator('.dossier-carousel');
    await expect(page.getByText('Field Dossier')).toBeVisible();
    await expect(page.locator('.dc-stat-value')).toHaveCount(6);
    await page.screenshot({ path: testInfo.outputPath('dossier.png') });

    await page.getByRole('button', { name: 'Back to Race Card' }).click();
    await expect(page.getByRole('heading', { name: 'Race Day' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Opponents' })).toBeVisible();
    await expect(dossier).toHaveCount(0);
  });

  test('navigates opponents by carousel controls', async ({ page }) => {
    await openDossier(page);
    const first = await page.locator('.dc-carousel-info h3').textContent();
    await page.getByRole('button', { name: 'Next item' }).click();
    await expect(page.locator('.dc-carousel-info h3')).not.toHaveText(first ?? '');
  });

  test('works at a touch viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openDossier(page);
    await expect(page.locator('.dc-dot')).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Back to Race Card' })).toBeEnabled();
  });
});
