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
- **The race screen itself, not just the screens around it** — "the race canvas fills, so the feeling
  stops there" turned out to be incomplete: filling the viewport isn't the same as using it well.
  Driving a full race at 1440×900 found the field spread wastes most of the canvas once the leader
  clears the pack (empty track, no content) and, separately but in the same investigation, that a
  bunched field at the start renders as one illegible overlapping blob regardless of screen size. Full
  detail under Known Issues, the "Race screen:" entries.

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

### The press/easy-lead constants had drifted from REBUILD.md §20's own documented numbers

**Found while answering a player question** — "front runners are busted: they race up front, press
other racers, and lose less stamina for being in first. Wasn't the front-runner bonus supposed to
apply to the top three?"

The player was remembering something real, but about the wrong side of the mechanic. `PRESS_RANK_LIMIT`
— which horses pay extra tank for crowding the leader — **is** documented as top-3 in REBUILD.md §20.
`EASY_LEAD_RECOVER_BONUS` — the reward for a clear, unpressed lead — was always rank-1-only by design,
in both the spec and the code; that part never changed.

What had changed is that the code no longer matched the numbers §20 itself records, with the reasoning
for each written down at the time they were measured:

| Constant | REBUILD.md §20 | Code (before this fix) | Drift |
|---|---|---|---|
| `PRESS_RANGE_METRES` | 5 | 7.5 | +50% |
| `PRESS_COST` | 0.17 | 0.26 | +53% |
| `PRESS_RANK_LIMIT` | 3 | 2 | narrowed — rank 3 stopped paying press at all |
| `EASY_LEAD_RECOVER_BONUS` | 0.44 | 0.9 | +105%, more than doubled |

Every drift pointed the same direction: **living in an uncontested lead got cheaper, and contesting
it got both narrower and more expensive.** That is exactly "front-runners are busted," and it explains
the specific race that prompted the question — a player running second against an unpressed leader was
paying a widened, pricier press cost against a leader collecting more than double the recovery §20
measured for that situation.

**Fixed by reverting all four to the documented values.** Not a retune — the spec already carried the
reasoning and the measurement for the original numbers, so this restores a decision rather than making
a new one. Gates: 12/13, same pass rate as before, with a materially healthier B1 (worst archetype
moved from frontRunner 13.0% to midPack 10.1%, and the frontRunner/stalker/closer spread tightened).
`npm run stat-leverage` unaffected — Speed still dominant as logged above, everything else intact.

No `git log -S` history exists for either constant, so there is no record of when or why the drift
happened — worth treating any hand-tuned constant as suspect and checking it against REBUILD.md before
trusting it, since this is now the second time a documented value and the shipped value disagreed
silently.

### A front-runner's effort-cost relief was issued at the gate, not earned by racing up front

**Found in play**, following directly from the constant-drift fix above — "front runners currently
have the ability and desire to race in first place, press other racers, and have less stamina drain
from being in first... the front-runner bonus should only apply in the first couple of spots, racing
the way they're supposed to."

Bigger than the drift. `tankModsFor` computed `exponentRelief` **once, at the gate, before the race
starts** — and `if (horse.style === 'frontRunner') exponentRelief += FRONT_RUNNER_EXPONENT_RELIEF`
(11 out of `DRAIN_EXPONENT`'s 12) applied to *any* horse with that style, unconditionally, for the
whole race. A front-runner buried in eighth got the same near-total relief from the superlinear drain
curve as one leading by ten lengths. Not documented in REBUILD.md at all, and no `git log -S` history
for when it was added.

**Fixed by moving it from a style property to an earned, per-tick state**, the same pattern
`easyLead` and `press` already use: computed every tick in `updatePack`, gated on `r.rank <=
FRONT_RUNNER_RANK_LIMIT` (2 — "the first couple of spots," taken directly from how the player
described it) and `r.press <= FRONT_RUNNER_PRESS_TOLERANCE` (1 rival's worth of company, not zero —
see below for why zero was tried first and reverted).

**One new rule needed, found by testing rather than guessed.** Gating on rank alone recovered B1 and
B6 but left B3 ("a contested lead wrecks front-runners") failing by a hair — 1.39 against a required
1.4 ratio, and completely insensitive to the relief's magnitude (9, 10 and 11 all produced the
identical measured rate, so that lever was not the cause). Gating additionally on `press === 0` —
relief only while genuinely uncontested — fixed B3 outright but broke B6's margin tail, because any
company at all, even a single trailing rival, now cost a front-runner its entire relief in one step.
`FRONT_RUNNER_PRESS_TOLERANCE = 1` splits the difference: a *little* company is still "running up
front," a real duel is not. That is what got the full suite back to 12/13.

Verified: harness 12/13 (only the pre-existing B1b), `npm run stat-leverage` and `npm run ride-probe`
both unaffected, 507 tests.

**Still open, from the same message.** The player described what each of the four styles is
supposed to feel like, and only front-runner had an existing mechanic to correct — the others need
new ones, not yet built:

- **Stalker** — bonuses for drafting, so it can slingshot late. Drafting exists (`DRAFT_RECOVER_BONUS`)
  but is purely positional, identical for every style; a stalker gets nothing a front-runner tucked
  in behind another horse would not also get.
- **Closer** — a large, genuine bonus right at the end to close a real gap. What exists today is
  `CONTACT` (§6.6), which is deliberately universal and capped at what a leader could also reach
  (R4) — it keeps a patient horse in the race, it does not let a closer overturn a placing it
  otherwise would not have earned. There is no closer-specific late mechanic.
- **Mid-pack** — the generalist, meant to win on trained stats rather than a positional bonus. No
  such training or potential effect exists anywhere in `growth.ts`, `trainingScreen.ts` or
  `facilities.ts` — this is a different kind of gap than the other three, since it is not a race
  mechanic at all, and the two ways to build it (a training-gain multiplier, or a potential
  advantage in the Stud Farm's style) are genuinely different systems with no obvious default.

### Stalker, closer and mid-pack now have the identities the front-runner fix implied they needed

**Direct follow-up to the front-runner fix above**, from the same message: "stalker should be
getting bonuses from drafting to slingshot near the end... closer is supposed to get large bonuses
right at the end to slingshot and catch back up... mid-pack are the generalists that should
eventually get bonuses on training and/or potentials, winning via stats and not bonuses."

**Stalker — a real draft edge, not just the generic positional one.** Drafting itself (`r.drafting`)
was already earned live, every tick, purely by position — tucked in behind a rival, in a
neighbouring lane. That gate was already correct, so the fix is narrower than front-runner's: give
a stalker MORE out of the same, already-earned draft than any other style gets.
`STALKER_DRAFT_MULT` (1.3) multiplies `draftMult` in the same static per-horse setup `tankModsFor`
already builds — safe to set once, unlike the front-runner relief, because it can never fire before
`r.drafting`'s live positional check already has.

**Closer — real punch on the kick that is actually catching up.** Nothing closer-specific existed;
`CONTACT` (§6.6) is deliberately universal and capped at what a leader could also reach (R4), so it
keeps a patient horse in the race without ever letting it steal a placing back. Added
`CLOSER_BEHIND_KICK_BONUS` (0.09) to `kickStrengthFor`, gated on `r.rank > 1` at the moment the kick
fires — "after losing their spot and falling behind," in the words that asked for it. R2 still
governs: this only makes the shared kick ceiling easier to reach, the downstream
`Math.min(KICK_MAX_BONUS, ...)` clamp is untouched.

**Mid-pack — found something worse than expected, twice, before landing on what actually works.**

First: `kickWindowBonus` in `race/charges.ts` had an **undocumented special case for `midPack`
already** — a flat +33% baseline kick bonus with no diminishing returns outside its window,
predating this session. That directly contradicts "wins via stats, not bonuses," so it came out.

Second, and this is the one worth remembering: the first fix for mid-pack was a training-gain
multiplier (`MIDPACK_TRAINING_BONUS`, in `sim/growth.ts`) — bigger gains per session, same ceiling as
every other style. **Measured, not assumed, and it failed:** simulating real training against
`applyTrainedStat`'s own diminishing-returns curve, an ordinary horse closes to within 3 points of a
70 potential by week 40 and sits dead on it by week 80 — well inside a single ~18-20 start career.
A training-SPEED bonus is worth something for the first third of a career and **nothing at all**
for the rest, once every style has converged on whatever ceiling it happened to roll. Caught by the
player, not the harness, before it shipped: "if they don't have higher potentials, they just look
like every other horse without in-race bonuses, right?" — which is exactly what the measurement
then confirmed.

The fix that survives is `MIDPACK_GENEROSITY` (1.12) in `sim/horse.ts` — a higher ceiling, not a
faster climb to a shared one. It stacks with a starter's own bonus rather than replacing it. The
training multiplier stays; it is real value early and does no harm once potential is what actually
differs.

**What the harness cannot see, and why 11/13 is being shipped rather than chased further.** Every
one of the three new bonuses above is *situational* — earned in some races, not others — except
mid-pack's, which is now entirely a training/breeding-time effect. `npm run harness` generates fresh,
untrained horses and races them once. It will never see mid-pack's actual edge, because that edge
does not exist until a player has trained the horse. So B1 fails with mid-pack as the worst
archetype (8.7%, against an 8.75% floor — inside a rounding error of passing) not because mid-pack
is imbalanced, but because the check's own model — an untrained horse, raced once — cannot represent
what mid-pack is now for. B1b, unrelated, has failed since before this session began.

Tried and rejected before settling here: trimming `STALKER_DRAFT_MULT` and `CLOSER_BEHIND_KICK_BONUS`
in combination across several values (documented by the numbers, not guessed) — mid-pack's share
never moved outside 8.5-8.9% regardless, confirming the shortfall is not the other three styles
taking its share, it is mid-pack having nothing left for a single-race measurement to find.

Verified: `npm run stat-leverage` and `npm run ride-probe` both clean, 507 tests, harness 11/13 with
B1 and the pre-existing B1b as the only failures and the reason for each on record.

### Coat and mane variety — only 8 total looks existed, now fixed for mane

**Found in play**, from two screenshots of packed race fields where most of the pack read as the
same few horses. Confirmed rather than assumed: `COAT_IDS` has exactly 8 named coats, picked
uniformly per horse (`sim/horse.ts`: `coat: rng.pick(COAT_IDS)`), and generation and rendering were
both individually correct — every horse really does get its own independent roll, and the race
screen really does look each runner's coat up by its own id. The repetition was pure combinatorics:
eight uniform draws across an eight-horse field collide almost every time. Measured directly:

```
99.9% of 2,000 simulated 8-horse fields had at least one EXACT coat repeat
```

Made worse by a second, separate fact: `COATS` (`data/colors.ts`) locked every named coat to exactly
one fixed mane colour. Every "bay" horse in the game — player, starter, any of hundreds of rivals —
rendered with the pixel-identical mane, forever. Even fields with no exact coat repeat still read as
uniform, since five of the eight coats (bay, dark bay, chestnut, buckskin, palomino) are all warm
brown/tan tones with no shade variation to tell them apart.

**The fix already existed, unused.** `ui/silksDemo.ts` — a developer-only tool behind the hidden
`?silks-demo` URL parameter, never linked from any menu — had a real 6-swatch mane ramp per coat
(`hairFor`, built for hand-previewing colour combinations) that nothing in real horse generation
ever called. Moved to `render/palette.ts` as `hairRampFor` (shared, single source of truth; the demo
tool now delegates to it instead of keeping its own copy), and wired into `coatForHorse` via a new
`hairForHorse`: normally a colour from the horse's own coat ramp, chosen deterministically from its
id (same `hashId` trick already used for silks assignment); occasionally
(`HAIR_MUTATION_CHANCE = 0.08`, matching the game's other mutation dials) a colour borrowed whole
from a *different* coat entirely — "you should be able to get a strawberry horse with black hair...
just don't overdo it," from the player who asked for it. Flaxen, a real inherited gene, still takes
priority when it expresses; this only governs everyone else's mane.

Measured after the fix, same methodology:

```
41.4% of fields had a full exact-look repeat (coat AND mane both matching) — down from 99.9%
7.0% of horses rolled the cross-coat mutation, against a target of 8%
```

**This is an interim shape, not the final one**, and it is logged as such in ongoing-decisions.md:
the mane is hashed off the horse's own id, so a foal rolls a fresh mane rather than plausibly taking
after a parent's — the wrong mechanism for something this game otherwise treats as real, inherited
genetics (coat itself, flaxen). The real version gives mane its own locus in `sim/coat.ts`, inherited
through `inheritCoat` the way flaxen already is.

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

**Update — the charges-bar half of this is fixed.** Found in play again, this time specifically:
"the mobile version the horse is cut off." Confirmed the cause was the charges bar (`drawHud`,
drawn *after* the horse loop, so it paints over anything under it) sitting at a fixed pixel offset
from the bottom (`height - pad - 34`) while lane 7's feet landed at a flat `0.985 × height` — on a
375×812 canvas those two collide, and cropping the screenshot showed the nearest horse's legs
painted over by the bar. The same collision reproduces on a 1440×900 desktop canvas too (confirmed
by cropping the same region there), just less visibly, because the bar's fixed pixel height eats a
much bigger share of a short mobile canvas than a tall desktop one. Fixed in `ui/raceScreen.ts:427-441`:
lane spacing is now derived from the actual clear space above the bar (`reservedBottom = 96`,
`maxLaneY = height - reservedBottom`) instead of a flat height ratio, so every lane's feet stay
above the bar regardless of screen height. Verified via Playwright at both breakpoints — no lane
overlaps the bar any more.

**Still open:** the deeper issue this entry started with — `track.ts` and `raceScreen.ts` computing
the running-surface geometry independently, with no shared source of truth — is untouched. Today's
fix only reconciles lanes against the charges bar; it happens to also keep every lane inside the
dirt band for realistic screen heights, but that's incidental, not contractual. The "hand the lane
geometry to the renderer instead of both guessing" fix this entry originally called for is still the
real fix.

### ✅ Race screen: the field spread wastes most of a wide canvas

**Found in play** — "It's worse on desktop mode too" (raised right after the charges-bar fix above,
about the race screen generally); confirmed a second time from a player screenshot ("Landscape
Mobile all the horses are huddled together") that first read as a landscape-specific bug.

Confirmed by driving the same race at three wide aspect ratios side by side — desktop (1440×900),
landscape phone (812×375), landscape tablet (1180×820) — and comparing the same moment in each
(~515m to go). All three show the identical composition: the trailing pack in one tight overlapping
clump, a big gap to the isolated leader, and a large stretch of plain turf and sky beyond that with
nothing in it. **Not landscape-specific** — it's this entry and the bunched-field one below, showing
up together on any screen wide enough to expose them. Portrait mobile hides it well simply because a
narrower canvas doesn't have enough spare width for the emptiness to register as wasted; the pack is
just as bunched there, it's just less obvious.

**Cause — two things compound:**
- `visibleMetres` (`raceScreen.ts:396`) is a binary switch, 28m below a 600px width and 42m at or
  above it, not something that scales with the actual viewport. Every width from 600px to a 4K
  monitor shows the *same* 42m window, just at a bigger pixel-per-metre ratio — so a wider screen
  doesn't show *more* track, it shows the *same* track bigger, with the rest left as margin.
- The camera's horizontal anchor (`target = player.distance - width * 0.36 / cam.pixelsPerMetre`,
  `raceScreen.ts:399`) always pins the player at 36% from the left, full stop, with no notion of how
  spread out the rest of the field actually is. When the player is genuinely clear of the pack,
  there's nothing left of that mark and nothing far enough right to be relevant either.

**Direction, not a fix:** either let `visibleMetres` grow past some width (showing more of the field
rather than a bigger version of the same slice), or make the camera anchor responsive to the field's
actual spread — center on the pack's bounding box instead of a fixed screen fraction — or both.
Check whichever gets picked against the bunched-field entry below before committing: the two pull in
opposite directions, early race wants to show *less* track to keep the pack legible, late race has
empty track to fill. (Note: the running surface is `grass.png` now, not dirt — Hayden's call to run
this as a turf race, landed after this entry was first written; doesn't change the camera math.)

**Fixed — the anchor, not `visibleMetres`.** Checked against the bunched-field entry below as asked:
that fix (the lane fan-out) makes the pack legible independent of zoom, so the "opposite directions"
tension no longer applies and there was nothing forcing a joint decision. `visibleMetres` was left
alone deliberately — widening it on wide screens would shrink every horse to fit more track in,
trading away the "deliberately oversized... legibility cheat" `HORSE_SCALE` documents, for a problem
the anchor alone already solves.

The fixed 0.36 reserved 64% of the screen for whatever lay ahead of the player, which is empty turf
the instant the player is clear of the field — there is nothing ahead of a leader. `anchorFraction` now
slides between 0.22 and 0.7 by how much of the field's content actually lies ahead of the player versus
behind (`aheadMetres` / `behindMetres`, the furthest runner each way), falling back to the old 0.36 only
when there's no spread yet to read (e.g. still at the gate). Verified in the browser with a controlled
A/B on the same seeded race: at "1st of 8," the old anchor held the leader at 36% with the entire right
two-thirds of the canvas empty grass; the new one puts the leader around 68%, filling most of the canvas
with the chasing pack instead. A trailing horse gets the mirror treatment, sliding toward 22% to show
more of the field it's chasing.

### ✅ Race screen: a bunched field renders as one illegible blob of horses

**Found in play (this investigation)** — confirmed on both breakpoints. In the first ~10-15m of a
race, before any real gap exists, all eight runners sit at nearly identical x and are separated only
by lane: a ~5% size difference per lane (`laneScale`, `raceScreen.ts:447-448`) and a modest y-offset,
with **no x-offset between lanes at all**. At the sprite's drawn size that isn't enough separation —
the eight horses render as one stacked column, jockey silks the only way to tell them apart, and even
those overlap. The same field 250m later, once real gaps exist, is completely legible — this is
specifically an early-race problem, not a general rendering one, and it's the first thing a player
sees every single race ("and they're off!").

**Decided, not just a direction now:** this was originally left as a fork — widen the depth cheat
(bigger size/y spread per lane, leaning toward an over-the-shoulder camera like Rival Stars Horse
Racing) vs. flatten it (smaller size difference, same-size horses in parallel lanes like swim lanes,
staying true to a side-scroller). Settled by what's actually buildable: the hand-drawn backdrop art
now shipped (day/evening/stormy skies, the turf running surface) is flat pixel art with no depth
cues, generated through a pipeline that can't reliably produce the consistent multi-layer parallax an
OTS camera would need. Leaning into depth would mean fighting that pipeline for the same reason
PixelLab kept defaulting to a receding sky no one wanted. So: **flatten it.**

Concretely, that means *reducing* `laneScale`'s existing size variance (`raceScreen.ts:447-448`,
`baseScale * (0.88 + lane * 0.04)` — the `0.04` is the per-lane depth cheat, shrink it toward 0 rather
than growing it) so horses read as same-size runners in parallel lanes, and adding a small **x-offset
per lane** (there is currently none at all) so a bunched start fans out across the width instead of
stacking vertically on one line. Widening lane spacing for just the first second and easing it back
as the field naturally spreads is the cheaper partial version of the same idea, if the full fix is
too much for one pass.

**Fixed.** `laneScale` is now `baseScale * (0.97 + lane * 0.01)` — an 8-point span recentred on true
scale instead of the old 28-point span skewed below it, so lanes read as same-size runners rather than
a receding row. A new `laneXOffset` fans the eight lanes symmetrically around the true screen-x — the
x-offset that was completely missing before. Driven in the browser rather than guessed: at the gate the
pack now reads as a cluster of distinct horses and silks instead of one black stack, and by ~300m in,
once real gaps exist, the offset is small enough next to those gaps to be invisible — confirming the
"unnoticeable once the field spreads out for real" requirement this entry set for itself. `visibleMetres`
untouched; the camera anchor got its own fix in the entry above.

**Corrected — found in play.** The first version of `laneXOffset` was a straight ramp,
`(lane - (LANE_COUNT - 1) / 2) * LANE_X_SPREAD` with a flat 32px `LANE_X_SPREAD`. Two problems, both
raised by a player looking at it rather than caught building it:

- Lane 7 is also the nearest/biggest lane (`laneScale` above), so the ramp always drew the *same* lane
  both biggest and furthest to the right — reads as "lane 7 starts ahead," a fairness complaint, even
  though `sim/race/engine.ts` shuffles lanes every race and the offset never touches real race distance.
  It was a purely cosmetic ranking that happened to look like a designed advantage.
- A flat pixel offset is a bigger fraction of a smaller horse. Mobile-landscape width (812px, same
  `visibleMetres` tier as desktop) draws horses noticeably smaller than desktop's 1440px, so the same
  32px read as a much more exaggerated stagger there — the player who found this saw it specifically
  on mobile landscape.

`laneXOffset` is now `laneXZigzag(lane) * baseScale * LANE_X_SPREAD_FACTOR`: a signed, symmetric zigzag
(`+1, -1, +2, -2, +3, -3, +4, -4` across the eight lanes) instead of a ramp, so the near/big lane is no
longer always the one drawn furthest along the track, and scaled by `baseScale` — the horse's own drawn
size — instead of a flat pixel count, so the fan-out stays proportionate on any screen. Verified at both
1440×900 and 812×375: the pack now reads as a jostling cluster rather than a staged line-up.

**Superseded.** The x-offset described above — zigzag, `LANE_X_SPREAD_FACTOR`, all of it — is removed
outright in the entry below, on direct player instruction: separation belongs on the y axis lanes
already stand for, not smeared sideways across the axis that reads as race position. Left as a record of
what was tried and why the ramp specifically was wrong; the mechanism itself no longer exists.

### ✅ Race screen: lanes still read flat on a short canvas even after the x-offset fix

**Found in play**, immediately after the zigzag fix above: "on mobile landscape the horses stack but
not flat," with a specific suggestion — a steeper, higher-angle camera on short screens so the eight
lanes get more vertical room to spread into, rather than leaning further on horizontal tricks alone.

**Cause.** `laneY`'s vertical spacing was already deriving itself from the actual clear space between
`baseY` and the charges bar (an earlier fix, above in this file), but `baseY` itself was still a flat
0.58/0.60 fraction of height, same as the backdrop's horizon at a flat 0.44 — both tuned for a canvas
tall enough to leave hundreds of pixels below them. A landscape phone (812×375) has plenty of *width*
but very little *height*: at 375px, `baseY` (225) left only 54px of band for all eight lanes — about
7.7px between adjacent lanes, nowhere near enough for a horse sprite to read as separated vertically,
whatever the x-offset does. Not a regression from the fix above; the same ceiling was there before it
and the zigzag fix didn't touch `baseY` or the horizon.

**First fix — the suggested camera tilt, height-gated.** `render/track.ts` exported `cameraTilt(height)`,
0 (steepest) to 1 (today's angle, unchanged), and `horizonY(height)` built on it — the single source
both the backdrop and the race screen's lane math key off, closing the "no shared source of truth" gap
an earlier entry in this file flagged as still owed. Above `REFERENCE_HEIGHT` (650) `cameraTilt` was
exactly 1 and everything byte-identical to before — desktop, tablets, and portrait phones untouched.
Below it, the horizon tilted from 0.44 toward 0.16 and `raceScreen.ts`'s `baseY` gap tilted down with it,
so the room a steeper horizon reclaimed from the sky reached the lanes. At 812×375 this roughly doubled
the vertical band the eight lanes had to spread into.

**Corrected — found in play again, immediately.** "The horses need to be spread out much more on
desktop landscape... Not spread out that way [horizontally] ... They need to have space between them on
the y axis. Notice the other versions have space there. It needs to do the same." Two things, both
addressed in the same pass:

- The height gate meant desktop (900px) and the landscape tablet (820px) both cleared
  `REFERENCE_HEIGHT` and kept the original flat 0.44/0.60 framing — the *original* "horses on desktop
  don't fit in the lane... a lot of screen real estate at the top isn't being used" complaint this whole
  section of the file opened with, never actually fixed for any landscape canvas tall enough to clear
  that gate. `horizonY` and `cameraTilt` now take `width` too: `isLandscape(width, height)` (width ≥
  height) gets the steeper camera at *every* height, not just short ones —
  `HORIZON_FRACTION_LANDSCAPE_TALL` (0.25) replaces the old 0.44 ceiling outright, with the existing
  height-based tilt layered on top for short landscape canvases going even steeper from there. Portrait
  is untouched at every height — it was never the complaint, and keeps `HORIZON_FRACTION_PORTRAIT`
  (0.44) throughout. On a 1440×900 desktop this roughly doubles the vertical band again, on top of
  whatever the first fix already bought mobile-landscape.
- The x-offset that fanned lanes out horizontally (the zigzag fix, above) is **removed outright**, not
  just reduced — direct player instruction. `x` is once again purely `metreToScreen(distance)`; only
  `laneY` differs a runner from its neighbours now, which the much bigger vertical band above makes
  legible on its own.

Fixing the first bug surfaced a second one immediately: with the gap this much smaller, lane 0's own
sprite — head, ears, mane, well above the ground point it's drawn at — could clip off the top of a short
landscape canvas (812×375 specifically). `baseY` now has a floor, `baseScale * 132`, so it can never be
pushed higher up the screen than lane 0's own sprite needs headroom for, whatever the gap fraction above
computes. 132 is measured empirically (screenshotted the clipping, walked the constant up until it
stopped) rather than derived from the rig's coordinates, which pass through too many rotations (neck
pitch, ear tilt, gait bob) to sum by hand.

Verified with a controlled A/B on the same seeded race at 1440×900, 1180×820, 812×375 (no clipping at
the new floor) and 390×844 portrait (untouched): the pack now reads as a clearly separated column of
lanes at every landscape size, mobile through desktop, with real gaps as they open rather than a
horizontal smear.

**Corrected — found in play immediately after, a third time.** "Is the issue with them floating in the
air fixed?" It wasn't: shrinking the gap to buy vertical spread pulled `baseY` up close enough to the
horizon that it landed *above* `drawTurf`'s own `trackTop` (`horizon + height * 0.09`) on desktop and
mobile landscape both — lane 0 was standing in the rail/crowd strip above the grass rather than on the
running surface, reading as floating. `track.ts` now exports `trackTopY(width, height)`, built on the
same `horizonY` rather than a second copy of the 0.09 offset, and `baseY` takes the max of the gap
fraction, the sprite-headroom floor above, and this one — it can never land above the turf, whatever the
other two compute. Re-verified at the same four sizes: every lane now stands on grass, headroom intact.

**Still wrong — found in play again, immediately: "that doesn't look fixed to me... only mobile portrait
looks right."** They were right and the screenshots I'd been checking were misleading me: `trackTopY`
turned out to describe a boundary that only exists in `drawTurf`'s *fallback* path (no art loaded). With
the real art loaded — the normal case — `drawTurf` tiles `grass.png` starting at `horizon` itself, well
above `trackTopY`, so grounding the *anchor* against `trackTopY` was already trivially satisfied and
never the actual constraint. The real bug: a horse's head, ears and mane sit `SPRITE_HEADROOM` (132 rig
units) *above* its anchor, and on the much smaller gap landscape now uses, that put lane 0's head above
`skyBottom` — the crowd stand's own top edge — standing in open blue sky no matter where its feet were.
Grounding the feet was never going to fix a problem that lived in the head. `track.ts` now also exports
`skyBottomY(width, height)`, and `baseY`'s floor is `skyBottomY(...) + baseScale * SPRITE_HEADROOM` —
not just the anchor, but the anchor *plus the sprite's own height above it* — clamped to stay within the
crowd stand at worst, never above it. Re-verified at all four sizes with the head/crowd boundary checked
directly, not just glanced at: no lane's head clears the crowd stand into sky at any of them.

**Refined — found in play once the floating bug was actually gone: "Nice spaced better. Have them start
lower on the y axis."** Sitting exactly at the sky floor put lane 0's head right at the crowd stand's
top edge with no room to breathe. A `START_LOWER_MARGIN` (40 rig units, `baseScale`-scaled like
everything else here) pushes `baseY` further down past that floor — but only on screens with band to
spare: it's also scaled by `tilt`, the same curve `horizonY` itself tilts on, so desktop and tablets get
the full push while a short landscape canvas — the shape this whole entry exists to protect the band of
— gets little to none. Verified: desktop and tablet now start visibly lower with the same spacing as
before; mobile landscape is close to unchanged, A/B'd against the pre-margin screenshot directly rather
than judged by eye.

**A related but distinct gap, found in play right after: "the green grass is taking up too much screen
space" on iPhone landscape.** Measuring the actual rendered canvas (812×375 in Playwright resolves to a
375-height *viewport*, but the canvas itself sits under the bottom info bar and is closer to 313px tall)
turned up the real cause: `visibleMetres` — the fixed window of *track* shown, which sets how big a horse
is drawn — only ever keyed off `width` (`width < 600 ? 28 : 42`), never height. So a landscape phone got
the same 42m window as a 1440px desktop despite having a fraction of the vertical room, and a horse that
is a fixed real-world 2.47m drawn across a fixed 42m window comes out proportionally small on a short
canvas — grass dominates by default because the horses themselves are small, not because any specific
strip of the canvas is provably unused. `visibleMetres` now tilts on the same `cameraTilt` curve
`horizonY` already uses for landscape: 28m (the same zoom portrait mobile gets) at the shortest
landscape canvases, unchanged at 42m once height clears `REFERENCE_HEIGHT` — so desktop and tablets are
byte-identical to before. Verified at 812×375: horses visibly larger, both at the bunched start and once
real gaps open mid-race; desktop and tablet screenshots confirmed pixel-unchanged.

**Corrected — found in play immediately: "you can see they're all mashed together, right?"** They were.
Bigger horses need proportionally bigger `SPRITE_HEADROOM` in pixels — same rig-unit clearance, but
`baseScale` grew ~20% with the zoom above — and that headroom is subtracted from the *same fixed band*
`laneSpacing` draws from. Zooming in to fix the grass complaint spent the band the y-axis spacing entries
above had just fought to win back, on the shortest landscape canvases worst of all, since that's exactly
where the zoom pushes `baseScale` hardest. `MIN_LANE_SPACING` (`baseScale * 18`) is now a floor
`laneSpacing` can't be pushed below: whenever sitting at the sky-clearance floor would leave less than
this much room per lane, `baseY` is pulled back up toward the crowd instead — trading away sky clearance,
never spacing, and never the grounding floor (`trackTopY`) either; a horse floating in the air is a worse
failure than one whose head brushes the crowd stand. Verified: mobile landscape reads as eight separable
runners again at both the bunched start and mid-race; desktop, tablet and portrait unaffected, since the
floor never binds where the band was already generous.

**Found in play (this investigation)**, minor — while the leader pulls away, a trailing horse can be
drawn straddling `x = 0`, mid-sprite, rather than fully in or out of frame. `raceScreen.ts:441`
already culls runners outside `[-140, width + 140]` in screen-space by design, so pop-in/pop-out at
the edge is expected — the 140px margin just doesn't account for the sprite's own width at a large
lane scale, so a horse can still be freshly, partially visible instead of clipped at something that
reads as an edge (a rail post, the turf boundary). Worth a look in the same pass as the two above,
same code path.

### ✅ Background art: the race camera scrolls sideways, it does not recede into depth

**Raised by Hayden**, chasing PixelLab generations for a race background: every attempt had come back
with the track receding away from the camera — a vanishing point, converging rail lines — instead of
moving across the screen.

The cause: the camera is genuinely a horizontal scroll (a horse's screen-x is a direct function of
its race distance, `metreToScreen` in `render/track.ts`) with a **per-lane pseudo-depth cheat**
layered on top (`laneY`/`laneScale` in `raceScreen.ts` — nearer lanes drawn bigger and lower). Closer
to a classic 2D side-scroller with an Out-Run-style lane stagger than to any real 3D perspective. So
PixelLab defaulting to a receding, vanishing-point image wasn't a mismatch with some other design
choice — "racetrack" as a prompt just strongly biases toward the real-world broadcast angle (rail
lines converging on the horizon), which *is* a depth composition, and isn't what this renderer draws.

**Fixed** — `render/track.ts`'s `drawBackdrop` now tiles real hand-drawn art (seamless,
horizontally-tileable side-view strips, no vanishing point) in place of the flat procedural bands for
sky, crowd stand and the turf running surface, each scrolling at its own rate (sky barely, crowd at
0.35x, turf at full rate) with the original flat-colour version as a fallback if the art hasn't loaded
yet. Two real bugs turned up building it, neither obvious from the code alone: a sign bug in the
tiling offset math left a gap at the left edge whenever the camera's scroll went negative (the first
few seconds of every race), and a shared path variable defeated Vite's static asset detection, so the
images loaded fine in dev and would have silently 404'd in the real production build. Sky now also
varies per race — day, evening or stormy, picked at random once per race in `raceIntro.ts` so it
stays consistent from the intro card through to the finish.

**Resolved the fork it left open:** see "a bunched field renders as one illegible blob of horses"
below — that entry was originally a fork between leaning into the depth cheat (closer to what this
entry's art turned out to make possible) and flattening it. Decided in favour of flattening,
specifically because this art is flat pixel art with no depth cues, and now built.

### ✅ The sky is nearly half the frame with almost nothing in it

Same investigation as the geometry entry above: the horizon sits at `height * 0.44`
(`render/track.ts:43`), so on every screen the top 44% was a sky gradient plus a scatter of
crowd-flash sparkles (`spawnFlash`, `raceScreen.ts`) and nothing else. **Addressed** by the background
art entry above — the sky band now carries real art (three variants) instead of a flat gradient.

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
