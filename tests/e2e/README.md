# Bloodline E2E Tests

End-to-end tests for Bloodline game flows using Playwright.

## Running Tests

```bash
# Run all E2E tests
npx playwright test

# Run specific test file
npx playwright test tests/e2e/flow.spec.ts

# Run with UI mode (interactive debugging)
npx playwright test --ui

# Run headed (see browser)
npx playwright test --headed

# Run specific test by name
npx playwright test -g "can open and close opponents dossier"
```

## Test Structure

### `helpers.ts`
Reusable page object-like helpers for common actions:

- **Screen navigation**: `goToApp()`, `selectStarterHorse()`, `completeTrainingWeek()`, `selectRaceFromCalendar()`
- **Dossier flow**: `openViewOpponents()`, `waitForDossier()`, `clickStartRaceOnDossier()`
- **Verification**: `verifyAtRaceIntro()`, `verifyReturnedToRaceIntro()`
- **Full flow**: `navigateFullCareerFlow()` - complete progression from starter to race

These helpers make tests readable and maintainable by abstracting implementation details.

### `flow.spec.ts`
Comprehensive tests for the dossier/View Opponents feature:

- **Open/close dossier**: Race intro → View Opponents → Dossier → Start Race → Back to race intro
- **Carousel navigation**: Arrow buttons and dot indicators
- **Opponent details**: Name, style, stats display correctly
- **Mobile responsiveness**: Works at mobile viewport sizes
- **Regression test**: Race intro canvas doesn't block dossier interactions

## Testing Strategy

### Pragmatic E2E Approach
We use different strategies for different tests:

1. **Dossier flow tests** (`flow.spec.ts`): Use `?test-race` parameter to jump directly to race-intro. This simulates having gone through the full career progression (starter → training → calendar) but avoids the brittleness of automating those complex screens.

2. **Full career flow** (`navigateFullCareerFlow()` in helpers): Attempts to navigate through all screens. Currently experimental due to UI complexity. Use for occasional validation, not in CI.

3. **Regression tests**: Target specific bugs (e.g., canvas blocking clicks) with minimal setup.

### Why This Approach?

**Faster & More Reliable**
- Tests complete in ~11s vs 30-40s for full navigation
- Lower failure rate (fewer screens = fewer places to break)
- Isolated testing (dossier changes don't break test setup)

**Better ROI**
- Test what matters: feature interactions, not navigation boilerplate
- Failures point to actual bugs, not flaky selectors
- Easier to maintain as UI evolves

**Full Flow Testing**
- Run occasionally as validation (manually or in periodic checks)
- Use helpers to make full flows reusable
- Consider when: major refactors, critical path changes, regression hunting

## Adding New Tests

### Example: Test carousel keyboard navigation

```typescript
test('dossier carousel responds to keyboard', async ({ page }) => {
  // Use helper to get to dossier
  await page.goto('/?test-race');
  await page.waitForTimeout(2000);
  await openViewOpponents(page);
  await waitForDossier(page);

  const firstOpponent = await page.locator('.dc-carousel-info h3').first().textContent();

  // Test keyboard navigation
  await page.press('body', 'ArrowRight');
  await page.waitForTimeout(300);

  const nextOpponent = await page.locator('.dc-carousel-info h3').first().textContent();
  expect(nextOpponent).not.toBe(firstOpponent);
  
  console.log('✓ Keyboard navigation works');
});
```

### Adding to Helpers

When you find yourself repeating test code, add it to `helpers.ts`:

```typescript
export async function navigateToDossier(page: Page): Promise<void> {
  await page.goto('/?test-race');
  await page.waitForTimeout(2000);
  await openViewOpponents(page);
  await waitForDossier(page);
}

// Then use in tests:
// await navigateToDossier(page);
```

## Debugging Tests

### Screenshots
Tests save screenshots to `tests/e2e/screenshots/`:

```typescript
await page.screenshot({ path: 'tests/e2e/screenshots/my-test.png' });
```

### Logging
Use `console.log()` - output appears in test runner:

```typescript
const opponent = await page.locator('.dc-carousel-info h3').first().textContent();
console.log(`Current opponent: ${opponent}`);
```

### Interactive Mode
```bash
npx playwright test --ui
```

This opens an interactive test runner where you can:
- Step through tests
- See snapshots at each step
- Inspect selectors
- Re-run individual tests

### Verbose Output
```bash
npx playwright test --verbose
```

## Fixing Broken Tests

1. **Selector no longer finds element**
   - Use inspector: `await page.pause()`
   - Or check with: `await page.locator('selector').count()`
   - Update selector in helper

2. **Test times out**
   - Add `await page.waitForTimeout(500)` after interactions
   - Check that elements have loaded: `await page.waitForSelector('.class')`

3. **Flaky tests**
   - Increase timeouts
   - Add intermediate waiting steps
   - Verify elements are stable before interacting

## CI Integration

Tests run on every push via GitHub Actions. See `.github/workflows/` for configuration.

To run locally before pushing:
```bash
npm run build && npx playwright test
```

## Architecture Notes

### Why `?test-race` for Dossier Tests
The dossier feature is accessed via:
- Main menu → New Game
- Starter selection (6 options)
- Training screen (multiple weeks possible)
- Race calendar (variable races)
- **Race intro** ← We enter here with `?test-race`

Without a shortcut, each dossier test would replay 3-4 minutes of UI navigation. With `?test-race`, we get to the interesting part in 2 seconds.

### Full Career Flow
`navigateFullCareerFlow()` exists for when you need to test end-to-end. It's slower but tests the actual user path. Use it:
- After major refactors
- When multiple features interact
- For occasional validation
- In pre-release checks

Not in CI on every commit because:
- High failure rate (many screens = many potential issues)
- Slow (blocks other tests)
- Low signal (fails for UI reasons, not logic bugs)
