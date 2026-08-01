# Bloodline — Build Roadmap

Companion to [DESIGN.md](DESIGN.md) and [TRAITS.md](TRAITS.md).

**Unit of estimation is a *work session*, not a calendar day** — pace depends entirely on how often
we sit down with it. Sizes are honest, not optimistic.

**🚦 = hard gate.** Work stops and you judge before we continue. Two of them, both early and both
deliberate.

---

## Phase 0 — Foundation ✅ COMPLETE
**~1 session** · live at https://haydenmay.github.io/Bloodline/

Delivered: Vite + TS scaffold, ESLint-enforced `sim/` isolation (verified against a
deliberate violation), seeded deterministic RNG, versioned save schema with migrations and
export/import, GitHub Actions deploy gated on lint + test + build, LICENSE and CREDITS.
16 tests passing, 0 vulnerabilities. Production build confirmed serving from `/Bloodline/`.

- Vite + TypeScript scaffold, strict mode, the `sim` / `render` / `ui` / `data` / `save` layout
- The architectural constraint enforced from commit one: **`sim/` may never import from `render/`
  or `ui/`** — a lint rule, not a good intention
- Save schema with versioning and a migration path, before any real saves exist
- `git init`, `.gitignore`, `CREDITS.md`, licence policy in place

### Hosting, set up now rather than later

| | |
|---|---|
| **Source** | GitHub, **public**, with an `All Rights Reserved` licence — public means readable, not reusable |
| **Live + phone testing** | **GitHub Pages**, auto-deployed on push via Actions. HTTPS on `github.io`, so PWA install and offline both work |
| **Fast iteration** | Vite `--host` over local wifi during a working session |
| **Distribution** | itch.io at Phase 5–6 — the shop window, not the venue |

**⚠️ Configure `base: '/bloodline/'` in `vite.config.ts` from the first commit.** Pages serves from
a subpath, so any asset path written as `/images/x.png` works perfectly on localhost and silently
404s in production. Cheap to set up now, an afternoon lost if discovered at Phase 2.

itch.io runs HTML5 games in an **iframe**, which blocks PWA installability — which is why Pages
stays the real home and itch is only the storefront pointing at it.

**Deliverable:** repo builds, deploys, and loads on your phone. Nothing to look at yet.

---

## Phase 1 — The race simulation, headless
**~2–3 sessions** · *the most important phase in the project*

- Horse model: 6 stats, hidden potentials, running style, aptitude grades, traits
- **The energy economy** — drain and recovery scaled by position vs. style, drafting
- Pace model, 8-horse fields, AI riding logic per style
- Kick as a function of remaining energy × Grit
- Consistency failures, Temper-driven daily form, jockey-gated traffic trouble
- Fully seeded and deterministic
- **The balance harness** — ten thousand races per run, reporting win rate by style, by division,
  and the shape of the dominance curve

**Deliverable:** numbers you can trust. Still nothing to look at.

### 🚦 Gate 1 — Is the model sound?
I show you harness output. We're checking: no running style dominates, every division is winnable,
the dominance curve is flat in the middle and steep at the ends, and **pace collapses actually
produce upsets**. If closers win 70% of races, we fix it here — where it costs hours instead of
weeks.

---

## Phase 2 — One playable race
**~3–4 sessions** · **Milestone 1** · *all deliverables landed; awaiting Gate 2*

- ✅ Skeletal horse rig, layered parts, clean vector art
- ✅ Coat genetics driving runtime tinting
- ✅ Track, scrolling camera, oval minimap, crowd
- ✅ HUD: energy bar with the style safe-zone, distance countdown, phase call-outs
- ✅ **DRIVE** input — touch and keyboard — plus the kick
- ✅ Post-race recap with the narrative explanation of what happened

**Deliverable: you can play a race on your phone.**

Racing now runs on a commissioned 24-frame gallop sheet, split into materials
by `tools/bake-sprites.ts` and recoloured per runner at load — so a bred coat
and a rival's silks both come out of one grey sheet. The drawn rig stays behind
it for the poses the sheet does not contain, and as the reference the sheet was
measured against.

**Phase 2 is not ticked off until you have played it and answered Gate 2.**

### 🚦 Gate 2 — Is it fun?
The one that matters. Everything after this is built on the assumption that racing feels good. If
it doesn't, we change it now, and we will have spent five sessions finding out instead of twenty.

---

## Phase 3 — A full career
**~3–4 sessions**

- Starter selection — six horses, guaranteed archetype spread
- Training weeks: sessions, condition, form states, injury, breakthroughs
- Race calendar — choose from 2–3 upcoming races
- Divisions, points-based promotion and demotion
- **The living world** — ~70 AI horses generated to match their division, training, ageing,
  promoting and retiring on their own
- Save, load, slots, export/import
- Auto-race and skip

**Deliverable:** one horse, start to retirement, 18–20 starts.

---

## Phase 4 — The stable
**~2–3 sessions**

- Cash and Reputation as separate currencies
- Seven facilities, five levels each
- Trainer and Jockey, levelling, **capped by Reputation**
- Consumables
- Retirement, Legacy scoring, Hall of Fame
- The permanent **rival dossier**
- Wagering on your own horse

**Deliverable:** careers connect. Run 2 opens stronger than run 1.

---

## Phase 4.5 — Re-balance and physics
**~2–3 sessions** · *a correction pass, not a feature*

Numbered 4.5 deliberately. It ships no new systems, and renumbering the phases
after it would strand every `Phase 5` reference already written into the code.

Everything below is a known, **measured** defect. This phase is where the bill
comes due for shipping a race that felt good before it was calibrated.

- **The speed scale.** A winning 8f is 64.4s against a real ~96s — 25.0 m/s
  where a thoroughbred tops out near 17.5. Do this one first and alone: a margin
  is a time gap times speed, so it deflates every margin in the game by 1.43×
  before anything else is touched, and every other constant is calibrated on top
  of it.
- **The energy floor.** An empty horse currently keeps losing ground at a rate
  nothing in racing does. It should fade, not collapse. This is what turns the
  tail of the field from 74 lengths into something a person would recognise.
- **The full re-balance at lower noise**, as diagnosed in the known issue below:
  daily form and the consistency band come down together, then the phase
  profiles and position costs are re-tuned against the quieter baseline.
- **A parameter sweep in the harness**, so the above is done by evidence rather
  than by hand. Sweeping two or three constants across a grid and reading the
  dominance curve off the result is the only honest way to do it.
- **Re-verify Gate 1.** No running style dominates, every division is winnable,
  the curve is flat in the middle and steep at the ends, pace collapses still
  produce upsets. All of it, at the new noise level.
- **Reconcile the animation with the simulation.** The gallop sheet is 24 frames
  of one gait; the sim has `intensity` and `drive` that it currently cannot
  express. Stride length is also derived from speed, so correcting the speed
  scale moves it.

**Deliverable:** finishes you would believe. Photo finishes at the front, a
beaten field that is beaten rather than distanced, and a harness run that proves
it rather than a screenshot that suggests it.

### Five single-lever attempts, all failed — start from here

Every one of these was tried against the balance harness and rejected. **The
failure is always the same suite and always the same style**, which is the most
useful thing known about this problem:

| Attempt | Closer win rate | Fair share |
|---|---|---|
| Drain measured from a cruise, recovery from the cruise | 2.7% | 12.5% |
| ...with recovery restored to measure from full effort | 3.3% | 12.5% |
| ...with the front-running cost nearly tripled | 2.7% | 12.5% |
| `HOLD_EFFORT` 0.55 → 0.42, so holding banks | 5.2% | 12.5% |
| ...with `KICK_MAX_BONUS` 0.085 → 0.15 | 6.8% | 12.5% |

**Why, and it is structural.** A closer wins because the horses in front of it
**fade**. Every one of these makes the economy sustainable, so nothing fades,
and the closer's entire win condition disappears with it. Strengthening the kick
to compensate — the counterweight the design already names — recovered less than
two points.

So the fade threshold, the kick, the position costs and the AI's effort profile
have to move **together**, and the sweep is not optional. Any attempt that
touches one of them alone will land somewhere on the table above.

The player-facing symptom is in `PLAYER_CRUISE_CAP` (`ui/raceScreen.ts`), swept
to the best value the current economy allows. It is a tourniquet, not a fix:
holding the field's pace still costs more than break-even permits, so a hands-off
horse still bleeds — just slowly enough to have something left at its window.

### Why here, and not sooner

Sooner and you are balancing a race with no career around it — no divisions to
be winnable, no eighteen-start season over which "fair" is even measurable, and
nothing at stake in losing. By the end of Phase 4 all of that exists, so the
racing can be judged as the thing players actually experience.

Later and it is worse: breeding multiplies every balance decision by inheritance,
and re-tuning after foals exist means re-tuning the genetics too.

---

## Phase 5 — Breeding
**~3–4 sessions** · *the payoff*

- Inheritance budget: career achievement → points → distribution
- First-cross bonus, diversity-driven variance, the floor guarantee
- Coat genetics with real dominant/recessive inheritance
- Foal development phase (the EV-style allocation)
- **CK3-style pedigree archive**
- Procedural naming with the dedupe and quality safeguards
- Rejected foals sold, and released into the world as rivals

**Deliverable: the loop closes.** Retire, breed, race the foal.

---

## Phase 6 — Polish
**~3+ sessions, open-ended**

- Full race-day soundscape and stable ambience
- Five tracks, weather, going, crowd density scaling
- Accessibility pass — colourblind palettes, reduced motion, text scaling, speed controls
- PWA, offline, mobile performance tuning
- Codex: racing manual and breeding manual
- Opening sequence
- Difficulty tiers verified through the harness

---

---

## Known issue — winning margins are too wide

**Currently 6–7 lengths between first and second.** Real racing is decided by
1–3, and 5+ is a rout. Long term this needs to be much closer, with genuine
photo finishes — that is where the drama of a race actually lives.

### The tail is worse than the front, and that is the bigger problem

Measured over 200 races, 8f, open division — median margin behind the winner:

| Place | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th |
|---|---|---|---|---|---|---|---|
| Behind | 4.4L | 7.9L | 11.3L | 16.7L | 23.9L | 38.4L | **73.8L** |

The first four are close to plausible. From fifth back it detonates: the gap
between consecutive horses runs 3.5L, 3.5L, 5.4L, 7.2L, **14.5L, 35.4L**. A real
eight-runner field finishes inside about twenty lengths end to end; ours strings
out over seventy. Horses that run out of energy are not fading, they are
collapsing.

This matters more than the winning margin because it is what a player actually
sees. A beaten horse is routinely reported as *distanced*, which reads as a
broken game rather than a bad ride.

**Two contributing causes, both measured:**

1. **The tail collapse above** — the energy model has no floor, so an empty horse
   keeps losing ground at a rate nothing in racing does.
2. **The whole sim runs 1.43× too fast.** A winning 8f time is 64.4s against a
   real ~96s, which is 25.0 m/s where a thoroughbred tops out near 17.5. Since a
   margin is a time gap multiplied by speed, every margin is inflated by that
   factor before any of the variance above is applied.

Fixing the speed scale alone would take last place from 74L to about 51L. It is
not sufficient, but it is the cheapest single correction and it should come
first, because everything else is calibrated on top of it.

**Owned by Phase 4.5.** Not urgent for Gate 2 — riding still feels different race
to race — but nothing above gets better on its own, and every constant added
between now and then is calibrated against numbers we already know are wrong.

Deliberately shelved, not forgotten: it is reported on every harness run so it
cannot quietly persist.

**The diagnosis, so it does not have to be rediscovered.** Margins and style
balance are coupled through variance:

- The dominant driver is **daily form** (±4.7% per horse at Temper 50), which is
  fixed for the whole race and so compounds directly into the finishing gap.
  The consistency band and the effort-to-speed range matter less than expected —
  narrowing the speed range actually made margins *worse*.
- Cutting that variance does tighten finishes (6.4L → 5.2L when tried) **but
  lets systematic style advantages dominate**: with less noise to wash them out,
  closers jumped to 22% and stalkers collapsed to 5.7%.

So this is not a one-constant fix. It needs a **full re-balance at a lower noise
level** — reduce daily form and the consistency band together, then re-tune the
phase profiles and position costs against the quieter baseline. Best done as its
own focused pass, ideally with a parameter sweep rather than by hand.

---

## Known issue — position costs more than it returns

**The player-facing symptom: stamina drains hard in the opening, and never
really comes back.** It reads as a broken control, not a pacing decision — you
did not fail to hold your position, holding it simply does not pay for what
reaching it cost. This is a distinct diagnosis from the margins issue above,
though it is the same energy economy and belongs to the same Phase 4.5 pass.
Reproduce with `npm run energy-profile` (`tools/energy-profile.ts`) — hands-off
ride, 120 races, 8f open:

| style | 5% | 10% | 20% | 28% | 40% | 60% | 80% | 100% |
|---|---|---|---|---|---|---|---|---|
| frontRunner | 55 | 39 | 32 | 32 | 33 | 34 | 32 | 24 |
| stalker | 72 | 60 | 48 | 45 | 44 | 44 | 40 | 30 |
| midPack | 83 | 73 | 60 | 56 | 57 | 59 | 55 | 45 |
| closer | 95 | 92 | 86 | 81 | 84 | 86 | 83 | 74 |

A front-runner is down to 39 of 100 by the **10% mark** — before the player has
made a single decision — then plateaus at 32–34 for the entire middle of the
race and never recovers. Net energy/sec by phase, across all styles: **establish
−2.42/s, cruise +0.09/s, stretch −0.64/s.** The hole is dug in the first 28% and
the cruise essentially cannot refill it.

**Two causes, both structural, not a tuning miss:**

1. **The establish phase is charged twice for the same thing.** In `ai.ts`, a
   horse starting outside its preferred slot gets
   `effort = HOLD_EFFORT + drift × ESTABLISH_GAIN × urgency`, which clamps to
   `MAX_EFFORT` (1.0) for anything badly out of position. But the engine has no
   notion of "establishing" as a special case — it just sees high effort while
   `misfit` is still high, so `POSITION_COST_PENALTY` (extra drain for being out
   of position) is charging *at the same time* as the effort spike. The cost of
   reaching your slot and the cost of not yet being in it land together instead
   of one replacing the other.

2. **The cruise does not actually refund the reserve, even executed perfectly.**
   Worked by hand for a front-runner sitting in position, uncontested, at
   `HOLD_EFFORT` (0.55): drain ≈1.62/s, recovery ≈1.25/s — net **−0.37/s**, not
   the "must net positive" the comment above `HOLD_EFFORT` in `constants.ts`
   claims. `BASE_DRAIN` (7.4) and `BASE_RECOVERY` (4.1) are far enough apart
   that even a full positional bonus stack doesn't close the gap at that
   effort. The measured `+0.09/s` cruise above only holds at
   `PLAYER_CRUISE_CAP` (0.48), which is lower than the AI's own `HOLD_EFFORT` —
   every AI-ridden horse in the field is cruising at a worse rate than this
   table shows for the player's slot.

**So "getting into position" is not the broken step — you get there.** What's
broken is that position never pays back what it cost to reach, which is a
harsher version of the same asymmetry the five failed single-lever attempts
above already ran into. Any fix has to touch the establish/hold boundary and
the drain/recovery baselines together, which is why this is left for the
Phase 4.5 sweep rather than patched here — the recorded failures are exactly
what happens when one of these moves alone.

**Owned by Phase 4.5**, same as the margins issue. `npm run energy-profile` is
the standing check — re-run it once the sweep lands; establish should no
longer double-charge, and the cruise should measure positive at `HOLD_EFFORT`
itself, not only at the player's lower cap.

---

## Summary

| Phase | Sessions | Gate |
|---|---|---|
| 0 · Foundation | ~1 | |
| 1 · Race sim + harness | ~2–3 | 🚦 Is the model sound? |
| 2 · Playable race | ~3–4 | 🚦 Is it fun? |
| 3 · Full career | ~3–4 | |
| 4 · The stable | ~2–3 | |
| 4.5 · Re-balance & physics | ~2–3 | |
| 5 · Breeding | ~3–4 | |
| 6 · Polish | ~3+ | |
| **Total** | **~20–25** | |

---

## Why this order

**Both gates are in the first five sessions.** Racing is the load-bearing wall — if it isn't fun,
no amount of breeding depth rescues the game. So the plan front-loads the risk and puts your
judgement in front of it as early as possible.

**Phase 1 has no visuals on purpose.** A headless, deterministic sim is the only way to verify
balance by evidence rather than by feel, and it's far cheaper to fix a broken energy model in
spreadsheet form than after the art is wired to it.

**Breeding comes late despite being the title.** It depends on career achievement producing an
inheritance budget, which requires careers to exist first. Building it earlier would mean building
it twice.

---

## If we need to cut

In order of what goes first:

1. Five tracks → one track with varied conditions
2. Wagering
3. Consumables
4. Foal development phase → automatic allocation
5. Difficulty tiers → ship Standard only

**Never cut:** the balance harness, the energy economy, the pedigree archive. Those are the spine.
