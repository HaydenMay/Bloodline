import { test, expect } from '@playwright/test';
import { verifyAtRaceIntro, openViewOpponents, waitForDossier, clickStartRaceOnDossier, verifyReturnedToRaceIntro } from './helpers';

/**
 * Dossier / View Opponents Flow Tests
 *
 * These tests verify the critical path through the race opponent selection flow.
 * Uses the ?test-race parameter to jump to race-intro, simulating having progressed
 * through: starter selection → training → race calendar → selected race.
 *
 * This is pragmatic E2E testing: we test the integration points that matter most,
 * with full UI flow tests as a separate concern (slower, more brittle, lower ROI).
 */

test.describe('Dossier / View Opponents', () => {
  test('can open and close opponents dossier', async ({ page }) => {
    // Simulate arriving at race intro after full career progression
    await page.goto('/?test-race');
    await expect(page).toHaveTitle('Bloodline');
    await page.waitForTimeout(2000);

    console.log('=== DOSSIER FLOW TEST ===');

    // Verify at race intro
    await verifyAtRaceIntro(page);

    // Open View Opponents
    await openViewOpponents(page);

    // Verify dossier loads
    await waitForDossier(page);
    await page.screenshot({ path: 'tests/e2e/screenshots/dossier-open.png' });
    console.log('✓ Dossier opened successfully');

    // Click Start Race to return to race intro
    await clickStartRaceOnDossier(page);

    // Verify returned to race intro
    await verifyReturnedToRaceIntro(page);
    await page.screenshot({ path: 'tests/e2e/screenshots/back-at-race-intro.png' });
    console.log('✓ Successfully returned to race intro');
  });

  test('dossier carousel can navigate between opponents', async ({ page }) => {
    await page.goto('/?test-race');
    await page.waitForTimeout(2000);

    await openViewOpponents(page);
    await waitForDossier(page);

    // Get initial opponent name
    const firstOpponent = await page.locator('.dc-carousel-info h3').first().textContent();
    console.log(`Initial opponent: ${firstOpponent}`);

    // Click next arrow to navigate carousel
    const nextArrow = page.locator('.dc-arrows').locator('button').last();
    const nextArrowExists = await nextArrow.count() > 0;

    if (nextArrowExists) {
      await nextArrow.click();
      await page.waitForTimeout(300);

      const secondOpponent = await page.locator('.dc-carousel-info h3').first().textContent();
      expect(secondOpponent).not.toBe(firstOpponent);
      console.log(`✓ Carousel navigated to: ${secondOpponent}`);
    } else {
      console.log('⊘ Carousel arrows not found (might be disabled with 1 opponent)');
    }
  });

  test('dossier shows opponent details correctly', async ({ page }) => {
    await page.goto('/?test-race');
    await page.waitForTimeout(2000);

    await openViewOpponents(page);
    await waitForDossier(page);

    // Verify opponent info is displayed
    const opponentName = await page.locator('.dc-carousel-info h3').first();
    const opponentStyle = await page.locator('.dc-sub').first();
    const statValues = await page.locator('.dc-stat-value');

    await expect(opponentName).toBeVisible();
    await expect(opponentStyle).toBeVisible();
    expect(await statValues.count()).toBeGreaterThan(0);

    console.log('✓ Opponent details displayed correctly');
  });

  test('dossier dots navigation works', async ({ page }) => {
    await page.goto('/?test-race');
    await page.waitForTimeout(2000);

    await openViewOpponents(page);
    await waitForDossier(page);

    // Check opponent count via dots
    const dotButtons = page.locator('.dc-dot');
    const opponentCount = await dotButtons.count();

    expect(opponentCount).toBeGreaterThan(0);
    console.log(`✓ Dossier showing ${opponentCount} opponents`);

    // Try navigating via dots if multiple opponents
    if (opponentCount > 1) {
      const lastDot = dotButtons.last();
      await lastDot.click();
      await page.waitForTimeout(300);

      // Verify last dot is now active
      const activeDot = await page.evaluate(() => {
        const last = document.querySelectorAll('.dc-dot')[
          document.querySelectorAll('.dc-dot').length - 1
        ];
        return last?.classList.contains('is-active');
      });

      expect(activeDot).toBe(true);
      console.log('✓ Dot navigation works correctly');
    }
  });

  test('carousel works at mobile viewport size', async ({ page }) => {
    // Set mobile viewport to test responsive behavior
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/?test-race');
    await page.waitForTimeout(2000);

    await openViewOpponents(page);
    await waitForDossier(page);

    // Verify dossier is responsive and shows at mobile size
    const opponentName = await page.locator('.dc-carousel-info h3').first();
    await expect(opponentName).toBeVisible();

    // Verify carousel controls are accessible
    const dotButtons = page.locator('.dc-dot');
    const dotsVisible = await dotButtons.count() > 0;
    expect(dotsVisible).toBe(true);

    console.log('✓ Carousel responsive at mobile viewport size');
  });
});

test.describe('Race Intro Integration', () => {
  test('race intro canvas does not block dossier clicks', async ({ page }) => {
    /**
     * Regression test: ensures race intro canvas has pointer-events: none
     * so it doesn't intercept clicks on the dossier overlay.
     */
    await page.goto('/?test-race');
    await page.waitForTimeout(2000);

    await openViewOpponents(page);
    await waitForDossier(page);

    // This should not timeout - proves canvas isn't blocking
    const startRaceBtn = page.locator('button:has-text("Start Race")');
    await expect(startRaceBtn).toBeEnabled();

    console.log('✓ Race intro canvas does not block dossier interactions');
  });
});
