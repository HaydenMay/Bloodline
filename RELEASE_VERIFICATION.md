# Release Verification

Run these checks from a clean working tree before creating an Itch.io build.

## Automated gate

```bash
npm run check
npm run harness
npm run odds
npm run margin-profile
npm run stat-leverage
npm run test:e2e
```

`npm run check` is the code-quality gate. The harness must pass every invariant and balance check; do not publish a build with a failed race gate. The odds report must show a negative expected value for every offered market. A row marked `no market` is intentional: the game does not sell an unfairly short price on an overwhelming favourite.

## Hosted candidate

Upload the production build privately to Itch.io, then use a fresh browser profile to verify:

1. Start a stable, finish a race manually, then finish one on autopilot.
2. Complete a retirement, breed a foal, and begin its career.
3. Back up the save, clear browser storage, and restore the downloaded file.
4. Toggle reduced motion and each text-size option; confirm the setting persists after a refresh.
5. Check 375x812 portrait, 812x375 landscape, 1440x900, and 1920x1080. Race lanes must remain above the HUD and every menu action must be reachable.

## Evidence to keep with the release

Record the build commit, browser/device versions, outputs from the four simulation reports, a screenshot from each viewport, and any accepted known issues. CI retains Playwright traces and screenshots when a browser test fails.
