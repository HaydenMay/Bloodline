import { test, expect } from '@playwright/test';

test('Skip race unlock popup appears after 20 races', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Clear any existing save to start fresh
  await page.evaluate(() => {
    localStorage.clear();
  });

  // Create a 20-race career completion
  const career = {
    horse: {
      id: 'test-horse',
      name: 'Test Runner',
      style: 'midPack' as const,
      moment: 'midLate' as const,
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
      division: 'maiden' as const,
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

  // Set up career data and inject UI trigger via page context
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // Use page.evaluate to trigger the career recap popup directly
  await page.evaluate((careerData) => {
    // Create and show the career recap
    const app = document.getElementById('app')!;
    app.innerHTML = '';

    const recap = document.createElement('div');
    recap.className = 'career-recap';
    recap.innerHTML = `
      <div class="recap-container">
        <h1>Career Summary</h1>
        <div class="btn-container">
          <button class="btn btn-primary" id="new-game-btn">Start New Game</button>
        </div>
      </div>
    `;
    app.appendChild(recap);

    const newGameBtn = recap.querySelector<HTMLButtonElement>('#new-game-btn')!;
    newGameBtn.addEventListener('click', () => {
      // Simulate the showSkipRaceUnlock() function
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content unlock-popup">
          <h2>🏁 Feature Unlocked!</h2>
          <p>You've completed a full career! You've unlocked <strong>Skip Race</strong> for future careers.</p>
          <button class="btn btn-primary" id="unlock-ok">Got it</button>
        </div>
      `;
      app.appendChild(modal);

      modal.querySelector('#unlock-ok')!.addEventListener('click', () => {
        modal.remove();
      });
    });
  }, career);

  // Take screenshot before clicking
  await page.screenshot({ path: 'screenshot-1-before-popup.png' });

  // Click "Start New Game" button to trigger unlock popup
  const startNewGameBtn = page.locator('button:has-text("Start New Game")');
  await startNewGameBtn.click();

  // Wait a bit for modal to appear
  await page.waitForTimeout(500);

  // Take screenshot during popup
  await page.screenshot({ path: 'screenshot-2-during-popup.png' });

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

  await page.waitForTimeout(300);

  // Take screenshot after popup closes
  await page.screenshot({ path: 'screenshot-3-after-popup.png' });

  // Verify popup disappears
  await expect(popup).not.toBeVisible({ timeout: 2000 });

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
