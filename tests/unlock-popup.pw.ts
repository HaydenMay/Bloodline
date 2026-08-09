import { test, expect } from '@playwright/test';

test('Skip race unlock popup appears after 20 races', async ({ page }) => {
  // Start the dev server (make sure it's running on :5173)
  await page.goto('http://localhost:5173');

  // Clear any existing save to start fresh
  await page.evaluate(() => {
    localStorage.clear();
  });

  // Reload to get to main menu
  await page.reload();

  // Wait for main menu to load
  await page.waitForSelector('.main-menu', { timeout: 5000 }).catch(() => {
    console.log('Main menu not found, trying alternative selector');
  });

  // Simulate having completed 20 races by setting localStorage directly
  await page.evaluate(() => {
    const career = {
      horse: {
        id: 'test-horse',
        name: 'Test Runner',
        style: 'midPack',
        moment: 'midLate',
        stats: {
          speed: 75,
          stamina: 75,
          grit: 75,
          burst: 75,
          temper: 75,
          consistency: 75,
        },
        wins: 5,
        starts: 20,
        division: 'maiden',
        preferredDistance: { min: 1000, max: 2000 },
        traits: [],
        age: 3,
      },
      playerSilks: { primary: '#F2C14E', secondary: '#12222B' },
      stats: {
        racesCompleted: 20,
        wins: 5,
        losses: 15,
        totalEarnings: 5000,
        topWins: [],
      },
      stable: { dossier: {} },
      week: 20,
      raceSelected: false,
    };
    localStorage.setItem('career', JSON.stringify(career));
  });

  // Reload to load the saved career
  await page.reload();

  // Wait for app to load and show career recap
  await page.waitForTimeout(2000);

  // Click "Start New Game" button to trigger unlock popup
  const startNewGameBtn = await page.locator('button:has-text("Start New Game")').first();
  await startNewGameBtn.click();

  // Wait for unlock popup to appear
  await page.waitForSelector('.modal-overlay', { timeout: 5000 });

  // Verify the popup content
  const popup = page.locator('.unlock-popup');
  await expect(popup).toBeVisible();

  const heading = popup.locator('h2');
  await expect(heading).toContainText('Feature Unlocked');

  const description = popup.locator('p').first();
  await expect(description).toContainText('Skip Race');

  // Verify unlock button exists
  const okBtn = popup.locator('button:has-text("Got it")');
  await expect(okBtn).toBeVisible();

  // Click OK to close popup
  await okBtn.click();

  // Verify popup disappears
  await expect(popup).not.toBeVisible({ timeout: 2000 });

  // Verify we're back at main menu
  await page.waitForTimeout(1000);

  console.log('✅ Skip race unlock popup test passed!');
});

test('Skip race buttons visible in career after unlock', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Set unlock flag
  await page.evaluate(() => {
    localStorage.setItem('skipRaceUnlocked', 'true');
  });

  // Create a career save
  const career = {
    horse: {
      id: 'test-horse',
      name: 'Test Runner',
      style: 'midPack',
      moment: 'midLate',
      stats: { speed: 75, stamina: 75, grit: 75, burst: 75, temper: 75, consistency: 75 },
      wins: 5,
      starts: 5,
      division: 'maiden',
      preferredDistance: { min: 1000, max: 2000 },
      traits: [],
      age: 3,
    },
    playerSilks: { primary: '#F2C14E', secondary: '#12222B' },
    stats: { racesCompleted: 5, wins: 2, losses: 3, totalEarnings: 2000, topWins: [] },
    stable: { dossier: {} },
    week: 5,
    raceSelected: false,
  };

  await page.evaluate((careerData) => {
    localStorage.setItem('career', JSON.stringify(careerData));
  }, career);

  // Reload and verify skip buttons are visible
  await page.reload();
  await page.waitForTimeout(2000);

  // Look for skip race button
  const skipBtn = page.locator('button:has-text("Skip Race")');

  // Buttons should exist and be visible (not display: none)
  const skipVisible = await skipBtn.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none';
  });

  console.log(`Skip button visible: ${skipVisible}`);
  expect(skipVisible).toBe(true);
});
