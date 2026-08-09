import { test, expect } from '@playwright/test';

test('View Opponents Start Race button navigates back to race intro', async ({ page }) => {
  // Load the app with the test-race parameter to get straight to a race
  await page.goto('/?test-race');

  // Wait for the race intro screen to load
  await expect(page).toHaveTitle('Bloodline');

  // Wait for "Field Dossier" or "View Opponents" button to appear in the race intro
  await page.waitForTimeout(2000);

  // Take a screenshot to see the race intro screen
  await page.screenshot({ path: '/tmp/race-intro.png' });

  // Look for the button that shows opponents - it might be labeled differently
  // Check what's actually on the page
  const bodyText = await page.locator('body').textContent();
  console.log('Race intro screen content:', bodyText?.substring(0, 300));

  // Try to find any button that might show opponents
  const allButtons = await page.locator('button').allTextContents();
  console.log('Available buttons:', allButtons);

  // If there's a View Opponents or similar button, click it
  const viewOpponentsButton = page.locator('button:has-text("View Opponents")');
  const count = await viewOpponentsButton.count();

  if (count > 0) {
    console.log('Found View Opponents button');
    await viewOpponentsButton.click();

    // Wait for the dossier carousel to appear
    await page.locator('.dossier-carousel').waitFor({ state: 'visible', timeout: 10000 });

    // Take a screenshot of the dossier screen
    await page.screenshot({ path: '/tmp/dossier-screen-2.png' });

    // Verify the title is "Field Dossier"
    await expect(page.locator('text=Field Dossier')).toBeVisible();

    // Click the Start Race button
    const startRaceButton = page.locator('button:has-text("Start Race")');
    await startRaceButton.click();

    // Wait a moment for navigation
    await page.waitForTimeout(500);

    // Take a screenshot after clicking Start Race
    await page.screenshot({ path: '/tmp/after-start-race-2.png' });

    // Verify that we're back at the race intro screen
    // Look for elements that indicate we're back at the intro
    const postRaceBody = await page.locator('body').textContent();
    console.log('After Start Race click:', postRaceBody?.substring(0, 300));

    // The race intro should be visible again
    const testRaceText = page.locator('text=Test Race');
    await expect(testRaceText).toBeVisible({ timeout: 5000 });
  } else {
    console.log('View Opponents button not found');
    throw new Error('View Opponents button not found on race intro screen');
  }
});
