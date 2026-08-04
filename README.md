# Bloodline

Horse racing, training and breeding game. Browser and mobile web.

You pick a horse, train it, race it, retire it, and breed the next generation.
The horse is a **run**; your stable is the **save file** and never resets.

> **All Rights Reserved.** This repository is public for visibility only.
> See [LICENSE](LICENSE).

> ### 🚧 The race simulation is being rebuilt from scratch
> All AI and movement logic was deliberately removed. Horses generate and render,
> but nothing moves. **[REBUILD.md](REBUILD.md) is the specification for the rebuild**
> and supersedes the racing sections of DESIGN.md and ROADMAP.md.
> Start there before touching anything under `src/sim/race/`.

---

## Documentation

| Document | Contents |
|---|---|
| **[DESIGN.md](DESIGN.md)** | The full design. Every system, and why it works that way. |
| **[TRAITS.md](TRAITS.md)** | Trait catalogue, the eight design rules, and the cut log. |
| **[ROADMAP.md](ROADMAP.md)** | Build phases, estimates, and the two hard gates. |
| **[CREDITS.md](CREDITS.md)** | Asset provenance. Nothing ships without a verified licence. |
| **[ART_BRIEF.md](ART_BRIEF.md)** | Spec to hand an artist for the horse. Layered, flat, riggable. |

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:host     # exposes on the local network, for phone testing
```

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run dev:host` | Dev server on the local network |
| `npm run build` | Typecheck, then production build |
| `npm run test` | Unit tests |
| `npm run lint` | ESLint, including the architecture rules |
| `npm run harness` | Headless balance harness |
| `npm run check` | Lint + build + test, everything CI runs |

---

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

**`sim/` may never import from `render/`, `ui/` or `save/`, and may never touch
the DOM.** This is enforced by ESLint, not by good intentions.

It exists so the balance harness can run the simulation thousands of times
headlessly — balance settled by evidence rather than by feel — and so that
tuning the simulation can never break the visuals.

Two corollaries:

- **Never call `Math.random()` in `sim/`.** Use `createRng`. The whole
  simulation must be reproducible from a seed.
- **Never change the meaning of an existing save field.** Add a new one and
  write a migration.

---

## Deployment

Pushing to `main` runs lint, tests and build, then deploys to GitHub Pages.
A broken build never reaches the site.

> ⚠️ `base` in [vite.config.ts](vite.config.ts) must match the repository name.
> Pages serves from a subpath, so if it drifts, every asset works on localhost
> and silently 404s in production.

---

## Status

**Phase 0 complete** — foundation, tooling, save schema, deploy pipeline.
Next: Phase 1, the race simulation and balance harness. See
[ROADMAP.md](ROADMAP.md).
