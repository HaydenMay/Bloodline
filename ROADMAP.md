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
sold foals. Step 3 landed for coat genetics — tap a hidden allele on a horse's card, trace every
carrier currently in the tree. Stat inheritance has no discrete gene to trace and is left for its own
mechanism if wanted. Step 4 (procedural naming) is still open. See AI_INSTRUCTIONS.md's Session Log
for the shape of what landed and NEXT_PLAN.md for the decisions it was built against.

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

## Phase 8 — The desktop pass
**Open-ended** · ⏳ *after the Archive; ordering against Phase 7 is open*

The mobile clean-up was needed and it worked, but it was done at desktop's expense and desktop is
now visibly the weaker of the two. Raised from play; the itemised list and the cause of each entry
live in [ongoing-decisions.md](ongoing-decisions.md) under "The two platforms".

The headline is that this is **a design decision before it is a CSS one**. Screen containers are
capped and centred at 400–600 px throughout `style.css`, so a monitor gets a phone column until the
race canvas takes over — and the fix is not "make the column wider", it is deciding what desktop
*does* with the space: two columns, a persistent sidebar, larger cards, or something else.

- **Decide the desktop layout**, then build it behind a breakpoint that leaves mobile untouched
- **Type scale** — sizes are absolute px chosen at phone distance (9 px labels, 12 px values) and
  never scale up
- **The info box** scrolls where there is room to show it whole
- **Audit for colour omissions** — the purse-on-race-calendar defect under Known Issues is one
  instance of a class, not a one-off

Phase 7's "UI polish — responsive sizing" bullet is this phase; it is listed there only as a
pointer.

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

**Status: the damage is capped, the pricing is still wrong.** The stake cap (Stage 2) turned out to
be the fix that mattered in practice — the exploit was betting $5,000 on an unbeatable Maiden horse
and collecting $35,000+ every time until promotion moved it on. Maiden now caps at $1,000 and scales
with class, and the economy plays much better for it. Everything below still describes the *cause*
accurately: the market is a multiplier off share-of-field, not a set of odds, so a horse winning
97–100% is still quoted at 15–25%. Worth fixing properly one day; no longer urgent.

Found in play — backing a dominant Maiden horse
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

### ⚠️ Pulling reportedly does nothing in play, but is powerful in the sim

**Found in play** — "Pulling does absolutely nothing. I don't slow down. I have been using it to
cheese the game: get ahead early and then hold that lead very simply."

**The simulation says the opposite, emphatically.** Measured over 150 races at 1400 m, with a probe
written for this (personas that lead early, then hold):

```
ride                 avg place   wins   win%   avg beaten   % of race in front
hands off              5.11      10    6.7%      10.0L            8.9%
lead, no pull          4.45      21   14.0%       7.9L           17.0%
lead then pull         6.81       0    0.0%      15.2L            9.1%
pull when leading      5.22       3    2.0%      10.3L            6.2%
pull all race          7.27       0    0.0%      19.4L            0.8%
```

Holding costs about **14 points of win rate**. `HOLD_DELTA` is -0.03 on a pace band of 0.92-1.00, so
a pull gives up roughly 3% of speed — a third of the entire band. It is not a no-op in `sim/`.

**So the disconnect is in the UI layer, and that is where to look.** Two candidates, neither
confirmed:

1. `race.setPlayer()` is only called at `ui/raceScreen.ts:299`, once, when the countdown ends, and
   only `if (!getAutopilot() && !playerInputRegistered && !autoRaceActive)`. A race begun on
   autopilot never binds the input object at all, and `playerInputRegistered` is not revisited if
   autopilot is switched off later.
2. The HUD's "TAKING A PULL" label at `ui/raceScreen.ts:708` reads the UI's own `input.takingBack`,
   **not** anything the engine reports back. So the screen will say the horse is taking a pull
   whether or not the simulation ever heard about it — which is exactly what "it does nothing" looks
   like from the player's seat.

Worth ruling out the innocent explanation too: a horse strong enough to win every race may simply be
able to afford the 3%, which would make this a symptom of the difficulty item rather than a bug.

### Traits are acquired past the limits TRAITS.md sets

**Found in play** — a 3-year-old carrying five traits: Professional, Firm Specialist, Turn of Foot,
Cruiser, Tractable. Four of the five are on TRAITS.md's own training table, so the mechanic is
working as designed. Two of its stated limits are simply not built:

- **"Early years only, so a two-year-old's schedule genuinely shapes what it becomes."** There is no
  age check anywhere in `ui/trainingScreen.ts` — a horse of any age keeps rolling for new traits.
- **No cap on the total.** `rollTraits` in `sim/horse.ts` is careful about this at birth: two traits
  base, a third on a roll, a fourth only for a well-bred horse, and the comment for starters reads
  "Never a 4th". Training then adds without limit, so a horse can and does exceed the ceiling
  breeding itself respects.

Rate, for reference: 5% a session, 15% after a breakthrough, and breakthrough chance is
`(morale/100) * (temper/100) * 0.5`. A horse living at 100 morale on 67 Temper rolls about 8.3% a
session, so roughly 1.5 acquired traits across an 18-start career — on top of what it was born with.

Also worth fixing while there: this path uses `Math.random()` rather than the project's seeded
`Rng`, so trait acquisition is not reproducible in a test.

### The race HUD's stamina indicator is unexplained

**Found in play** — "I don't understand the indicators on the kick meter. Most times three yellow
equals signs, then my horse pulls way back and I get a red equal sign and can no longer kick."

The read is correct and there is nothing on screen that says so. `ui/raceScreen.ts:633` draws
`"=".repeat(condTier)`, where the tier is the **in-race tank**: three above 66%, two above 33%, one
below, coloured good/fair/poor. It is the only view of stamina in the game — the comment three lines
above notes "the tank itself stays hidden — no stamina bar" — and it has no label, no legend, and no
mention anywhere in the UI.

The code comment immediately above it is also stale: it describes "1-3 arrows for low/normal/strong
regen", which is a different feature from what the code below it draws.

### Most traits are catalogued but never read by the simulation

**Found while reading a played horse's card**, and the broadest gap logged so far. `src/data/traits.ts`
defines **41 traits**, 26 of them in the racing pool the game actually hands out. The simulation
reads **10**:

```
allWeather  mudder  firmSpecialist  ironLungs  thirsty
cruiser     quickRecovery  alert   gateRusher  ironHorse
```

The other 31 have names, descriptions, categories, affinities and tags, appear on horse cards, are
handed out at birth by `rollTraits` and acquired through training — and change nothing. Nothing in
`sim/race/`, `sim/growth.ts`, `sim/injury.ts` or `data/legacy.ts` reads them.

Worked example, from the horse that surfaced it — a generation-3 stallion carrying five traits:

| Trait | Description shown to the player | Wired |
|---|---|---|
| Cruiser | Regens charges cheaply at moderate effort, badly at maximum | ✅ `engine.ts:284` |
| Firm Specialist | Thrives on firm; ordinary on soft | ✅ `engine.ts:269` |
| Turn of Foot | Kick is stronger but much shorter — punishes an early call | ❌ |
| Professional | Consistency climbs faster with race starts | ❌ |
| Tractable | Settles anywhere; much smaller out-of-position regen penalty | ❌ |

Three of five did nothing. Two of the three are in `trainingScreen.ts`'s acquisition pools, so the
game spent his career awarding him traits that do not exist — which is the trait-cap defect above
made considerably worse: it is not just handing out too many, it is handing out blanks.

**Wiring them later is not a neutral act.** Every horse in bloodstock right now carries traits that
do nothing, and some of them are *downside* traits — a foal bred today with Highly Strung pays
nothing for it. Implementing the catalogue would switch those on retroactively across every horse
the player has banked, changing animals they already made decisions about. Whatever gets decided,
that transition needs a plan: grandfather existing horses, re-roll them, or accept it and say so.

**A second gap in the same section.** DESIGN.md §2 also specifies trait *discovery* — one trait
visible when choosing a horse, the rest revealed through racing, facilities speeding it up, and
previously-encountered traits identified faster. Player horses show their full trait list
immediately, so that appears unbuilt too; the rival dossier is the part that does exist.

**And the count rule is explicit.** §2 says "Count: 2–4. Two is standard." The five-trait horse
above is not a grey area — it breaches a stated number, which is what the missing training cap
above allows.

**This is the same class as the two Phase 5 caught** (gendered inheritance and the Stud Farm's
breeding bonus, both marked ✅ and never built) and the Session Log's warning that it is "worth
assuming there are others" was correct at a scale nobody had counted. It wants a decision before it
wants code: implement the 31, cut the catalogue down to what is real, or stage them — but a horse
card that lists five traits and means two is lying to the player about the thing traits are for.

### ✅ Outside studs were priced on class alone, because rivals never recorded a win

**Found by driving the breeding screen** with a seeded world: every outside stud on offer showed
**0 wins** — 0 from 9, 0 from 4, 0 from 12, 0 from 14, 0 from 13.

An outside partner's contribution to the inheritance budget is
`seedLegacyFromRecord(horse.wins, 0, horse.division)` (`ui/studBook.ts`), so wins are half of what
decides a partner's worth. But a rival's win counter is only ever incremented at `main.ts:1501`, for
the winner of a race **the player was in**. Rivals racing among themselves record nothing, and since
a strong player wins most of their own races, the counter almost never fires for anyone else.

The effect: the wins half of the formula is dead, and an outside stud is worth exactly what its
division says. Two horses of the same class are interchangeable however different their careers were
— which also makes the stud fee a poor guide, since fees do read potential.

Related to "the world never ages" in ongoing-decisions.md, and probably wants fixing with it: a
world that neither ages nor accumulates form is a world where outside horses have no history to
read.

**Fixed.** Three inputs were broken and all three are now recorded:

- `generateHorse` gave a world horse `starts: rng.int(0, 14)` and `wins: 0`, so every rival arrived
  having run up to fourteen times and won nothing. It now rolls a plausible prior record from its
  division's strike rate, plus the prize money that record implies.
- `sim/worldRacing.ts` (new) races the rest of the world whenever the player races — within
  divisions, off `rateHorse` with upset noise rather than the full engine, recording starts, wins,
  placings, prize money, and feeding `updateAIDivisionProgression` so the world promotes and demotes
  on its own.
- `outsideStuds` passes the real earnings to `seedLegacyFromRecord` instead of a hard `0`.

Measured over a world of 70:

```
                    winners    avg record          legacy min/med/max   distinct
at creation          37/70    1.0 w / 6.5 st          0 /  76 / 582        29
after one career     67/70    3.6 w / 24.5 st         0 / 323 / 714        44
after four careers   70/70   11.4 w / 77.4 st        17 / 574 / 1050       57
```

Before: 0 winners ever, and every stud of a division worth the same figure.

**One thing to watch, and it belongs to "the world never ages".** World horses neither age nor
retire, so this accumulates without bound — 77 starts after four careers, and a top legacy of 1,050
against a Hall of Fame bar of 1,000. The inheritance budget's saturation absorbs most of it
(`GAIN_HALF_POINT` is 900, so doubling a budget from 733 to 1,566 moves one generation's gain from
about 5.4 points to 7.6, not double), which is why this ships as-is rather than with an arbitrary
cap bolted on. But the real fix is the world turning over, and this makes that item matter more than
it did.

### 🚧 Only two of the six stats decided a race — one structural half fixed, one open

**Found in play** — "only about 3 stats feel like they matter in races, and that's where all stats
should matter" — and then measured with `npm run stat-leverage`, which holds an eight-horse field
flat at 60, moves one stat of one horse, and reads the win rate. The swing column is what thirty
points of a stat actually buys:

```
stat            40      60      75      90     swing (90 − 40)
speed            0.0%   14.8%   56.5%   90.0%     +90.0 pts
stamina          0.0%   14.8%   92.5%  100.0%    +100.0 pts
burst            7.0%   14.8%   18.0%   24.3%     +17.3 pts
grit            11.8%   14.8%   16.0%   19.3%      +7.5 pts
consistency     14.5%   14.8%   15.8%   16.5%      +2.0 pts
temper          15.0%   14.8%   14.8%   14.2%      -0.8 pts
```

Speed and Stamina are not merely dominant, they are close to **binary**: at 40 the horse never wins,
at 90 it always does. Burst is worth a fifth of that, Grit a twelfth, and Consistency and Temper are
inside the noise — thirty points of Temper is worth *nothing at all*.

Holds across trips. Burst is correctly trip-sensitive (+28.0 at 1000 m, +17.3 at 1400 m, +11.6 at
2000 m) but never leaves the minor column; Temper measures 0 at every distance.

**Why, mechanically.** Both dominant stats feed the same term — `cruiseFor`, the speed a horse holds
for the whole race — while the others feed transient or protective ones:

| Stat | Where it acts | Duration |
|---|---|---|
| Stamina | `staminaGate`, a **15%** span on cruise, *plus* tank recovery | whole race, twice over |
| Speed | `SPEED_STAT_SPAN`, an **8%** span on cruise | whole race |
| Burst | `BURST_ACCEL_SPAN`, a 60% span on **acceleration** | until the horse reaches cruise |
| Grit | kick strength, cooldown, a 5% recovery nudge | moments |
| Consistency | suppresses fumbles, off-colour runs, green moments | only when they'd have happened |
| Temper | widens or narrows the daily-form roll | only if the roll matters |

The undocumented `staminaGate` — `0.85 + 0.15 * (stamina / 100)` — is the single largest balance
lever in the game and is nearly twice `SPEED_STAT_SPAN`, which is the one written down as the speed
knob.

**Correction to a previous entry here**, which claimed Burst was worth seven times Speed on the
strength of `BURST_ACCEL_SPAN` (0.6) against `SPEED_STAT_SPAN` (0.08). That comparison was invalid:
the spans apply to different things. A 60% span on acceleration is spent in the first seconds; an 8%
span on cruise is paid out over every second of the race. Measurement says Speed is worth **five
times** Burst, not one seventh of it. The visible symptom that prompted the wrong claim — a
Burst-98 horse clear of the field at 70 m without kicking — is real, and is Burst doing exactly its
job; it simply is not what wins the race.

**Confirmed in play, unambiguously.** A Stakes race won by Bright Thunder — straight B's, 68/64/66/
71/65/71 — beating a horse with **S in Burst (99) and Grit (96) and A in Temper and Consistency**.
Four grades better across four stats, beaten by the horse with more Speed. That is the table above,
in one race.

**Consistency and Temper cannot be fixed by reweighting.** Their entire job is to reduce variance,
and an engine this deterministic has almost no variance for them to reduce — a 13-point edge already
wins 97% of the time. Raising their weights would do nothing, because there is nothing for them to
protect against. They can only acquire value if race outcomes become genuinely uncertain, which
makes this and the margins item **the same piece of work**, approached from opposite ends.

**Two structural defects found and fixed, and they were the causes, not the symptoms.**

1. **Stamina secretly owned cruise.** `cruiseFor` multiplied by an undocumented
   `staminaGate = 0.85 + 0.15 * stamina/100` — a **15% span on the speed a horse holds for the
   entire race**, nearly double `SPEED_STAT_SPAN`, and nowhere in REBUILD.md §4.1, which defines
   cruise from Speed alone. It broke R1's "one owner each" and it was most of the problem. Removed;
   Stamina's owner is the tank. **Stamina went from +100 to +11.3 on one line.**
2. **Temper was worth less than nothing.** Measured at **−4.8**: the daily-form roll was symmetric
   and its downside was clamped by Consistency, so a wider swing was free upside and the stat whose
   job is *narrowing* the swing was a liability. Symmetric noise cannot reward the stat that removes
   it — the centre has to move. `TEMPER_MEAN_COST` now centres the roll below par, so a keen horse
   wastes itself and Temper pulls it back. **−4.8 to +10.5.**

Grit also gained a mechanism it never had: `GRIT_FATIGUE_RELIEF` lifts a horse's own fatigue floor,
so two horses that both empty do not both stop — §2's "what it has when it has nothing", which
previously had no implementation at all.

Where it stands, thirty points of each stat, against a baseline of `stamina +100 / speed +90 /
burst +17.3 / grit +7.5 / consistency +2.0 / temper −0.8`:

```
speed  +76.3    burst  +16.5    stamina  +11.3
temper +10.5    grit    +9.3    consistency +2.8
```

And each stat now owns a **situation**, which is what was asked for — Burst is worth +18.0 at 1000 m
and +8.8 at 2000 m, Stamina the mirror image. Gates held: harness 12/13 (only the pre-existing B1b
championship style balance still failing, exactly as before), ride-probe 4/4.

**What is still open, and why it is not a tuning problem.** Speed remains dominant at +76.3. It was
cut to +22 mid-session and every attempt to hold it there broke the **dominance curve** — a +40%
stat edge fell from 99.5% to 37.5% wins against a required 70% — and blew the margin tail past 20L.
That is not a coincidence, it is the structure:

> Speed is the only stat that feeds **cruise**, and cruise is the only term paid out over every
> second of the race. Every other stat acts through the energy economy (Stamina's recovery, Grit's
> fatigue floor, Burst's kick) or through noise (Temper, Consistency). So dominance and stat
> equality are currently the same dial, pulling opposite ways.

The consequence is that Stamina, Grit and Burst are all gated on **how often the tank actually
binds**. In a race where nobody empties, the three stats that live in the energy economy cannot
matter however they are weighted. Making them matter means making the energy economy bite — a pace
and drain change — not another pass over the spans. Consistency is a harder case again: its value
comes from suppressing bad days, and bad days are exactly what the dominance curve punishes, so it
was measured at +2.8 and could not be raised without failing B4.

**The tank-binding step was attempted and reverted. Here is what it found, so nobody repeats it.**

Measured first: the tank **never binds**. Across 1,200 runners at three trips, the average lowest
tank all race was **0.91** and only 3.7-4.1% of horses ever reached fatigue territory. A horse
finishes a race having spent nine percent of its energy. That is the whole reason Stamina, Grit and
Burst cannot matter — they all live in an economy that is never engaged.

The cause is arithmetic, not the riders. `TANK_RACE_COST` is 3.0 against `TANK_RECOVER_RATE` 2.4,
which reads as a deliberate net drain — but recovery is then multiplied by `staminaFactor` (~1.09 at
Stamina 60), rank shelter (~1.15) and the easy-lead bonus, while drain is multiplied by
`(pace / REFERENCE_PACE)^12`, which collapses below reference. Net over a race: recovery ~3.0 versus
drain ~2.6. **The tank fills up.** Lowering `HOLD_TRIGGER_TANK` from 0.8 to 0.45 barely moved it
(0.913 to 0.903), so the riders easing off was not the constraint either.

Tuned to bind — `TANK_RECOVER_RATE` 2.2, `TANK_RACE_COST` 3.1 — gives a real energy economy: 29% of
runners tire at 1000 m, 35% at 1400 m, 44% at 2000 m, correctly scaled by trip. Stat leverage
improved as predicted: Stamina 11.3 → 15.8, Grit 9.3 → 12.0, Speed 76.3 → 63.8.

**But it fails four gates**, down from 12/13 to 9/13, and the failure is instructive:

```
B1  style balance     frontRunner 21.9%   (was 13.0%)
B2  moment balance    early       20.5%   (was 12.2%)
B6  margin profile    8th at 28.5L        (want <= 20L)
```

Once energy is scarce, **`EASY_LEAD_RECOVER_BONUS = 0.9`** decides races: an unpressed leader
recovers ninety percent faster while the horse pressing it pays `PRESS_COST` on top of its own
drain. Harmless when the tank never binds; overwhelming when it does. Cutting it to 0.45 and 0.3
pulled front-runners back but never restored the gates, and the margin tail would not come in at all
— a field where the tired genuinely fall away strings out, which is physically right and fails B6 as
written.

**Conclusion: this is not a constants pass.** Making the tank bind changes the character of the race
and needs style, Moment, pace and the lead/press asymmetry retuned alongside it, against the harness,
as a dedicated piece of work. Reverted rather than shipped as a 9/13. The measurements above are the
starting point for whoever takes it.

**It also explains a player report** — "I don't understand why my tank ran out; I had more stamina
than the winner, we were both front-runners, he led early and never gave it up." That is
`EASY_LEAD_RECOVER_BONUS` and `PRESS_COST` working exactly as written, and entirely invisible: the
horse that gets the lead uncontested is rewarded twice while the one sitting second pays twice. The
mechanic may be right; a player having no way to see it is the actual problem.

### The race calendar rerolls its options when you back out of a race

**Found in play** — "go to race calendar, click a race, then click back, and it rerolls your race
options."

`generateRaceCalendar(seed, opts)` in `ui/raceCalendar.ts` is properly deterministic — it takes a
seed and builds its options from `createRng(seed)`. So the reroll is in what the caller passes:
`main.ts:1254` re-mounts the calendar on the way back and the seed it supplies is not stable across
that round trip. The offered races are meant to be a *choice*, and a choice you can reroll by
backing out is not one — it also quietly undoes the calendar's whole point, which is committing to a
race at a distance and a date.

Fix is to derive the seed from something that does not change while the choice is open — the career
and the number of starts run, say — rather than regenerating per mount.

### Horses are drawn outside the running surface, and the top of the screen is wasted

**Found in play, desktop** — "horses on desktop don't fit in the lane, mine always runs in the
grass, and there's a lot of screen real estate at the top that isn't being used."

Two sets of numbers that were never reconciled, in two different files:

- `render/track.ts:43` puts the horizon at `height * 0.44` and the running surface at
  `horizon + height * 0.09`, i.e. the dirt starts at **0.53 × height** and runs to the bottom.
- `ui/raceScreen.ts:427` puts lane 0 at **0.60 × height** with `0.055 × height` between lanes, so
  the eight lanes span **0.60 to 0.985 × height**.

So the horses occupy the bottom 40% of the frame while the drawn surface occupies the bottom 47%,
lane 7 sits within 1.5% of the bottom edge, and the whole top 44% is sky. Neither file knows the
other's constants. Confirming exactly which lanes land on grass wants driving the real screen at
desktop width rather than reasoning from the ratios — but the two layouts being independent is the
root, and any fix should make the track hand the lane geometry to the renderer instead of both
guessing.

Related, same screenshot: the sky occupies nearly half the frame at desktop width with nothing in
it. Phase 8's brief.

### The player seems to start in the same lane every race

**Found in play** — "my player always races at the top position, it should be somewhat random."

**The code already shuffles.** `engine.ts:419-421` builds `lanes` and calls `rng.shuffle(lanes)`
before handing them out, with a comment saying exactly why ("so player doesn't always start in lane
0"), and `rng.shuffle` is a correct Fisher-Yates. So either the player's lane genuinely varies and
what reads as "always the top" is the *drawing* — lane 0 being the rail and drawn furthest away,
plus the geometry mismatch above — or the entrant order and the shuffle interact in a way the
reading here missed.

Worth resolving with the two items above rather than separately, since all three are about where a
horse appears on screen. Log the player's actual lane across a few races first; if it varies, this
is a rendering issue and not a lane issue at all.

### Mobile: the training screen's growth bar runs off the edge

**Found in play** — "when training consistency the bar showing how much you train goes off the
screen and you can't see the animation." Consistency is the longest stat name, which is the likely
trigger — a row laid out to fit the shorter labels.

### Mobile: tapping for exact numbers on the training screen behaves erratically

**Found in play** — "it shows all of them, then you click again and one goes away, then it comes
back, then three go away. It's just weird."

Expected behaviour, per §3's grades-first rule: **tap anywhere in the box, all numbers appear; tap
again, all go away.** `ui/statDisplay.ts:153` already implements exactly that toggle-all for the
stat rows, so the training screen is likely either wiring its own per-row handlers alongside it or
mounting the rows more than once, giving two handlers that fight. Compare the training screen's
usage against the archive and dossier, which behave.

### The purse on the race calendar renders black on a dark panel

**Found in play** — "the text colour for the purse on the race calendar screen seems like it renders
black and blends with the background".

Confirmed, and the cause is one missing declaration. `.race-card` (`style.css:3208`) is a `<button>`,
and it sets `background`, `border` and `font-family` but **no `color`** — so it falls back to the
user agent's `color: buttontext`, which is black, and that does not inherit from the page's theme.
Its children mostly hide the problem: `.detail-label` sets `var(--muted)` and the going values set
`.going-firm` and friends, so those all render correctly. The purse uses a bare `.detail-value`,
which declares font-size and weight but no colour — so it is the one element on the card that shows
the button's black through.

Fix is `color: var(--text)` on `.race-card`. Worth checking the other `<button>`-based cards for the
same omission while there, since anything inside one without an explicit colour has the same bug
waiting.

### The race intro markers are not laid out responsively

**Found in play** — "the preview isn't the full width of the screen so it gets weird on the right
side, and on mobile the word wrapping happens weird."

`.race-intro-marker` in `src/style.css:742` is `position: fixed; left: 50%; transform:
translateX(-50%)` with **no width, no max-width and no padding**, at a hard `font-size: 56px` that
does not scale. So the text box is only as wide as its content and cannot wrap predictably at narrow
widths. The panel behind it is a separate problem in `.race-intro-canvas`, which is not sized to the
viewport.

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
| 8 · The desktop pass | open-ended | ⏳ Raised from play; ordering against 7 is open |
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
