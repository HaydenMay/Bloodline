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

**Session Summary (Updated [DATE]):**

[Session notes here — will be cleared when new chat starts]

---

## Next Steps — Phase 3 Completion

**Remaining work to complete Phase 3 (A full career):**

1. **Finish training weeks mechanics** — Complete the other half
   - Condition states, form tracking, injury system, breakthrough mechanics
   
2. **Divisions & promotion/demotion** — Build division system
   - Points-based division placement, promotion/demotion logic
   
3. **Auto-race and skip** — Implement race automation
   - Auto-play race feature, skip race option

Once Phase 3 is complete, Phase 4 (The Stable) becomes the next priority.

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
