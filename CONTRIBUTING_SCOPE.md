# Bloodline — Contributing Scope & Instructions

**Start here** before beginning work on this project. This document establishes scope, patterns, and guardrails so all contributions align.

---

## What is Bloodline?

A **thoroughbred horse racing simulation** (Phase 3: career mode in progress). You breed horses, train them, and race them across a living world where AI rivals age, improve, and develop their own careers.

**Current status:** Playable single races exist; career mode (multiple races, training, breeding) is under development.

---

## Working on This Project

### First Things First
1. Read [DESIGN.md](DESIGN.md) for the full system design (racing mechanics, stat genetics, career progression)
2. Read [REBUILD.md](REBUILD.md) for the **current race simulation spec** (required before touching `src/sim/race/`)
3. Read [NEXT_PLAN.md](NEXT_PLAN.md) for **active work** (what to build next)
4. If historical context matters, check [HISTORY.md](HISTORY.md) (design iterations and failed approaches)
5. Run `npm run check` before committing (linting + build + test)

### Architecture (Do Not Break This)

The codebase is split into **4 isolated layers**:

```
src/
├── sim/         — Race simulation (MUST NOT import from render/ or ui/)
├── render/      — Canvas drawing, animation, visuals
├── ui/          — User-facing screens and controls
└── data/        — Static data: names, traits, colors, constants
```

**Golden rule:** `sim/` imports are **one-way only**. The simulation must never know about rendering or UI. This keeps balance verification honest (the harness runs pure sim with no graphics).

### Color System (Single Source of Truth)

All colors live in **`src/data/colors.ts`**:
- UI colors (with opacity variants)
- Horse coat colors
- Jockey silks
- Environment/scene colors
- Defaults and fallbacks

No hardcoded color values anywhere else. When UI or rendering code needs a color, import from `colors.ts` or from `render/palette.ts` which re-exports colors.ts.

### Code Style

**No comments unless the WHY is non-obvious.** Well-named code and code location are self-documenting.

**No error handling for scenarios that can't happen.** Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).

**Prefer editing existing files to creating new ones.** Don't add features, refactoring, or abstractions beyond what the task requires.

### Git & Commits

- Small, focused commits (one idea per commit)
- Descriptive message: what changed and why
- Always create **new commits**, never amend pushed commits
- Run `npm run check` before pushing
- **No force-push to main** (always confirm first)

---

## What to Work On

Check [NEXT_PLAN.md](NEXT_PLAN.md) for the current roadmap.

**Current priority (Phase 3):**
1. Race intro screen with fade-in animation
2. Idle horse animation on training screen
3. Visual hierarchy polish (spacing, typography, mobile testing)

**Lower priority (deferred):**
- Horse sprites on other screens
- Audio integration
- Advanced animations

---

## Tests & Verification

- Run `npm run test` (quick local tests)
- Run `npm run harness` if touching race constants (10-minute balance verification)
- Run `npm run ride-probe` if testing player controls

All three are gated by `npm run check` pre-commit.

---

## Performance Notes

- Target 60fps on mid-range phones
- Canvas rendering is the bottleneck, not the sim
- The gallop sheet (24-frame sprite) is the heavy asset
- Lazy-load sprites and backgrounds; don't preload everything

---

## Do Not:

- Hardcode colors (use `colors.ts`)
- Add error handling for impossible cases
- Make `sim/` depend on `render/` or `ui/`
- Refactor beyond what the task requires
- Amend or force-push commits
- Touch race constants without running the harness
- Add commentary-heavy code; let names and structure speak

---

## Useful Commands

```bash
npm run dev           # Start dev server with auto-open browser
npm run build         # Production build
npm run test          # Run tests
npm run harness       # 10-minute race-balance verification
npm run ride-probe    # Test player control effectiveness
npm run check         # lint + build + test (pre-commit check)
npm run margin-profile # Analyze race margins distribution
```

---

## Where Things Live

| What | Where |
|---|---|
| Race simulation | `src/sim/race/` |
| Horse rendering (rig) | `src/render/horse.ts` |
| Canvas setup and loops | `src/render/canvas.ts` |
| Track, minimap, HUD | `src/render/track.ts` |
| Race screen (gameplay UI) | `src/ui/raceScreen.ts` |
| Training screen | `src/ui/trainingScreen.ts` |
| Career/career data | `src/ui/career.ts` |
| All colors | `src/data/colors.ts` |
| Horse/sim constants | `src/sim/race/constants.ts` |
| Traits | `src/data/traits.ts` |
| Balance harness | `tools/harness.ts` |

---

## Questions Before You Start?

- Check if DESIGN.md or REBUILD.md already answer it
- Grep the codebase for similar patterns
- Look at recent commits (`git log --oneline -20`)
- If still stuck, ask — context is cheaper than wasted work

---

**Happy coding. Follow the guardrails, ship focused changes.**
