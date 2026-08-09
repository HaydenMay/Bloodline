import { Page, expect } from '@playwright/test';

/**
 * Test helper functions for Bloodline E2E tests.
 * These abstractions make tests readable and maintainable.
 */

export async function goToApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveTitle('Bloodline');
}

/**
 * Navigate through starter selection screen
 */
export async function selectStarterHorse(page: Page): Promise<string> {
  // Wait for and click New Game
  const newGameButton = page.locator('button:has-text("New Game")');
  await newGameButton.waitFor({ state: 'visible', timeout: 10000 });
  await newGameButton.click();

  // Wait for starter carousel
  const starterCarousel = page.locator('.starter-carousel');
  await starterCarousel.waitFor({ state: 'visible', timeout: 10000 });
  await expect(page.locator('text=Choose Your Starter')).toBeVisible();

  // Get the starter name before selecting
  const starterName = await page.locator('.sc-carousel-info h3').first().textContent();
  console.log(`Selected starter: ${starterName}`);

  // Click Select button
  const selectButton = page.locator('button:has-text("Select")').first();
  await selectButton.click();

  return starterName || 'Unknown';
}

/**
 * Complete the training week by selecting a training activity
 */
export async function completeTrainingWeek(page: Page): Promise<void> {
  // Wait for training screen
  await expect(page.locator('text=Training Plan')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);

  // Scroll to see all options and find the advancement path
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(500);

  // Look for week summary section or advancement button
  // Usually at bottom after all training options
  const allText = await page.locator('body').textContent();
  const hasWeekSummary = allText?.includes('Summary') || allText?.includes('total');

  console.log('Training screen visible, looking for advancement...');

  // Try to find a button that explicitly advances (not a training option)
  // Buttons that advance typically say: Next Week, Continue, Confirm, Proceed, Start Race, etc.
  const advanceButton = page.locator('button').filter({
    hasText: /Next|Continue|Confirm|Proceed|Week|Start|Skip/i,
  }).first();

  if (await advanceButton.count() > 0) {
    const buttonText = await advanceButton.textContent();
    console.log(`Clicking advance button: "${buttonText?.trim()}"`);
    await advanceButton.click();
    await page.waitForTimeout(1500);
  } else {
    // If no advance button found, we might be at a different screen
    console.log('No advance button found, screen might have changed');
  }
}

/**
 * Select a race from the race calendar
 */
export async function selectRaceFromCalendar(page: Page): Promise<string> {
  // Wait for race calendar to appear
  const bodyText = await page.locator('body').textContent();

  // Debug: log current page state
  if (!bodyText?.includes('Race')) {
    console.log('Page content:', bodyText?.substring(0, 200));
  }

  // Look for race entries - try multiple selectors
  let raceEntries = page.locator('[class*="race"]').filter({ hasText: /m$|Distance/ });
  let count = await raceEntries.count();

  // Try alternative selector if first didn't find anything
  if (count === 0) {
    raceEntries = page.locator('div, button').filter({ hasText: /Stakes|Cup|Derby|Classic/ });
    count = await raceEntries.count();
  }

  // Last resort: any clickable element that looks like a race option
  if (count === 0) {
    raceEntries = page.locator('button').first();
    count = await raceEntries.count();
  }

  if (count === 0) {
    throw new Error('No race entries found in calendar. Page shows: ' + bodyText?.substring(0, 300));
  }

  // Get race name/details before clicking
  const raceName = await raceEntries.first().textContent();
  console.log(`Selecting race: ${raceName?.substring(0, 50)}`);

  // Click the first race
  await raceEntries.first().click();
  await page.waitForTimeout(1500);

  return raceName || 'Unknown';
}

/**
 * Verify we're at the race intro screen
 */
export async function verifyAtRaceIntro(page: Page): Promise<void> {
  const bodyText = await page.locator('body').textContent();
  const hasDistance = bodyText?.includes('Distance');
  const hasGoing = bodyText?.includes('Going');
  const hasField = bodyText?.includes('Field');

  if (!hasDistance || !hasGoing || !hasField) {
    throw new Error(`Not at race intro. Body contains: ${bodyText?.substring(0, 200)}`);
  }

  console.log('✓ Verified at race intro screen');
}

/**
 * Click View Opponents button to open dossier
 */
export async function openViewOpponents(page: Page): Promise<void> {
  const viewOpponentsButton = page.locator('button:has-text("View Opponents")');
  await expect(viewOpponentsButton).toBeVisible({ timeout: 5000 });
  await viewOpponentsButton.click();
  console.log('Clicked View Opponents');
}

/**
 * Wait for dossier carousel to load
 */
export async function waitForDossier(page: Page): Promise<void> {
  const dossierCarousel = page.locator('.dossier-carousel');
  await dossierCarousel.waitFor({ state: 'visible', timeout: 10000 });

  const fieldDossierTitle = page.locator('text=Field Dossier');
  await expect(fieldDossierTitle).toBeVisible();

  console.log('✓ Dossier carousel loaded');
}

/**
 * Click Start Race button on dossier screen
 */
export async function clickStartRaceOnDossier(page: Page): Promise<void> {
  const startRaceButton = page.locator('button:has-text("Start Race")');
  await expect(startRaceButton).toBeVisible();
  await startRaceButton.click();
  console.log('Clicked Start Race from dossier');
  await page.waitForTimeout(500);
}

/**
 * Verify we've returned to race intro (dossier should be hidden)
 */
export async function verifyReturnedToRaceIntro(page: Page): Promise<void> {
  // Check race intro content is visible
  const bodyText = await page.locator('body').textContent();
  const hasDistance = bodyText?.includes('Distance');
  const hasGoing = bodyText?.includes('Going');

  if (!hasDistance || !hasGoing) {
    throw new Error(`Failed to return to race intro. Current text: ${bodyText?.substring(0, 200)}`);
  }

  // Verify dossier is no longer visible
  const dossierVisible = await page.evaluate(() => {
    const elem = document.querySelector('.dossier-carousel');
    if (!elem) return false;
    const style = window.getComputedStyle(elem);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });

  if (dossierVisible) {
    throw new Error('Dossier carousel still visible after Start Race click');
  }

  console.log('✓ Verified returned to race intro');
}

/**
 * Full career flow: starter → training → race → race intro
 * Returns the starter horse name and selected race
 */
export async function navigateFullCareerFlow(page: Page): Promise<{ starter: string; race: string }> {
  console.log('\n=== FULL CAREER FLOW ===');
  await goToApp(page);

  console.log('→ STARTER SELECTION');
  const starter = await selectStarterHorse(page);

  console.log('→ TRAINING SCREEN');
  await completeTrainingWeek(page);

  console.log('→ RACE CALENDAR');
  const race = await selectRaceFromCalendar(page);

  console.log('→ RACE INTRO');
  await verifyAtRaceIntro(page);

  console.log('=== CAREER FLOW COMPLETE ===\n');

  return { starter, race };
}
