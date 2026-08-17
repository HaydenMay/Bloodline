# AI Agent Instructions

This document is your orientation guide. Read it first, then start work.

---

## Quick Start

1. **Get oriented:** Read [CONTRIBUTING_SCOPE.md](CONTRIBUTING_SCOPE.md), then
   [NEXT_PLAN.md](NEXT_PLAN.md) — which carries the current phase's plan, what already exists to
   build it on, and the decisions to put in front of the user before starting
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

### Phase 5 — Breeding · complete

Four stages, all on `main`. `npm run check` green: 28 test files, 461 tests.

- **Stage 1** — the inheritance budget, the pairing screen, foal-or-yearling careers. The loop closes
- **Stage 1 follow-up** — bloodlines were converging toward bland; the cause was regression to the
  mean plus a variance term read as a standard deviation when it is a half-range. Fixed and measured
  over eight generations with the new `npm run bloodline`
- **Stage 2** — stud fees priced on legacy and potential, retired horses ageing out of the stud book,
  stud influence paying prestige. Also capped bets at 25% of a purse, after the player found that a
  Maiden bet paid better than winning the race
- **Stage 3** — real coat genetics (five loci, eight coats, no new art), trait and aptitude mutation
  at 8%, linebreeding that reads grandparents, rejected foals sold into the world as rivals
- **Stage 4** — the foal's first year, rebuilt at the user's steer from a spend screen into a rearing
  plan that resolves against facilities and can surprise you

**Two design claims were found marked ✅ and never built**, both fixed: complementary gendered
inheritance (DESIGN.md §2) and the Stud Farm's "+10% breeding potential" (`getBreedingBonus`, written
in Phase 4 and read by nothing until foal development used it). Worth assuming there are others.

### Phase 6 — The Archive · in progress

Step 1 (the tree, drawn) and a lightweight Step 2 (the detail card) are on `main`. Five decisions were
put to the user first, per [NEXT_PLAN.md](NEXT_PLAN.md): the Archive **replaces the Bloodstock door**
on the main menu (breeding now reached from inside it), roots on the **living horse looking up** with
a **jump-to-top** scroll control, folds to **direct line only** by default with a setting for **every
foal in a generation** and a nested toggle for **foals sold to rivals**, and renders in **DOM**, not
canvas.

- **`src/ui/archiveTree.ts`** — DOM-free: `buildAncestry` walks the pedigree from a root horse via
  `pedigreeOf`, stopping a branch where a parent is unrecorded rather than padding out a binary tree;
  `rowsOf` flattens it into generational rows in standard pedigree-chart order (paternal side before
  maternal) for free, from a full-subtree-before-next-subtree walk. `siblingsOf` and `isSoldFoal` back
  the two settings. 14 tests.
- **`src/ui/archiveScreen.ts`** — the screen. Oldest generation renders first (top of the page), root
  last (bottom) — "jump to top" is a scroll position, not a re-rooted tree, because a pedigree has no
  single founder once outside studs enter a line. Connecting lines are an SVG overlay, positions
  measured relative to the scrolling canvas's own box so they stay correct without a scroll listener.
  Clicking any card opens a detail overlay (badge, record, legacy, traits, stats via
  `renderStatRows`) without re-rendering the tree behind it, so toggling siblings preserves scroll
  position and opening a card doesn't cost a re-layout.
- **Found live, not by a test:** `.archive-detail { display: flex }` and `.archive-toggle { display:
  flex }` share CSS specificity with the browser's own `[hidden] { display: none }`, and an author
  rule at equal specificity wins regardless of the `hidden` attribute — so the detail overlay stayed
  visible and ate clicks even while `hidden`. Fixed with an explicit `<selector>[hidden] { display:
  none }` for each, and a new test in `screenStyles.test.ts` that would have caught it, following the
  pattern that file's own header comment already documents for a sibling class of mistake.
- Verified by seeding a real three-generation stable (via `sim/breeding.ts`'s `breed`, not hand-built
  fixtures) and driving it in Chromium: tree renders, lines connect the right cards, both toggles
  work, jump-to-top scrolls, the detail card opens and closes, and the round trip through the stud
  book and back to the main menu leaves no console errors.

**Not yet built:** Step 3 (the trait/gene inheritance map — which ancestor carried a recessive) and
Step 4 (procedural naming quality bar). Both are still open, along with anything about the detail
card's presentation that wants a second look once there's real bloodstock to browse.

**How this user works:** he plays the game and brings back real observations, which have been more
valuable than anything derived from the code — the betting exploit, the foal development rework, and
the tree's scale concern all came from him. Put crisp decisions in front of him with a recommendation
and he answers fast. He wants the reasoning, not just the result.

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
| [ongoing-decisions.md](ongoing-decisions.md) | 26 parked judgement calls. Read before deciding anything balance-shaped — but do not start on them |
| [CODEBASE_MAP.md](CODEBASE_MAP.md) | Folder-by-folder tour of what lives where |

---

## What to Do Now

1. Read [CONTRIBUTING_SCOPE.md](CONTRIBUTING_SCOPE.md) (5 min)
2. Skim [NEXT_PLAN.md](NEXT_PLAN.md) to see what's planned
3. Read this **Session Log** section to understand where we left off
4. Explore the codebase — start with `src/` structure, then dive into the current task
5. Make focused commits as you work
6. When done (or when user starts a new chat), update the Session Log with what you did and what's next, then erase it

Good luck.
