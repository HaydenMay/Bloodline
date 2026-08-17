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
- `sim/breeding.ts`: retired career → inheritance budget → distributed foal
- Floor from the parents, budget from achievement, variance from pairing diversity
- First-cross bonus, rolled once per pairing so rerolling cannot farm it
- Pairing screen showing **projected potential ranges and nothing else** (§10)
- New careers start from a foal or from a yearling

**Deliverable: the loop closes.** Retire, breed, race the foal.

### ⚠️ Stage 1 follow-up — bloodlines converge toward bland

**Do this first.** `sim/breeding.ts` is built and correct on averages, but a three-generation trace
through the real generator shows every line flattening. Columns are SPD / STA / BRS / GRT / TMP / CON.

```
GEN 1  Brash Tide (starter)   36  92  63  71  60  67    avg 64.8   spread 56
GEN 2  budget 1190            54  87  71  76  65  73    avg 71.0   spread 33
GEN 3  budget 1430            62  86  81  81  73  71    avg 75.7   spread 24
```

| Line | Gen 1 | Gen 2 | Gen 3 |
|---|---|---|---|
| A | 33 | 19 | 14 |
| B | 56 | 33 | 24 |
| C | 32 | 23 | 17 |

The average climbs as designed, and a line's *character* does carry — Brash Tide is a stamina
freak with no speed, and three generations on it still is. But the spread halves every generation.
Extrapolated, generation six breeds 85/85/85/85/85/85: no specialists, no shape, every horse an
identical all-rounder.

**Cause.** Plain regression to the mean. Each foal centres on the mid-parent, and averaging two
horses always narrows spread. `MAX_SPREAD` is 14, while starters naturally spread 30–56, so the
variance term cannot come close to counteracting it.

**Why it matters.** The progression currently runs backwards. It should start roughly uniform and
grow *more* distinctive as a player breeds deliberately for a shape; instead it starts varied and
converges on bland. It also quietly undoes §10's central trade — if every line ends up the same
shape, choosing an outcross over a tight line stops meaning anything.

**Fix.** Raise the variance so an outcross can genuinely throw a specialist, and likely scale it by
how unlike each other the parents are rather than using a flat constant. Then **re-run the same
three-generation trace** and confirm the spread column holds or widens. Do not trust the arithmetic
on this one — the two bugs already found in this module (a line maxing out by generation four, and
clamping silently destroying points) both passed every unit test and were only visible by replaying
generations.

### Stage 2 — Partners, the cash sink, and stud influence
- **Stud fees priced on what you are buying** — the partner's banked legacy *and* its potential
  grades, so you pay for the foal you can actually expect rather than for a reputation
- Own Hall of Fame horses free forever, and carrying **+25% of that parent's contribution** to the
  budget (§10's worked example: +50 on a ~200 base)
- Retired horses keep ageing into ineligibility
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

### To measure once Stage 1 lands
What a gen-3 and gen-5 horse actually banks. Two open numbers depend on it and neither should be
touched before: whether the Hall of Fame at 1,000 is reachable, and whether the prestige walls
(Novice 0 / Professional 400 / Elite 1,500 / Champion 3,500 / Legend 7,500) need moving out.
Current estimates assume every horse banks what a generation-1 horse banks, which is exactly what
breeding is built to falsify.

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
| 5 · Breeding | ~3–4 | 🚀 **NEXT** — planned and sliced, Stage 1 ready to build |
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
