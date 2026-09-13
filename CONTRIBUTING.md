# Contributing to Bloodline

## What is Bloodline?

A horse racing, training and breeding game. You pick a horse, train it, race it, retire it, and breed the next generation. The horse is a run; the stable is the save file and never resets.

**Current status:** Phases 0-6 complete. Preparing for Early Access on Itch.io.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:host     # local network, for phone testing
npm run check        # lint + build + test
```

## Architecture

```
src/
  sim/      pure logic — race, training, breeding, genetics. Zero DOM.
  render/   canvas drawing, skeletal horse rig, camera
  ui/       screens, menus, HUD
  data/     traits, divisions, name pools, coat genetics tables
  save/     versioned persistence and migrations
tools/      headless balance harness
```

### The one rule that matters

**`sim/` may never import from `render/`, `ui/` or `save/`, and may never touch the DOM.** Enforced by ESLint, not by convention.

Two corollaries:
- **Never call `Math.random()` in `sim/`.** Use `createRng`. The simulation must be reproducible from a seed.
- **Never change the meaning of an existing save field.** Add a new one and write a migration.

## Code style

- **No comments unless the WHY is non-obvious.** Well-named code speaks for itself.
- **No error handling for scenarios that can't happen.** Trust internal code. Only validate at boundaries.
- **Prefer editing existing files.** Don't add abstractions beyond what the task requires.
- **Single source of truth for colors** — `src/data/colors.ts`. No hardcoding.

## Testing

```bash
npm run check        # lint + build + test (pre-commit gate)
npm run harness      # headless balance verification (~1,200 races)
npm run bloodline    # multi-generation breeding trace
npm run odds         # betting market honesty
npm run ride-probe   # player control effectiveness
```

**Balance work is done by measuring, never by reasoning about the code.** Every real defect this project shipped passed the unit tests and was visible only by running the thing many times and reading numbers.

## Git

- Small, focused commits (one idea per commit)
- Descriptive message: what changed and why
- Always create new commits, never amend pushed commits
- Run `npm run check` before pushing
- No force-push to main

## What to work on

Check [ongoing-decisions.md](ongoing-decisions.md) for parked decisions. The current priority is implementing the 31 inert traits and shipping to Itch.io.

## Useful reference

| Document | Purpose |
|---|---|
| [DESIGN.md](DESIGN.md) | Complete system design |
| [REBUILD.md](REBUILD.md) | Current race simulation spec |
| [TRAITS.md](TRAITS.md) | Trait catalogue and mechanics |
| [ROADMAP.md](ROADMAP.md) | Phase overview and known issues |
| [HISTORY.md](HISTORY.md) | Design iterations and lessons learned |
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | Folder-by-folder tour |
| [ongoing-decisions.md](ongoing-decisions.md) | Parked balance decisions |
