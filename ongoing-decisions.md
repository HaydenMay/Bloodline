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
- **A new foal resets your income but not your prices** **[Hayden]** — starting a fresh horse drops
  earnings back to Maiden level while the facility upgrades still on offer cost $10,000–$32,000,
  and a $1,000 bet returning $6,000 means weeks of racing per upgrade. Possibly correct — a real
  yard does not get cheaper as it grows — but it is the point in the loop where progress most
  visibly stalls, and it lands right after the moment breeding is meant to feel like a reward.
  Decide it alongside the facility pricing below rather than separately.
- **Facilities cost too much for what they give** **[Hayden]** — $50,000 for an 8% morale bonus,
  when a player who always wins is already living at 100 morale, so the best upgrade in the game is
  worth nothing to the person who can afford it. Direction: **more levels, each cheaper**, so
  spending feels like steadily unlocking something rather than saving for one flat number. This was
  first written down as blocked on the betting fix; it is not. The stake cap already took the
  inflation out, so these prices can be judged against the economy as it actually plays now.

## The legacy ladder

- ~~**The Hall of Fame at 1,000 is out of reach**~~ — **reached, in play, at generation 5.** Serene
  Cadence inducted with **1,044**, front-runner, 19 starts, 74% win rate, $361,493 earned. Cost
  real effort — racing on into the back half of year 5 and a few consumables to get there — but
  that is the bar working as a bar, not the bar being unreachable. `npm run bloodline` still models
  a generation-8 horse peaking near 495, and that model is not wrong, it is measuring a mechanically
  campaigned line rather than a played one: a generation-3 real horse had already banked 516, ahead
  of the trace's generation-8 projection, before this one closed it out two generations later still.
  Treat the trace as a floor a careless line will still clear, not the expected curve. The two fixes
  it names below remain untried and may still be worth doing, but the bar itself is not the
  problem — closed, not open.
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
- **Mane colour wants to be a real gene, not a per-instance roll** **[Hayden]** — every named coat
  used to lock to one fixed mane colour, which is most of why a race field reads as the same few
  horses repeated (below, under Coat and mane variety). Fixed for now with `hairForHorse`
  (`render/palette.ts`): normally a colour from the coat's own ramp, occasionally
  (`HAIR_MUTATION_CHANCE`, 0.08) a colour borrowed whole from another coat — "you should be able to
  get a strawberry horse with black hair, creates uniqueness... just don't overdo it." That is
  deliberately an interim shape: it is hashed off the horse's own id, so a foal rolls its mane fresh
  rather than taking after a parent's, which is the wrong mechanic for something this game otherwise
  treats as real genetics. The real version gives mane its own locus in `sim/coat.ts`'s genotype,
  inherited through `inheritCoat` the way flaxen already is, with the mutation chance becoming a real
  allele-flip rather than a render-layer hash roll.

## The breeding screen

- **The pairing screen shows a price and nothing else** **[Hayden]** — "we just show the cost, so I
  went blindly based on the fact the new outside horse was expensive so she must be good." That is
  the whole decision being made on a proxy. §10 asks the screen to show projected potential *ranges*
  and deliberately nothing else, to avoid a relatedness lecture — but a partner's own **stats,
  legacy, wins and record** are not theory, they are the horse's public form, and withholding them
  is not the same restraint. The archive's detail card already renders exactly this and could be
  reused directly. Worth deciding how much: full card, or a summary line.

## The tank, and what the player can see of it

- **Make the tank visible** **[Hayden]** — from play: "I don't understand why my tank ran out. I had
  more stamina than the winner, we were both front-runners, he led early and never gave it up, I was
  second, got the red indicator and finished 8th. This doesn't make sense to me." The race was
  correct — an unpressed leader recovers 90% faster (`EASY_LEAD_RECOVER_BONUS`) while the horse
  pressing it pays `PRESS_COST` on top of its own drain — but none of that is visible, so a fair
  result read as a broken one. **This contradicts a stated decision**: REBUILD.md §5 keeps the tank
  hidden on purpose ("the tank itself stays hidden — no stamina bar") and the charge dots are meant
  to be its honest proxy. So the call is not just "add a bar", it is whether that decision still
  holds now that the energy economy has visible consequences a player cannot account for. Options:
  show the tank outright, keep it hidden but explain the *cause* on screen (a "dictating" / "under
  pressure" cue, which is the actual missing information), or leave it and cover it in the codex.
- **The lead/press asymmetry may simply be too strong** — 0.9 and 0.26 are large numbers for a
  mechanic nobody can see. Decide it with the tank-binding work above, since it only bites when
  energy is scarce.

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
- ✅ **The world clock was blunt — fixed.** `YEARS_PER_CAREER` used to age every horse already at stud
  a flat 4 years on every retirement, whether the retiring horse raced a two-race career or a full
  natural one. Replaced with `BREEDING_ADVANCE_AGE (6) - the retiring horse's own age`, floored at 0:
  a horse retired at debut age still costs the yard's studs the full 4 (unchanged — the fast
  reroll-and-retire brake this existed for keeps its bite), but one played out to its natural peak (5)
  now only costs 1, and one raced well past 6 costs nothing at all. Age itself no longer caps at
  `FINAL_AGE` either (`sim/growth.ts`) — a horse raced on indefinitely keeps ageing and its stats keep
  eroding every season, so racing an old horse forever is a real, escalating gamble rather than a
  plateau, now that retirement is always the player's own call (no forced cutoff).

## Traits

- **What to do about 31 inert traits** **[Hayden — looking into]** — `data/traits.ts` defines 41
  traits, 26 in the racing pool, and the simulation reads 10. The rest have descriptions, appear on
  cards, are dealt at birth and awarded by training, and change nothing. Three choices: implement
  the catalogue, cut it down to what is real, or stage them in over time. Two things make this more
  than a backlog item. **Wiring them later is retroactive** — bloodstock is full of horses carrying
  inert traits, some of them downside traits, which would switch on across animals the player has
  already bred and made decisions about. And **DESIGN.md §2 marks the whole system ✅**, including a
  trait *discovery* mechanic that also appears unbuilt for the player's own horse. Full detail and
  the worked example in ROADMAP.md Known Issues.

## The world, and the size of the tree

- **Rivals never ask to use your stallion** **[Hayden]** — "I haven't ever gotten a request to do
  that and I don't know how to do so." Confirmed: there is no such interaction. What exists is
  `studInfluence` in `ui/career.ts`, a silent prestige payment at retirement — **and it is gated on
  Hall of Fame horses only**, so a yard without one has been paid exactly nothing and had nothing
  to see. Two decisions in one: whether outside use becomes a thing the player is *asked about*
  rather than a background number, and whether the Hall of Fame gate is right. Note the book-limit
  item below assumes outside use exists as a real mechanic; today it barely does.
- **Limit outside use of your stud** **[Hayden]** — a book limit, so a stallion covers a set number
  of outside mares a season rather than being available without end.
- **Family tree scale** **[Hayden]** — storage is not the constraint: a horse is 657 bytes, so a
  thousand of them is 825 KB against a browser budget near 5 MB. Drawing five hundred portrait cards
  is. Direction: keep everything, render almost nothing — direct line in full, side branches folded.
- **Outside descendants should be counts, not horses** — record a number, and build a real horse only
  when one actually appears on a racecard against you. This is what stops the tree growing
  exponentially once rivals breed to your stallions for real.
- ✅ **The world never aged — fixed.** Rivals used to stay two to five forever, never replaced —
  found in play from a horse first raced at generation 3 turning up identical, stats and all,
  generations later. `sim/worldRacing.ts`'s new `ageWorld` gives every rival a birthday off its own
  start count and the same exponential decline (`AGE_EROSION_GROWTH`) the player's horse gets, and
  retires one into a new `Stable.worldArchive` at a randomised, per-horse age between
  `WORLD_RETIREMENT_MIN_AGE` (6) and `WORLD_RETIREMENT_MAX_AGE` (9) rather than deleting it or using
  one fixed age every rival shared — replaced in-place with a fresh horse in the same division, so the
  population never shrinks. The
  archive is permanent and read everywhere an ancestor id needs resolving (`pedigreeOf`,
  `allKnownHorses`) and everywhere outside studs are offered (`outsideStuds`), so a rival bred to
  stays traceable and breedable for as long as fertility allows, even after it stops racing.
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

- ~~**Starter selection maximum stats**~~ **[Hayden]** — **resolved.** Two parts: (1) potential moved
  from six independent per-stat rolls (measured at 82.8% of starters carrying an A-tier stat, 12.3%
  an X-tier one, from a single lucky outlier) to a shared pool split across the six stats, same mean,
  much rarer outliers. (2) stable prestige — previously fully inert for starters, despite §13 saying
  "a well-known yard is offered better yearlings" — now scales the pool's generosity across the
  legacy tiers (Novice 1.35 up to Legend 1.53), calibrated so even a maxed-out yard's starter
  averages 66.9, clear of the 68.0 an ordinary bred foal already reaches by its second generation.
  Traits stay flat regardless of prestige — a past fix found that scaling those handed a bred
  horse's opening hand to a starter with no bloodline behind it.
- **Multiple save slots (§13)** — a known gap since Phase 3. One slot plus export/import ships today.
- **The breeding manual (§13 codex)** — where relatedness, variance and the inheritance budget get
  explained properly, for players who want to understand the machine. Currently sitting in Phase 6.
- ~~**`createStable()` seeds from `Date.now()`**~~ — **fixed.** It broke a real deploy: 25 unseeded
  test calls across 8 files, and one of them — "always offers a poor yard something it can afford" —
  failed on an unlucky world and shipped a red build. `createStable(seed?)` now takes an optional
  seed, defaulting to `Date.now()` so real play is unaffected; every test call is pinned to a fixed
  string. Chasing that one failure turned up two real bugs sitting behind it, both fixed the same
  pass: `outsideStuds` picked candidates by division only, never by price, so a poor yard could be
  shown six studs it could not afford while a cheaper eligible horse sat unselected — measured at
  ~3.2% of random worlds, now guarantees the cheapest eligible partner is always in the list (down to
  ~0.4%, the residual being worlds where even the cheapest eligible horse is genuinely expensive — a
  stud-fee economics question, not a selection bug, and deliberately not chased further here). And
  `studFee` had no floor, so a low-quality outside horse could price at exactly $0 — a free outside
  stud, contradicting the module's own "your own horses are always free... never the escape hatch."
  Now floored at `MIN_OUTSIDE_FEE = 100`.
- **NEXT_PLAN.md is stale** — it describes screen-transition work from an earlier phase, and
  README.md still links it as "the active working roadmap for upcoming work".
