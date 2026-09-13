# AI Agent Instructions

This document is your orientation guide. Read it first, then start work.

---

## Quick Start

1. **Get oriented:** Read [CONTRIBUTING.md](CONTRIBUTING.md) for project overview and code conventions
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
- **Measure, don't reason.** `npm run harness`, `npm run bloodline` and `npm run odds` exist because
  every real defect this project shipped passed the tests. If you are about to justify a number by
  arguing about it, measure it instead.
- **Drive the real screens.** Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  Seed `localStorage`, click through, screenshot. Four Phase 5 bugs were found this way and none of
  them would ever have failed a test.
- **Parked decisions stay parked.** [ongoing-decisions.md](ongoing-decisions.md) holds 26 open
  judgement calls, several interacting. Do not pick at them mid-phase.

---

## Useful Commands

```bash
npm run dev           # Start dev server with auto-open browser
npm run check         # lint + build + test (pre-commit check)

npm run harness       # Is a race believable? Invariants + style balance
npm run bloodline     # Is a bloodline believable? Careers bred across generations
npm run odds          # Is the betting market honest? Implied vs actual win rate
npm run probe         # Why did THIS race happen? A tick-by-tick trace
npm run ride-probe    # Player control effectiveness
```

---

## Session Log

### Phases 0–6 — Complete

All phases complete: foundation, race sim, one playable race, full career, the stable, re-balance, breeding, and the Archive (pedigree tree, detail card, coat inheritance map, procedural naming).

`npm run check` green. The game is playable at https://haydenmay.github.io/Bloodline/.

### Next: EA Ship Prep

Preparing for Early Access release on Itch.io. See [ongoing-decisions.md](ongoing-decisions.md) for parked balance decisions. The 31 inert traits and UI clarity fixes are the current priority.

**How this user works:** he plays the game and brings back real observations, which have been more
valuable than anything derived from the code — the betting exploit, the foal development rework, and
the tree's scale concern all came from him. Put crisp decisions in front of him with a recommendation
and he answers fast. He wants the reasoning, not just the result.

**Session Summary (Updated [DATE]):**

[Session notes here — will be cleared when new chat starts]

---



## Navigation

| Document | Purpose |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Project overview, architecture, code style |
| [DESIGN.md](DESIGN.md) | Complete system design (racing, genetics, career) |
| [REBUILD.md](REBUILD.md) | **Current race simulation spec** (read before touching `src/sim/race/`) |
| [ROADMAP.md](ROADMAP.md) | Phase overview and known issues |
| [HISTORY.md](HISTORY.md) | Design iterations and why approaches failed (for context) |
| [TRAITS.md](TRAITS.md) | Trait catalogue and mechanics |
| [ongoing-decisions.md](ongoing-decisions.md) | Parked judgement calls. Read before deciding anything balance-shaped |
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | Folder-by-folder tour of what lives where |

---

## What to Do Now

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) (5 min)
2. Read this **Session Log** section to understand where we left off
3. Explore the codebase — start with `src/` structure, then dive into the current task
4. Make focused commits as you work
5. When done (or when user starts a new chat), update the Session Log with what you did and what's next, then erase it

Good luck.
