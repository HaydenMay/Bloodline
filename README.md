# Bloodline

Horse racing, training and breeding game. Browser and mobile web.

**[Play it live](https://haydenmay.github.io/Bloodline/)**

See [the Itch.io Early Access page draft and screenshot checklist](ITCH_PAGE_DRAFT.md) before launch.

## What is it?

Pick a horse, train it, race it, retire it, and breed the next generation. The horse is a **run**; your stable is the **save file** and never resets.

- **Race simulation** with real energy economics — pacing, drafting, kicking, traffic
- **Deep genetics** — real equine coat inheritance (bay, chestnut, flaxen, etc.), trait mutation, linebreeding
- **CK3-style pedigree archive** — trace hidden alleles across generations, see where your horse's speed came from
- **Living world** — ~70 AI rivals who train, age, promote, and retire on their own
- **Procedural naming** — foals named from their parents' names, always editable

Inspired by Crusader Kings 3 (pedigree trees) and Pokémon (hidden potential caps).

## Tech

TypeScript + Canvas 2D + Vite. No engine, no framework. Two runtime dependencies (`sharp`, `three`).

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

**`sim/` may never import from `render/`, `ui/` or `save/`, and may never touch the DOM.** Enforced by ESLint. This lets the balance harness run thousands of races headlessly — balance by evidence, not vibes.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:host     # local network, for phone testing
```

### Scripts

| Command | Does |
|---|---|
| `npm run check` | Lint + build + test (CI gate) |
| `npm run harness` | Headless balance harness (~1,200 races) |
| `npm run bloodline` | Multi-generation breeding trace |
| `npm run odds` | Betting market honesty check |
| `npm run probe` | Tick-by-tick trace of a single race |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture rules, code conventions, and how to get started.

## License

All Rights Reserved. Copyright 2026 May Hayden David. See [LICENSE](LICENSE).
