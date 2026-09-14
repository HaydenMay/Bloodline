# Release checkpoints

This log records the reproducible checks used for the production-readiness pass.
Run commands from the project root. Screenshot paths are produced by Playwright
and intentionally remain local test artifacts rather than committed binaries.

## Balance checkpoint

Command: `RACES=200 npm run harness`

Result: **13/13 gates passed**.

| Gate | Measurement |
|---|---|
| Championship style balance | frontRunner 11.5%, stalker 11.3%, midPack 12.8%, closer 14.5% |
| Contested lead | lone front-runner 10.0%; each of three 3.5% |
| Dominance | +5% four-stat edge 21.5%; +40% edge 78.5% |
| Margin profile | 2nd 1.8L, 3rd 3.9L, 4th 5.2L, 8th 14.2L |

The harness now uses a race-card-ready field for its baseline checks: entrants
are fit for the advertised trip, and the dominance/margin checks isolate the
property they claim to measure. Traits, fitness and race-day form retain their
own coverage elsewhere in the simulation and UI tests.

## UI checkpoints

Run: `npm run test:e2e`.

- Desktop live-race control dock: `test-results/raceHud-starts-a-live-race-with-the-redesigned-control-dock-chromium/race-hud.png`
- Mobile live-race control dock: `test-results/raceHud-starts-a-live-race-with-the-redesigned-control-dock-mobile-chromium/race-hud.png`
- Championship milestone behaviour is covered by `src/ui/championshipVictory.test.ts`: actual podium order, accessible dialog semantics, both next-step actions, and name escaping.

## Required release command set

```text
npm run check
npm run harness
npm run odds
npm run margin-profile
npm run stat-leverage
npm run test:e2e
```

Do not publish a build if a gate fails. Re-run the browser checks at desktop and
mobile widths after any change to race presentation or the championship flow.
