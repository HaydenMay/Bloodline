import { test, expect } from '@playwright/test';

test('Dossier View Opponents flow: race intro → dossier → start race', async ({ page }) => {
  // Use the test-race parameter to jump straight to race intro
  // This simulates having gone through: starter → training → race calendar → selected a race
  await page.goto('/?test-race');

  console.log('=== RACE INTRO ===');
  await expect(page).toHaveTitle('Bloodline');

  // Wait for race intro to load
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/race-intro-test.png' });

  // Verify we're at the race intro by looking for race details
  const bodyText = await page.locator('body').textContent();
  console.log('At race intro, body contains:', bodyText?.substring(0, 150));

  if (!bodyText?.includes('Distance') || !bodyText?.includes('Going')) {
    throw new Error('Race intro not found');
  }

  // 1. CLICK VIEW OPPONENTS
  console.log('=== VIEW OPPONENTS ===');
  const viewOpponentsButton = page.locator('button:has-text("View Opponents")');
  await expect(viewOpponentsButton).toBeVisible({ timeout: 5000 });
  await viewOpponentsButton.click();
  console.log('Clicked View Opponents');

  // 2. DOSSIER CAROUSEL LOADS
  console.log('=== DOSSIER SCREEN ===');
  const dossierCarousel = page.locator('.dossier-carousel');
  await dossierCarousel.waitFor({ state: 'visible', timeout: 10000 });

  const fieldDossierTitle = page.locator('text=Field Dossier');
  await expect(fieldDossierTitle).toBeVisible();
  console.log('Dossier screen loaded');

  await page.screenshot({ path: '/tmp/dossier-screen-loaded.png' });

  // 3. CLICK START RACE BUTTON
  console.log('=== CLICK START RACE ===');
  const startRaceButton = page.locator('button:has-text("Start Race")');
  await expect(startRaceButton).toBeVisible();
  await startRaceButton.click();
  console.log('Clicked Start Race from dossier');

  // 4. VERIFY RETURN TO RACE INTRO
  console.log('=== VERIFY RETURN TO RACE INTRO ===');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/after-start-race-final.png' });

  // Verify we're back at race intro (look for race details again)
  const returnedBodyText = await page.locator('body').textContent();
  const hasDistance = returnedBodyText?.includes('Distance');
  const hasGoing = returnedBodyText?.includes('Going');

  if (!hasDistance || !hasGoing) {
    throw new Error('Failed to return to race intro. Current text: ' + returnedBodyText?.substring(0, 200));
  }

  // Verify dossier is gone
  const dossierVisible = await dossierCarousel.count() > 0 && await page.evaluate(() => {
    const elem = document.querySelector('.dossier-carousel');
    return elem && window.getComputedStyle(elem).display !== 'none';
  });

  if (dossierVisible) {
    throw new Error('Dossier carousel still visible after Start Race click');
  }

  console.log('✓ Successfully tested full flow: Race Intro → Dossier → Start Race → Back to Race Intro');
});
