# Bloodline — Build Roadmap

Companion to [DESIGN.md](DESIGN.md) and [TRAITS.md](TRAITS.md).

See [HISTORY.md](HISTORY.md) for a detailed record of design iterations and lessons learned.

See [NEXT_PLAN.md](NEXT_PLAN.md) for the active working roadmap for upcoming work.

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

## Phase 5 — Breeding
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
- **Stud fees priced on what you are buying** — the partner's banked legacy *and* its potential
  grades, so you pay for the foal you can actually expect rather than for a reputation
- Own Hall of Fame horses free forever, and carrying **+25% of that parent's contribution** to the
  budget (§10's worked example: +50 on a ~200 base)
- Retired horses keep ageing into ineligibility
- **Partners are bloodstock, never a fresh roll** — a stud generated from a division band flattens
  any line that breeds to it, measured in the Stage 1 follow-up above
- **Stud influence pays prestige, never cash** — see below

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

### Stage 4 — The archive
- **CK3-style pedigree tree.** First-class screen, not a submenu
- Procedural naming with the dedupe and quality safeguards

### Stage 5 — Foal development
- The EV-style allocation pass

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

**Stage 2** — Settled above, except: how much prestige does one outside mare bred to your stallion
actually pay, and is it per pairing or per career? Too generous and it becomes the fastest route up
the ladder; too little and enshrining a horse loses half its point.

**Stage 3** — Which coat loci ship (base black/bay/chestnut plus how many modifiers)? What mutation
chance applies to traits and aptitude? How fast does relatedness narrow variance — §10 wants a
favourite line viable for "many generations", which needs a number. What does a rejected foal sell
for, and how long before it turns up on a racecard?

**Stage 4** — Does the tree render every horse, or collapse rejected foals until asked? What is the
performance ceiling once a yard is fifty horses deep?

**Stage 5** — How large is the development pool, and does it scale with anything? What can points
buy beyond stats — aptitude nudges and latent traits are named in §10, and both change what the
foal *is* rather than how big its numbers are.

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

## Phase 6 — Polish
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
| 5 · Breeding | ~3–4 | 🚧 **IN PROGRESS** — Stage 1 complete and the loop closes; Stage 2 (partners, stud fees, stud influence) is next |
| 6 · Polish | ~3+ | ⏳ After Phase 5 |
| **Total estimate** | **~20–25** | |

---

## If we need to cut

In order of what goes first:

1. Five tracks → one track with varied conditions
2. Wagering
3. Consumables
4. Foal development phase → automatic allocation
5. Difficulty tiers → ship Standard only

**Never cut:** the balance harness, the energy economy, the pedigree archive. Those are the spine.
