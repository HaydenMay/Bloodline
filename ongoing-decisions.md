# Ongoing decisions

Things raised, measured or half-answered that we have deliberately **not** acted on yet, so that
Phase 5 could finish without being pulled off course. Nothing here is a bug report — bugs get fixed
or logged under Known Issues in [ROADMAP.md](ROADMAP.md). These are the open judgement calls.

**Read this as soon as Phase 5 lands.** Several of these interact: the betting fix changes what the
economy looks like, which changes whether stud fees are right, which changes whether the Hall of Fame
bar is reachable. Deciding them one at a time in the wrong order means deciding some of them twice.

Items marked **[Hayden]** came out of play rather than out of the code, which is why they are the
ones worth trusting most.

Items marked **[Hayden — looking into]** are ones Hayden is taking himself. They are not parked for
want of a decision — he wants to look at them first, so do not pick one up without asking, even if
it looks like a quick win sitting next to whatever you are actually working on.

---

## Economy and betting

- **The betting market prices on a multiplier, not on odds** **[Hayden]** — **largely defused in
  play, and no longer urgent.** The exploit was betting $5,000 on a Maiden horse that won every
  race and being paid $35,000+, over and over, until promotion moved it on. Capping the stake at a
  share of the purse fixed the damage: the Maiden maximum is now $1,000 and scales up with the
  class, and Hayden reports the economy is "a lot better". What is *not* fixed is the cause —
  `winProbability` still prices a horse on its share of the field's total rating, so a horse that
  wins 97–100% of the time is still quoted at 15–25%. The cap bounds the payout without making the
  price honest. Fix, when it is worth doing: price off the rating *difference* against the field,
  through a curve fitted to what `npm run odds` measures. Detail in ROADMAP.md Known Issues.
- **Win rate concerns** **[Hayden]** — a 13-point stat edge wins 97% of 400 races. Is the engine more
  deterministic than intended, or is that the racing you want? Probably the same root as the margins
  issue below.
- **Winning margins are too wide** — about 3.7 lengths between first and second, with a tail near 60.
  Real racing is decided by one to three. Pre-existing, logged since Phase 4.5.
- **Stud fees were sized against a broken economy** — Maiden $300 rising to Championship $110,500,
  set deliberately steep because cash was inflating. If betting stops printing money, these may be
  far too high.
- **Yearling price** — $4,000 at an unknown yard, scaling to $16,000 at Legend. Chosen, not played.
- **The stake cap** — bets are capped at 25% of the race's purse, which closed the Maiden exploit.
  The number itself was never play-tested.

## How long the game lasts

- **The game may be over too quickly** **[Hayden]** — three generations in, a horse is 8 starts, 7
  wins, 8 top-three. Not one cause but three compounding: super horses arrive early from breeding,
  training outruns what the opposition ever becomes, and facilities cost a great deal for very
  little. Each has its own item below or above; this is the one that says they add up to a game that
  stops being a contest around generation three. Whatever gets decided elsewhere, this is the
  symptom to check it against.
- **Facilities cost too much for what they give** **[Hayden]** — $50,000 for an 8% morale bonus,
  when a player who always wins is already living at 100 morale, so the best upgrade in the game is
  worth nothing to the person who can afford it. Direction: **more levels, each cheaper**, so
  spending feels like steadily unlocking something rather than saving for one flat number. This was
  first written down as blocked on the betting fix; it is not. The stake cap already took the
  inflation out, so these prices can be judged against the economy as it actually plays now.

## The legacy ladder

- **The Hall of Fame at 1,000 is out of reach** — `npm run bloodline` has a generation-8 horse
  peaking near 495, because a career climbing from Maiden spends most of its starts in divisions
  that barely pay. Do not lower the bar before trying the two fixes below. **Real play is well ahead
  of that model, though** **[Hayden]**: a generation-3 horse banked **516** — more at generation 3
  than the trace projects at generation 8. The trace campaigns its horses mechanically and a person
  plays better, so treat 495 as a floor rather than the expected curve, and re-measure against a
  played save before deciding the bar is wrong.
- **The prestige walls are untouched** — Novice 0 / Professional 400 / Elite 1,500 / Champion 3,500 /
  Legend 7,500, all pending the Hall of Fame work. They probably move together or not at all.
- **Foals always debut in Maiden** — the main reason a bred horse cannot bank enough legacy to be
  enshrined. Changing it touches promotion, purses and the whole division ladder.

## Breeding numbers that want play, not measurement

- **Gender weighting at 0.58/0.42** — worth about three points of average potential on the most
  extreme pairing imaginable, far less on a normal one. Measured down from a much stronger first
  attempt; now needs to be felt.
- ~~**"Mares transmit condition" (DESIGN.md §2)**~~ — **decided: not building it.** Condition is not
  a thing a horse has more or less of, it is a gauge you fill by resting and empty by racing, so
  there is nothing there to inherit. Struck from §2, and every horse now starts its first season at
  100 instead of a flat 70. What *did* come out of looking at it is below, under Condition and form.
- **"Stallions transmit raw potential" (DESIGN.md §2)** — never built, and as written it would make
  stallions vertically stronger, contradicting the same paragraph's "neither is stronger". May simply
  be a drafting slip.
- **Trait and aptitude mutation at 8%** — roughly one foal in twelve shows something neither parent
  had. Chosen from taste; a one-line dial in either direction.
- **`rollPotential` is wrong at the top of the ladder** — a freshly generated Championship horse
  averages 94.9 potential with half its stats pinned at 100. Sidestepped by drawing studs from the
  world instead, but the generator is still wrong and starters read from it too.

## Condition and form

Found while answering the item above, not previously written down anywhere. **All three are
Hayden's**, and none of them should be acted on by an agent.

- **Condition barely does anything** **[Hayden — looking into]** — `CONDITION_MIN_FACTOR` 0.985 to
  1.0, so a jaded horse is **1.5% slower** than the same horse at its peak, in an engine where a
  13-point stat edge wins 97% of races. Five labels from "Could not be better in itself" to
  "Thoroughly over-raced" describe one and a half percent. Its only real teeth are injury risk
  (`injury.ts`: under 30 doubles a breakdown). Raising its weight is noise, so it interacts with the
  margins item above — but it may also be part of why the engine reads as more deterministic than
  intended, since nothing except raw stats is allowed to weigh much. Measure both with
  `npm run harness` rather than arguing it.
- **"Form" means two unrelated things in the code** **[Hayden — looking into]** — `getForm` in
  `sim/upkeep.ts` is the label on condition (Peak / In Form / Steady / Off Form / Jaded), while
  `form` in `race/engine.ts` is the per-race luck roll scaled by Temper. Same word, no relationship.
  One of them wants renaming.
- **Form is surfaced in exactly one place** **[Hayden — looking into]** — `ui/stableHub.ts`. Not on
  race day, not on the dossier, not in the archive. If peaking a horse for the right race is meant to
  be a skill (§5), the player currently cannot see it anywhere they would use it.
- **The player cannot find condition at all** **[Hayden]** — reported from play as "I have no
  indicator of what my horse's condition is, I see form and spirit but not condition". Form *is*
  condition, bucketed — but nothing on screen says so, so the number the whole training and rest
  loop turns on reads as a missing feature. Strong evidence the naming problem above is not
  cosmetic: it is already costing a player the ability to see a mechanic that is fully built.
  Note the word is overloaded a **third** time in `race/engine.ts`, where `player.condition` on the
  race HUD is the in-race tank, unrelated to either of the other two.

## The clock, and rerolling

- **Retiring early buys stud years** **[Hayden]** — a horse retired at three yields about 4.6 foals'
  worth of stud life against 4.2 at five. Self-limiting today because retiring early guts the banked
  legacy that sets every future foal's quality, but it is a strategy some players will find.
- **The world clock is blunt** — every retirement ages the world four years, even a two-race career.
  That bluntness *is* the anti-reroll brake §10 asks for, so any fix has to bring a replacement brake
  with it. The harder half of the problem.

## The world, and the size of the tree

- **Limit outside use of your stud** **[Hayden]** — a book limit, so a stallion covers a set number
  of outside mares a season rather than being available without end.
- **Family tree scale** **[Hayden]** — storage is not the constraint: a horse is 657 bytes, so a
  thousand of them is 825 KB against a browser budget near 5 MB. Drawing five hundred portrait cards
  is. Direction: keep everything, render almost nothing — direct line in full, side branches folded.
- **Outside descendants should be counts, not horses** — record a number, and build a real horse only
  when one actually appears on a racecard against you. This is what stops the tree growing
  exponentially once rivals breed to your stallions for real.
- **The world never ages** — rival horses stay two to five forever and are never replaced, so outside
  studs are eternally available and the racing population never turns over.
- **Rejected foals: price and timing** — what one sells for, and how long before it turns up on a
  racecard carrying your bloodline's name. The keep-or-sell decision is settled; the numbers are not.

## The two platforms

- **Desktop has fallen behind mobile** **[Hayden]** — the mobile clean-up was needed and worked, but
  it was done at desktop's expense. "I just feel like it should feel more polished." Four
  specifics, with what each one is caused by:

  - **The screen is a phone column on a monitor** — "it still looks like a mobile game, small and
    centered, until the races". Screen containers are capped and centred at 400–600 px throughout
    `style.css` (`.boot` 460, `.pre-race-content` 480, and a long tail of `max-width: 400px` /
    `600px` / `800px` blocks). The race screen is canvas and fills, which is why the feeling stops
    exactly there. This is the big one and it is a layout decision, not a bug: desktop wants its
    own breakpoint doing something with the width, not just a wider column.
  - **Text is too small to read without squinting** — sizes are absolute px and never scale up:
    `.detail-label` is 9 px, `.detail-value` 12 px, the HUD's own labels 9 px. They were chosen at
    phone scale, where a 9 px label sits close to the eye.
  - **The info box is a scrollable list** — fine on a phone, wrong on a monitor with room to show
    the whole thing at once.
  - **The purse renders black and vanishes into the background** on the race calendar. Confirmed,
    with a one-line cause — logged as a defect in ROADMAP.md Known Issues rather than here.

## Gaps and housekeeping

- **Starter selection maximum stats** **[Hayden]** — what the ceiling on a generation-1 horse should
  be, and how far the pool should scale with stable prestige without ever matching what breeding
  produces.
- **Multiple save slots (§13)** — a known gap since Phase 3. One slot plus export/import ships today.
- **The breeding manual (§13 codex)** — where relatedness, variance and the inheritance budget get
  explained properly, for players who want to understand the machine. Currently sitting in Phase 6.
- **`createStable()` seeds from `Date.now()`** — tests that build a stable get a different world every
  run, which has already caused one test to pass by luck for weeks.
- **NEXT_PLAN.md is stale** — it describes screen-transition work from an earlier phase, and
  README.md still links it as "the active working roadmap for upcoming work".
