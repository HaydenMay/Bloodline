# Next: Phase 6 — The Archive

The pedigree tree. **This is the mechanic the game is named after**, and it was broken out of Phase 5
into a phase of its own so it gets a session with the context to do it properly rather than the tail
of one.

Read this, then [ROADMAP.md](ROADMAP.md) Phase 6, then [DESIGN.md](DESIGN.md) §10 "The archive".
[ongoing-decisions.md](ongoing-decisions.md) holds 26 parked judgement calls — **do not start on those
now**, they are deliberately deferred, but check it before deciding anything that looks like a balance
question.

---

## Where things stand

**Phase 5 is complete.** Breeding works end to end: retire a horse, breed it, race the foal.

| Stage | What landed |
|---|---|
| 1 | The inheritance budget, the pairing screen, foal-or-yearling careers |
| 1 follow-up | Bloodlines stopped converging toward bland |
| 2 | Stud fees, retired horses ageing out, stud influence paying prestige |
| 3 | Real coat genetics, trait and aptitude mutation, linebreeding, rejected foals sold into the world |
| 4 | The foal's first year — a rearing plan that resolves, not a spend screen |

`npm run check` is green: 28 test files, 461 tests, lint and build clean.

---

## What already exists to build the tree on

**None of this can be reconstructed after the fact**, which is why it was written down from the first
foal onward. It is all there waiting.

### The data

| Field | On what | Since |
|---|---|---|
| `sireId`, `damId` | every bred foal | Stage 1 |
| `generation` | every bred foal (1 for a starter or outside horse) | Stage 1 |
| `coatGenotype` | every bred foal — five loci, real alleles | Stage 3 |
| `stable.bloodstock` | every horse you ever retired, with its full career record | Phase 4 |
| `stable.world` | rivals, **including foals you sold**, ancestry intact | Stage 3 |
| `stable.pairings` | how many foals each pair produced | Stage 1 |

### The helpers

- **`pedigreeOf(stable)`** in `src/ui/studBook.ts` — returns `(id) => Horse | undefined`, indexing
  bloodstock and world together. This is how the tree walks upward. A horse in neither is one the yard
  never had anything to do with.
- **`relatedness(sire, dam, pedigree)`** in `src/sim/breeding.ts` — Wright's coefficient over two
  generations. Useful for the tree's "how related are these two" readouts.
- **`genotypeOf(horse)`** in `src/sim/coat.ts` — the horse's five loci, deriving a plausible genotype
  for any horse born before Stage 3. **This is what makes a gene inheritance map possible**: you can
  show which ancestor carried the chestnut that surfaced four generations later.
- **`createBadgeElement()`** in `src/ui/badgeLoader.ts` — the portrait component, already used by
  starter selection. Takes a coat and silks and gives you a tinted badge.
  [SHIELD_BADGE_IMPLEMENTATION.md](SHIELD_BADGE_IMPLEMENTATION.md) is the design note for exactly
  this use — "pedigree trees, retired-horse archives".

### What a card can show

`RetiredHorse` carries `legacyPeak`, `legacyBanked`, `retirementReason`, `wins`, `starts`,
`earnings`, `hallOfFame`, `retiredByInjury`, `careerNumber`. A detail card has everything it needs
without adding a field.

---

## What to build

DESIGN.md §10: *"A **CK3-style family tree** — portrait cards on generational rows, connecting lines,
click any ancestor for a detail card with stats, traits and win-loss record. Records every horse
you've bred or raced back to your first starter, plus a trait and gene inheritance map. This is the
story layer, and it's the title of the game. **First-class screen, not a submenu.**"*

Slice it so each step leaves something worth looking at:

### Step 1 — The tree, drawn

Generational rows, portrait cards, connecting lines. Start from the yard's living head — the horse
currently in training, or the newest retiree if there is none — and walk up through `pedigreeOf`.

**The rendering decision is already made, and it is the important one: keep everything, render almost
nothing.** Storage is not the constraint (657 bytes a horse, so a thousand is 825 KB against a
browser budget near 5 MB). Drawing five hundred portrait cards is. Direct line in full, side branches
folded behind a click.

### Step 2 — The detail card

Click any ancestor. Stats, traits, record, what it banked, whether it made the Hall of Fame, and how
it came to the yard — bred, bought, a starter, or an outside stud you paid a fee to.

### Step 3 — The inheritance map

Where a line's speed came from, and which ancestor carried a recessive. The coat genotypes make the
colour half literal — you can trace an `e` allele back through the horses that carried it unseen.

### Step 4 — Procedural naming

With the dedupe and quality safeguards. `createNameGenerator(rng, used)` in `src/data/names.ts`
already dedupes against a registry; what §10 asks for beyond that is the quality bar.

---

## Decisions — answered 2026-08-17

1. **Where does the tree live?** The Archive **replaces the Bloodstock door** on the main menu.
   Breeding (the stud book) is reached from inside the Archive, not the other way round.
2. **What is the tree rooted on?** The **living horse, looking up** (or the newest retiree if none is
   in training). A **"jump to top"** control scrolls the view to the earliest generation currently
   rendered, rather than re-rooting the data — a horse's ancestry has no single founder once outside
   studs enter a line, so "top" is a row on the canvas, not a horse.
3. **How much folds by default?** **Direct line only.** A setting reveals the rest of each ancestor's
   generation — the siblings and other foals a pairing produced — beside the direct-line card.
4. **Do sold foals appear inline or behind a toggle?** **Behind a toggle**, nested under the siblings
   setting: switch on siblings first, then sold foals can be shown within them.
5. **Canvas or DOM?** **DOM**, to start. Cards are HTML, lines are SVG/CSS. Revisit if node counts
   ever make it the bottleneck — direct-line-only folding was chosen partly to keep that far off.

---

## How this project works

Read this bit even if you skim the rest. It is why the last four stages landed cleanly.

- **Measure, do not reason.** Every real defect this project has shipped passed the unit tests and was
  only visible by running the thing many times and reading numbers. `npm run bloodline`,
  `npm run odds` and `npm run harness` exist for exactly that; the README documents what each answers.
- **Drive the real screens in a browser.** Chromium is at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Seed `localStorage` with a yard, click
  through, and screenshot. Bugs found this way in Phase 5 that no test caught: a mare recorded as the
  sire, every projection reading "D to S", stat bars auto-placing onto phantom grid rows, and a
  summary line that read like an arithmetic error.
- **`npm run check` before every push** — lint, typecheck, 461 tests.
- **`src/sim/` never imports from `ui/`, `render/` or `save/`.** Lint enforces it. `studBook.ts` lives
  in `ui/` only because the `Stable` type does; it is DOM-free.
- **Write the comment that explains *why*.** The codebase's comments carry the reasoning behind
  decisions, including the ones that were wrong first. That history is why a later session can tell a
  deliberate choice from an accident.

---

## What not to do

- **Do not start on [ongoing-decisions.md](ongoing-decisions.md).** Twenty-six parked items, several
  interacting — the betting fix changes the economy, which changes stud fees, which changes whether
  the Hall of Fame bar is reachable. They get decided together, after the Archive.
- **Do not re-tune breeding.** The constants in `sim/breeding.ts` were measured over eight
  generations, not guessed. `npm run bloodline` is the only thing that should ever move them.
- **Do not add fields to `Horse` for the tree.** Everything it needs is recorded. If something seems
  missing, check `pedigreeOf` and `genotypeOf` first.
