# AI Agent Instructions

This document is your orientation guide. Read it first, then start work.

---

## Quick Start

1. **Get oriented:** Read [CONTRIBUTING_SCOPE.md](CONTRIBUTING_SCOPE.md), then [NEXT_PLAN.md](NEXT_PLAN.md)
2. **Explore:** Dive into the codebase to understand structure and current state
3. **Work:** Make focused commits directly to `main` (no branches, no PRs unless asked)
4. **End session:** When the user says they're starting a new chat, update the **Session Log** below, then erase it

---

## Key Rules

- **Commit directly to main** — No branches, no PRs. Focused, well-described commits.
- **Single source of truth for colors** — All colors live in `src/data/colors.ts`. No hardcoding.
- **Protect the architecture** — `src/sim/` must never import from `src/render/` or `src/ui/`. This is enforced by lint rules.
- **No unnecessary abstractions** — Build exactly what's asked, not "future-proof" versions.
- **No image generation** — Unless explicitly requested.
- **Run `npm run check` before pushing** — Catches lint/build/test issues pre-commit.

---

## Useful Commands

```bash
npm run dev           # Start dev server with auto-open browser
npm run build         # Production build
npm run test          # Run tests
npm run harness       # 10-minute race-balance verification (if touching race constants)
npm run ride-probe    # Test player control effectiveness
npm run check         # lint + build + test (pre-commit check)
```

---

## Session Log

**Session Summary (Updated 2026-08-06):**

Completed comprehensive documentation cleanup and centralized color system consolidation. Extracted 475 lines of design history from ROADMAP.md into new HISTORY.md file (preserves valuable debugging context without cluttering active roadmap). Trimmed ROADMAP.md from 980 to 200 lines, pointing instead to NEXT_PLAN.md for active work. Created CONTRIBUTING_SCOPE.md as onboarding guide covering architecture constraints (sim/ isolation), code style, git workflow, and quick reference to key files. Extended color centralization work: added 40+ UI color variants to src/data/colors.ts (opacity levels, condition states, overlay colors), updated all canvas rendering code (raceScreen.ts, track.ts, horse.ts) to use UI color exports instead of hardcoded hex values. Fixed remaining default silks and stable colors. Deleted two outdated docs (SHIELD_BADGE_IMPLEMENTATION.md, CODEBASE_MAP.md). Created AI_INSTRUCTIONS.md to standardize agent onboarding and session handoffs.

**Next Steps:** Race intro screen with fade-in animation (1-2 hrs, low complexity). Idle horse animation on training screen (1-2 hrs, depends on animation design choice). Visual hierarchy polish and mobile testing (2-3 hrs). All work should follow established patterns: commit directly to main, use centralized color system, run `npm run check` pre-commit. New agents read AI_INSTRUCTIONS.md → CONTRIBUTING_SCOPE.md → NEXT_PLAN.md to get up to speed.

---

## Navigation

| Document | Purpose |
|---|---|
| [CONTRIBUTING_SCOPE.md](CONTRIBUTING_SCOPE.md) | Project overview, architecture, code style |
| [DESIGN.md](DESIGN.md) | Complete system design (racing, genetics, career) |
| [REBUILD.md](REBUILD.md) | **Current race simulation spec** (read before touching `src/sim/race/`) |
| [NEXT_PLAN.md](NEXT_PLAN.md) | What to build next (active roadmap) |
| [ROADMAP.md](ROADMAP.md) | Phase overview and known issues |
| [HISTORY.md](HISTORY.md) | Design iterations and why approaches failed (for context) |
| [TRAITS.md](TRAITS.md) | Trait catalogue and mechanics |

---

## What to Do Now

1. Read [CONTRIBUTING_SCOPE.md](CONTRIBUTING_SCOPE.md) (5 min)
2. Skim [NEXT_PLAN.md](NEXT_PLAN.md) to see what's planned
3. Read this **Session Log** section to understand where we left off
4. Explore the codebase — start with `src/` structure, then dive into the current task
5. Make focused commits as you work
6. When done (or when user starts a new chat), update the Session Log with what you did and what's next, then erase it

Good luck.
