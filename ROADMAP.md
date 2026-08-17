# Bloodline — Build Roadmap

Companion to [DESIGN.md](DESIGN.md) and [TRAITS.md](TRAITS.md).

See [HISTORY.md](HISTORY.md) for a detailed record of design iterations and lessons learned.

See [NEXT_PLAN.md](NEXT_PLAN.md) for the active working roadmap for upcoming work.

See [ongoing-decisions.md](ongoing-decisions.md) for the open judgement calls parked until Phase 5
lands — raised in play or turned up by measurement, deliberately not acted on yet.

---

## Phase 0 — Foundation ✅ COMPLETE
**~1 session** · live at https://haydenmay.github.io/Bloodline/

Delivered: Vite + TS scaffold, ESLint-enforced `sim/` isolation (verified against a deliberate violation), seeded deterministic RNG, versioned save schema with migrations and export/import, GitHub Actions deploy gated on lint + test + build, LICENSE and CREDITS. 16 tests passing, 0 vulnerabilities. Production build confirmed serving from `/Bloodline/`.

---

## Phase 1 — The race simulation, headless
**~2–3 sessions** · *the most important phase in the project*

✅ **COMPLETE** — Headless deterministic race simulation with balance harness.

---

## Phase 2 — One playable race
**~3–4 sessions** · **Milestone 1** · *all deliverables landed*

✅ **COMPLETE** — Playable race with horse rig, coat genetics, track, HUD, and input controls.

---

## Phase 3 — A full career
**~3–4 sessions** · ✅ **COMPLETE**

Delivered: Starter selection with six horses (pool scaling with stable prestige), training weeks with condition/form/breakthroughs and **potential ceilings**, the **age arc** — growth at 2–3, peak at 4, decline at 5 — **injuries** including the career-ending case, **rest weeks**, race calendar with 2–3 upcoming races, divisions with points-based promotion/demotion, ~70 AI horses across divisions, save/load, auto-race/skip, championship victory scene with podium, **player-called retirement** with the trainer hinting once decline sets in, career recap, and **retirement into bloodstock**.

**Deliverable:** one horse, start to retirement, 18–20 starts. ✅

> **Corrected after audit.** This section previously claimed condition, form,
> injuries and 18–20-start retirement as delivered while the summary table
> marked the phase in progress. Injuries and the form state had never been
> written, potentials were generated and read by nothing, age never advanced,
> and retirement was hardcoded to force at exactly 20 starts. Those are now
> built. Remaining known gap: **multiple save slots** (§13) — a single slot
> plus export/import ships today.

---

## Phase 4 — The stable
**~2–3 sessions**

✅ **Cash and Reputation as separate currencies** — both live on the stable, not the career
✅ **Seven facilities, five levels each** — with real effects, gated by stable prestige
✅ **Trainer and Jockey, levelling, capped by Reputation**
✅ **Consumables** — upkeep items and one-race race-day items
✅ **Retirement, Legacy scoring, Hall of Fame** — horse legacy banks into stable prestige on retirement
✅ **The permanent rival dossier** — head-to-head records surviving across careers
✅ **Wagering on your own horse** — win and place, priced off the field

**Deliverable:** careers connect. Run 2 opens stronger than run 1.

---

## Phase 4.5 — Re-balance and physics
**~2–3 sessions** · *a correction pass, not a feature*

All known defects and tuning passes listed in this phase are **documented in [HISTORY.md](HISTORY.md)** for reference.

✅ **Speed scale corrected**  
✅ **Energy floor fixed**  
✅ **Noise re-balanced**  
✅ **Harness re-verified**  
✅ **Animation synchronized**  

**Deliverable:** finishes you would believe. Photo finishes at the front, a beaten field that is beaten rather than distanced.

---

## Phase 5 — Breeding ✅ COMPLETE
**~3–4 sessions** · *the payoff*

Sliced into stages that each leave the game playable, because "the loop closes" is worth having
early and everything after it is texture on top.

### Stage 1 — The budget and the foal

- ✅ `sim/breeding.ts`: retired career → inheritance budget → distributed foal
- ✅ Floor from the parents, budget from achievement, variance from pairing diversity
- ✅ First-cross bonus, rolled once per pairing so rerolling cannot farm it
- ✅ The generational trace, `npm run bloodline` — see the follow-up below
- ✅ Pairing screen showing **projected potential ranges and nothing else** (§10)
- ✅ New careers start from a foal or from a yearling

**Deliverable: the loop closes.** ✅ Retire, breed, race the foal.

Retirement now ends at a crossroads rather than the main menu: breed from your bloodstock, buy a
yearling, or start a brand-new line. §13's rule that starter selection is reached *through* "start a
brand-new line" holds from the moment a yard has anything at stud — including from the main menu, so
quitting after a retirement cannot skip past your own bloodline.

Three pieces carry it:

| Piece | What it does |
|---|---|
| `ui/studBook.ts` | Who a yard can breed to, how often a pair has bred, and what a pairing projects. DOM-free; it lives in `ui/` only because `Stable` does |
| `ui/breedingScreen.ts` | The pairing screen. Reachable mid-career from the hub as a **browse** — you cannot breed a foal while a horse is in training, because there is only ever one career at a time |
| `ui/yearlingScreen.ts` | The sale ring, priced off prestige. A bought horse is generation 1 and inherits nothing |

**Outside studs come from the world, not from a fresh roll** — the constraint the trace turned up
below, honoured from the start. Partners are horses already racing in your world, gated by prestige
(§10's higher-calibre partners, which reputation used to unlock). They have records and shapes of
their own, and Stage 4's tree will be able to point at them.

Two bugs worth recording, both found by driving the real screens rather than by tests:

- **A mare picked first was recorded as the sire.** `breed` writes `sireId` from whichever partner it
  is handed first, and the screen lists your own horse first whatever its sex. Lineage is the one
  thing that cannot be corrected later, so `breedFoal` now settles sire and dam by gender.
- **Every projection read "D to S".** Drawing the full min-to-max of the sample made every pairing
  span the whole scale — true, and useless. The band now trims the tails, so a tight line and a wild
  outcross look as different as they are.

### ✅ Stage 1 follow-up — bloodlines converged toward bland

**Fixed.** Every line was flattening: the spread between a horse's best and worst potential halved
each generation (56 → 33 → 24 on the sharpest line traced), so generation six would have bred a flat
85 across all six stats. No specialists, no shape, every horse identical.

**Cause, confirmed by measurement.** Two terms, not one.

- **Regression to the mean.** Each foal was built at the mid-parent of every stat, and averaging two
  horses always narrows — a foal assembled that way is blander than both its parents by construction.
- **A variance term an order of magnitude too small.** `rng.normal(mean, spread)` takes a
  *half-range*, not a standard deviation: `MAX_SPREAD = 14` was an sd of **4**, against a natural
  starter spread of 30–56. The roll could not begin to counteract the averaging.

**Fix.** Two constants and one new term in `distributePotential`:

- **`PARENT_TILT`** — each stat now leans toward one parent or the other instead of landing at their
  midpoint, so a foal can take its sire's stamina and its dam's speed, and occasionally more of
  either than either parent had. This is what carries a family's character, and it needs no
  diversity coefficient of its own: it multiplies the *gap between the parents*, which is already
  small for two closely related horses. §10's inbreeding penalty now falls out of the pairing rather
  than being bolted on as a rule.
- **`MAX_SPREAD` 14 → 26**, with the half-range documented at the constant so it is not misread a
  third time.

Both offsets stay zero-sum, so the budget still buys exactly what it bought before — this changes
the shape of a foal, never its total.

### The bloodline trace — `npm run bloodline`

The measurement is now a committed tool rather than a one-off, because the arithmetic on this module
has been wrong twice and both times the unit tests passed. It campaigns a starter through real
races, banks real legacy, breeds it, and races the foal, for as many generations as asked. Three
partner regimes, because they fail differently and the module has to hold up in all three.

40 yards, 8 generations, 18 starts a career:

```
              spread gen 1 → gen 8    carry    roll     verdict
  rival        36.7 → 46.1  (+26%)     0.00     7.3     HOLDS
  outside      36.7 → 17.4  (-53%)     0.13     6.6     CONVERGES
  own          36.7 → 44.5  (+21%)     0.52     4.3     HOLDS
```

**spread** is the gap between a horse's best and worst potential. **carry** is how much of the
founder's shape a descendant still has, as a correlation against its generation-1 ancestor.
**roll** is how much the same pairing varies from foal to foal — §10's boom-or-bust.

Reading it: an ordinary outcross now grows *more* distinctive down the generations rather than less,
which is the direction the progression was supposed to run. A line bred back into itself keeps its
founder's character (carry 0.52 against 0.00) and pays for it with a roll barely half as wide —
which is exactly §10's trade, safe and dull against boom-or-bust, now visible in a number.

### ⚠️ What the trace found next — outside studs cannot be rolled fresh

**Do this first when Stage 2 starts.** The `outside` regime still converges, and it is not the
breeding maths. A stud rolled from `generateHorse` at the class a good line has reached comes out
shapeless:

| Division rolled at | Avg potential | Spread | Stats pinned at 100 |
|---|---|---|---|
| open | 78.6 | 28.8 | 2% |
| stakes | 88.2 | 24.1 | 22% |
| championship | 94.9 | 15.1 | **51%** |

`rollPotential` adds a flat +8–45 headroom whatever the horse already is, so at the top of the
ladder it simply clamps at 100. Breeding to that drags a line to a 93 average by generation eight
and flattens it there — the "line maxes out by generation four" bug returning through a different
door, and no variance term can survive being averaged with a partner that is 100/100/100/95/100/93.

**The decision this forces:** outside partners must be *bloodstock* — horses that were bred, raced
and retired in the world, which is what the `rival` regime traces and what Stage 3's rejected foals
are already meant to seed. Rolling a partner fresh from a division band is the thing not to do. If a
generated stud is ever needed as a fallback, `rollPotential` has to scale its headroom by the room
left rather than adding a flat band — which is a change to gen-1 starters too, so it is a deliberate
decision and not a quiet patch.

### Stage 2 — Partners, the cash sink, and stud influence

- ✅ **Stud fees priced on what you are buying** — the partner's banked legacy *and* its potential
  grades, so you pay for the foal you can actually expect rather than for a reputation
- ✅ Own horses free forever, Hall of Fame or not, and an enshrined parent still carries
  **+25% of its contribution** to the budget (§10's worked example: +50 on a ~200 base)
- ✅ Retired horses keep ageing into ineligibility
- ✅ **Partners are bloodstock, never a fresh roll** — a stud generated from a division band flattens
  any line that breeds to it, measured in the Stage 1 follow-up above
- ✅ **Stud influence pays prestige, never cash** — see below

#### What a stud costs

`data/studFee.ts`. Two terms, both things the foal actually inherits: banked legacy at $100 a point,
plus a **squared** premium on potential above 50. Squared because the scarcity is at the top — the
gap between a 90 and a 95 sire is worth far more than the gap between a 60 and a 65, and a linear
price makes the best horses in the world a rounding error on a good season. Measured against real
generated studs:

| Class | Avg potential | Banked | Median fee |
|---|---|---|---|
| Maiden | 53.4 | 0 | $300 |
| Novice | 68.5 | 60 | $14,400 |
| Open | 78.7 | 150 | $35,500 |
| Stakes | 90.2 | 300 | $70,700 |
| Championship | 97.7 | 525 | $110,500 |

**Deliberately steep**, because cash is the currency with the least to spend on and purses plus
wagering fill it faster than facilities drain it. It costs nothing to breed inside your own yard, so
a steep fee prices the escape hatch without ever taxing the intended path (§1).

The one thing this must not do is close the escape hatch when it is needed. The stud list therefore
offers **two horses per class** rather than the best six a yard can reach — otherwise a yard whose
own line has just dead-ended would be shown nothing but studs it cannot afford, at exactly the
moment outside partners exist to help.

#### The fee that was already there: wagering

Raised while pricing this. `getStakeOptions` offered up to **$10,000 in every division**, including a
Maiden race with a $5,000 purse — so backing your own horse paid multiples of winning, in the
division where the fields are weakest and your own horse is easiest to read. Stakes are now capped at
**25% of the race's purse**: $1,250 in a Maiden, the full $10,000 in a Championship. A bet should be
proportional to the race it rides on.

#### Breeding lifespan: 4 full foals per horse

A horse races ages 2→5, so **each career advances the world about four years**. A stallion retired
at 5 therefore breeds at 5, 9, 13, 17 and 21.

| Rule | Value |
|---|---|
| Full contribution | to age 17 |
| Tapering | 18–21 |
| Ineligible | 22 |

That yields **four foals at full strength plus a fading fifth**, which is the intended "3–5 fully
raced foals per horse". The taper matters more than the cutoff: a sire visibly running out of years
is a warning a player can act on, where a hard stop just removes a favourite between careers.

Two consequences worth stating, both intended:

- **The self-sufficient line converges toward dull.** Breeding a stud back to its own foal is
  inbreeding, and §10 narrows variance each time a line doubles back. A player who never buys an
  outside partner gets progressively safer, duller foals — the pressure back toward outcrossing is
  the system working, not a gap.
- **Gender is a coin flip.** A stallion needs its foal to be a mare to continue the line without
  help. Half the time it will not be, which is a second reason outside partners must always be
  available.

#### Stud influence pays prestige, not cash

Rival yards breeding to your Hall of Fame stallions earn you **prestige**, and no money at all.

Two income faucets against a fixed set of sinks inflates the economy, and cash is already the one
currency that runs out of things to buy. But what a yard genuinely earns when its bloodline spreads
through the league is *influence* — which is exactly what prestige measures. It shows up twice: on
the family tree, as descendants racing against you, and on the ladder.

It also answers the late-game flatness directly. Prestige from stud influence keeps accruing after
the yard is fully built, and it scales with how good the bloodline is rather than how many races
have been ground out.

**Rejected:** splitting legacy into separate racing and breeding scores gating different unlocks.
This session removed reputation for being a second counter nobody could distinguish from prestige;
two legacy tracks would rebuild that problem with new names. One prestige score, two sources.

### Stage 3 — Genetics texture
- Coat genetics with real dominant/recessive inheritance
- Traits and distance aptitude inheriting separately, with their own mutation chance
- Grandparents, linebreeding, and gradual inbreeding narrowing
- Rejected foals sold, and released into the world as rivals

### Stage 4 — Foal development

- ✅ The EV-style allocation pass

**A year in the paddock**, between keeping a foal and racing it: a pool of points spent on what it
starts with, where it wants to run, or coaxing out a trait its parents carried and it did not show.
§10's one place where player agency enters an otherwise random inheritance — and **skippable**, with
the skip a first-class button rather than something hidden, because §10 wants anyone who came to race
to be able to race.

**Points never raise a ceiling.** Everything here moves the foal's *starting* figures, its trip and
its traits. Potential belongs to the inheritance budget, and a development phase that could inflate
it would be a second and much easier budget that made the first one pointless. Every stepper stops at
the ceiling the foal was born with.

| Buy | Cost |
|---|---|
| +1 on a starting stat, up to +8 on any one | 1 point |
| Move the whole preferred trip 25 m | 1 point |
| Coax out a latent trait | 10 points |

**The pool answers the open question by making an old promise real.** 24 points as standard, scaled
by the **Stud Farm** — the facility that has advertised "+10% breeding potential" since Phase 4 with
`getBreedingBonus` written, banked and read by nothing. A level-3 farm gives 31 points, a level-5
farm 36. Tying it to the yard rather than to the foal's own quality was deliberate: scaling it by the
budget would have handed the best-bred foals the most agency as well, which is the opposite of what
this phase is for.

Latent traits are only ever what the parents carried and the foal missed. A foal cannot be coaxed
into something no ancestor had — that is what mutation is for, and mutation happens at birth, free.

**Phase 5 is complete.**

### Decisions taken before building

| Question | Decision | Why |
|---|---|---|
| What the budget converts from | **Banked legacy + the parents' finishing potentials** | §10 also listed wins, divisions and titles, but legacy already weights those by division — counting both would score a Championship win two or three times. One economy, one spine |
| Stallion/mare dead end | **Outside studs in Stage 1, free for now** | Bloodstock is only what you retired, so two colts in a row would otherwise leave a player unable to breed at all. Charging for them is Stage 2's job |
| Pedigree depth | **Parents only in Stage 1** | Grandparents arrive with Stage 3. A gen-2 foal has no grandparents in the yard yet, so nothing is lost by waiting |
| The new-horse screen | **Breed or buy, with buying explicitly weaker** | Breeding is the intended path (§1); a yearling gets stable-scaled stats and inherits nothing. The escape hatch stays open when a line goes bad |

§10 says reputation unlocks higher-calibre outside partners. Reputation no longer exists — prestige
gates them.

### What Stage 1 must record even though it does not use it

The one category of mistake that forces real rework. Stages 3 and 4 read history, and history
cannot be reconstructed after the fact — a pedigree tree built in Stage 4 can only show ancestry
that Stage 1 wrote down at the time. All of this ships in Stage 1, unused:

| Field | Needed by | Why it cannot wait |
|---|---|---|
| `sireId` / `damId` on every horse | Stage 3, Stage 4 | The tree and linebreeding are *only* these links. A foal born without them is permanently rootless |
| `generation` number | Stage 1 balance work | The gen-3/gen-5 banking measurement is impossible without it |
| Pairing key + times bred | Stage 1 | The first-cross bonus tapers per repeat, so the count must persist across careers |
| Coat **genotype**, not just the coat name | Stage 3 | Real dominant/recessive inheritance needs the hidden allele. A recessive that "hides for three generations" (§10) must have been stored for three generations |
| Stable-wide horse archive | Stage 4 | Bloodstock holds horses you retired. The tree also needs foals you rejected and sold |

Rejected foals (Stage 3) are sold and released as rivals, so they need their ancestry recorded at
birth too, even though nothing reads it until Stage 3.

### Open questions, by stage

Not decided yet. Listed so they are answered deliberately at the time rather than defaulted into.

**Stage 2** — ✅ Answered. Stud influence pays **per career, at 8% of what the horse banked**, scaled
by the age taper so it fades and then stops. A horse that banked 1,000 pays 80 a career and about
320 across its stud life — enough to matter against walls at 400 and 1,500, not enough to become the
fastest route up them, and it ends rather than accruing forever. Per career rather than per pairing
because a career *is* the unit the world moves in: four years, one horse, one advance of the clock.
Simulating individual rival pairings needs rival breeding, which is Stage 3's job.

**Stage 3** — Which coat loci ship (base black/bay/chestnut plus how many modifiers)? What mutation
chance applies to traits and aptitude? How fast does relatedness narrow variance — §10 wants a
favourite line viable for "many generations", which needs a number. What does a rejected foal sell
for, and how long before it turns up on a racecard?

**The Archive (now Phase 6)** — ✅ Partly answered, and the question was pointing at the wrong thing.

**Storage is not the wall.** A horse record is 657 bytes and a bloodstock entry 845, so fifty horses
is 41 KB, a thousand is 825 KB, and five thousand is 4 MB against a browser budget near 5. The tree
could hold a thousand horses without noticing.

**Nor is the yard growing.** Bloodstock grows by exactly one horse per career, and stud influence —
the thing that sounds like it should breed hundreds of descendants — creates **no horses at all**. It
pays prestige and nothing else, deliberately (Stage 2). Fifty careers is fifty horses.

**The growth risk is real but it arrives with two specific features**, neither built:

- **Rejected foals sold into the world** (Stage 3's remaining bullet). One per rejection, bounded by
  how often a player rerolls.
- **Rival yards breeding to your stallions for real**, if stud influence ever stops being abstract.
  This is the dangerous one: it compounds, because those foals breed too.

**The levers, for when either lands:**

| Lever | Does |
|---|---|
| **Promote on appearance** | Record an outside descendant as a *count* only, and create a real horse the first time it actually turns up on a racecard against you. §10's promised payoff — "pass on a colt and watch him win a Championship in three years" — needs a handful of real horses, not a population |
| **A book limit** | Real stallions cover a book a season. Cap outside foals per stallion per career, so growth stays linear rather than compounding |
| **Collapse by default** | Render your direct line in full and fold side branches behind a click. This is a rendering decision, and rendering is the actual ceiling — five hundred portrait cards with connecting lines is a browser problem long before storage is |

The original question — "does the tree render every horse, or collapse rejected foals until asked?" —
now has an answer: **keep everything, render almost nothing by default.** Storage is cheap and the
archive is the point of the game; drawing is what needs the discipline.

**Foal development** — ✅ Answered. The pool is 24 points, scaled by the Stud Farm rather than by the
foal's own quality, so a yard that invested in raising foals raises them better without handing the
best-bred foals the most agency too. Points buy starting stats (capped at the ceiling the foal was
born with), 25 m steps of preferred trip, and latent traits at 10 apiece — the three buys §10 names,
and none of them touches potential.

### ✅ Measured once Stage 1 landed

What a gen-3 and gen-5 horse actually banks, from `npm run bloodline` (40 yards, 18-start careers,
ordinary outcrossing):

| Generation | Avg potential | Banked | Peak legacy | Reached the Hall of Fame |
|---|---|---|---|---|
| 1 | 61.5 | 392 | 352 | 0% |
| 3 | 68.4 | 435 | 377 | 0% |
| 5 | 74.2 | 475 | 411 | 0% |
| 8 | 80.8 | 578 | 495 | 0% |

**The Hall of Fame at 1,000 is not reachable by breeding alone**, and that is the open number this
was waiting on. A horse climbing from Maiden spends most of a career in divisions that pay little —
legacy is exponential in division, so the ladder itself is the ceiling, not the horse. Even a
generation-eight animal averaging 81 potential peaks near 495. The bar is doing its job of sitting
above gen-1 reach (§8), but nothing currently gets a horse over it, which matters because
`HALL_OF_FAME_BONUS` is the payoff that makes enshrinement the best thing a career can produce (§1).

Where the slack probably is, in the order worth trying: a foal debuting above Maiden so its career
is spent in divisions that pay, and the promotion race, which the trace does not run. **Do not move
the 1,000 bar until those two are tested** — lowering the bar to meet an unfinished career shape
would be tuning against a measurement we know is short.

Caveats on the numbers above: the trace trains every stat evenly rather than to a plan, does not
pick its races, and skips promotion races (it applies the same points ladder without the gate).
All three make it a floor rather than a forecast. Prestige walls (Novice 0 / Professional 400 /
Elite 1,500 / Champion 3,500 / Legend 7,500) are untouched pending the same work.

---

## Phase 6 — The Archive
**Open-ended** · 🚧 **IN PROGRESS** · *the title of the game*

Step 1 (the tree, drawn) and a lightweight Step 2 (the detail card) are on `main`, DOM-rendered,
rooted on the living horse looking up, direct line only by default with settings for siblings and
sold foals. Step 3 (the trait/gene inheritance map) and Step 4 (procedural naming) are still open.
See AI_INSTRUCTIONS.md's Session Log for the shape of what landed and NEXT_PLAN.md for the five
decisions it was built against.

Broken out of Phase 5 into a phase of its own, because it is not texture on top of breeding — it is
the thing breeding exists to produce, and the mechanic the game is named after. It deserves a full
session with the context to do it properly rather than the tail of one.

- **CK3-style pedigree tree.** A first-class screen, not a submenu: portrait cards on generational
  rows, connecting lines, click any ancestor for a detail card with stats, traits and record
- **A trait and gene inheritance map** — where a line's speed came from, which ancestor carried the
  chestnut that surfaced four generations later
- **Procedural naming**, with the dedupe and quality safeguards
- Records every horse bred or raced back to the first starter, plus the foals sold into the world

**What is already in place for it.** Every foal since Stage 1 has recorded `sireId`, `damId` and
`generation`; Stage 3 added the coat genotype, so the gene map has real alleles to draw. `pedigreeOf`
indexes bloodstock and world together, and a foal sold into the world keeps its whole ancestry, so
the tree can reach every horse a line ever produced. None of that can be reconstructed after the
fact, which is why it was written down from the first foal.

**The scale answer, measured.** Storage is not the constraint — a horse is 657 bytes, so a thousand
of them is 825 KB against a browser budget near 5 MB. Drawing five hundred portrait cards is.
Direction: **keep everything, render almost nothing by default** — the direct line in full, side
branches folded until asked for. See [ongoing-decisions.md](ongoing-decisions.md) for the growth
levers if rivals ever breed to your stallions for real.

---

## Phase 7 — Polish
**~3+ sessions, open-ended**

- Full race-day soundscape and stable ambience
- Five tracks, weather, going, crowd density scaling
- Accessibility pass — colourblind palettes, reduced motion, text scaling, speed controls
- PWA, offline, mobile performance tuning
- UI polish — responsive sizing, screen transitions, visual refinements
- Codex: racing manual and breeding manual
- Opening sequence
- Difficulty tiers verified through the harness

---

## Known issues

### ⚠️ The betting market is a money printer

**Deferred until Phase 5 lands, then fixed.** Found in play — backing a dominant Maiden horse
returned several times the stake, every time — and confirmed by `npm run odds`, 400 races a row:

```
                                    implied   actual    odds    EV on $1,000
maiden   player 45 vs rivals 26        20%     100%     4.38x      +$3,371
maiden   player 60 vs rivals 26        25%     100%     3.49x      +$2,494
open     player 65 vs rivals 52        16%      97%     5.68x      +$4,520
champ    player 95 vs rivals 81        15%      99%     5.96x      +$4,870
```

A horse that wins **every race** is priced at 3.5x, paying +250% a bet with no risk at all.

**Cause — structural, not a bad constant.** `winProbability` prices a horse on its *share* of the
field's total rating. In an eight-horse field an equal horse is 12.5%, and implying 50% would take a
rating equal to all seven rivals combined, so an implied chance much above 30% is unreachable however
dominant the horse is. The engine meanwhile is steeply non-linear: a 19-point stat edge wins 100% of
the time. **Linear share against a steep reality.**

**Fix.** Price off the rating *difference* between the horse and its field, through a curve fitted to
the win rates `npm run odds` measures, rather than off share of the total. `rateHorse` is the right
input and already exists — it is shared with race-day field selection so the difficulty rating and
the market price the same number — but it currently ignores distance aptitude, running style, traits
and jockey skill, all of which the engine weighs heavily. A horse well suited to the trip is
therefore underpriced twice over.

**Partly mitigated already:** stakes are capped at 25% of the purse (Stage 2), which limits the size
of each pull without touching the fact that the machine always pays.

**Second finding, to look at with it:** a 13-point stat edge winning 97% of races is very absolute.
That may be the engine being more deterministic than intended, and it is likely related to the
margins issue below. The odds curve should be fixed either way, but if the determinism is itself
wrong, both want looking at together.

### Retiring a horse early buys stud years

The world clock advances `YEARS_PER_CAREER` (4) every time a horse retires, whatever its career was.
That is the anti-reroll brake §10 asks for — "rerolling burns your best sire's remaining years, so the
reroll grind eats the thing it depends on" — and it works: a foal dumped after one season costs a
sire exactly the same four years as a full campaign, so a stallion is worth about five foals however
they are spent.

The seam is on the other side. A horse *joins* the stud at whatever age it retired, so retiring at
three rather than five leaves it more years:

| Retired at | Stud life |
|---|---|
| 3 | 4.6 foals' worth |
| 4 | 4.4 |
| 5 | 4.2 |

About half a foal, and self-limiting today because retiring early guts the banked legacy that sets
every future foal's quality — you would trade a fraction of a foal for a worse foal every time. Worth
watching rather than fixing: if the economy ever makes early retirement cheap, this becomes a real
strategy. The fiction is also loose in the same place, since a two-race career jumps the calendar
four years. Any fix has to keep the anti-reroll brake, which is the harder half.

### Winning margins are too wide

**Currently ~3.7L between first and second**, down from 4.1L. Real racing is decided by 1–3, and 5+ is a rout. The tail is the bigger problem (60L instead of 74.7L, but still wide).

**What's left:** Another iteration of the same loop — cut noise further, re-verify style balance, re-check the tail — not a new mechanism.

### Position costs more than it returns

✅ **Fixed in Phase 4.5** (the establish double-charge, the misfit energy relief, and the softened AI reserve clause). Kept as a reference record for how the fix was diagnosed.

---

## Summary

| Phase | Sessions | Status |
|---|---|---|
| 0 · Foundation | ~1 | ✅ Complete |
| 1 · Race sim + harness | ~2–3 | ✅ Complete |
| 2 · Playable race | ~3–4 | ✅ Complete |
| 3 · Full career | ~3–4 | ✅ Complete |
| 4 · The stable | ~2–3 | ✅ Complete |
| 4.5 · Re-balance & physics | ~2–3 | ✅ Complete |
| 5 · Breeding | ~3–4 | ✅ Complete — budget and foal, partners and fees, genetics texture, foal development |
| 6 · The Archive | open-ended | 🚀 **NEXT** — the pedigree tree, broken out of Phase 5 to get a session of its own |
| 7 · Polish | ~3+ | ⏳ After the Archive |
| **Total estimate** | **~22–28** | |

---

## If we need to cut

In order of what goes first:

1. Five tracks → one track with varied conditions
2. Wagering
3. Consumables
4. Foal development phase → automatic allocation
5. Difficulty tiers → ship Standard only

**Never cut:** the balance harness, the energy economy, the pedigree archive. Those are the spine.
