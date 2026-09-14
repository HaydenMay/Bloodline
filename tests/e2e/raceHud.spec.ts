import { test, expect } from '@playwright/test';

test('starts a live race with the redesigned control dock', async ({ page }, testInfo) => {
  await page.goto('/?test-race');

  await expect(page.locator('.race-intro')).toBeVisible();
  await page.locator('.race-intro').click();
  await expect(page.locator('.race-canvas')).toBeVisible();

  // The first stage press begins the three-beat gate countdown. Wait until the
  // race is live rather than taking a screenshot of the pre-race overlay.
  await page.locator('.stage').click();
  await expect(page.getByLabel('Autopilot')).toBeDisabled({ timeout: 5_000 });

  await expect(page.locator('.racebar')).toContainText('Burst from the track');
  await expect(page.locator('.racebar')).not.toContainText('Preferred length');
  await expect(page.getByRole('button', { name: /burst/i })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('race-hud.png') });
});
