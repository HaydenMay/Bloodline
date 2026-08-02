# Bloodline — Build Roadmap

Companion to [DESIGN.md](DESIGN.md) and [TRAITS.md](TRAITS.md).

---

## 🚧 IN PROGRESS — the energy economy is being replaced with kick charges

**Read this before touching `sim/race/` energy code.** Mid-redesign, paused deliberately to
preserve context across a chat reset rather than mid-file. The owner's own words, most recent
first — these supersede anything below in this doc that still describes the old model:

> Stamina should be like a gas tank. It doesn't provide more power the more gas is in the tank.
> It's the amount of how far the effort can go. It should allow for maximum kicks and urges rather
> than how much power there [is].
>
> I don't want urges. I want to only be able to tap... I don't think I want the stamina bar and I
> think I want a number of kicks available (kick charges is fine terminology) that regenerate
> ALWAYS but regenerate quicker in good positioning. Tapping anytime should use one kick. Then have
> it regenerate.
>
> [Holding should] boost charge regen. Kick strength tied to Grit and jockey skill — not banked
> energy. If it's tied to Grit already, leave it like that.

**The target design, in full:**
- **No continuous 0–100 energy value at all.** Not just hidden from the player — removed from the
  simulation. This affects every runner, AI included, since there is no separate resource left for
  AI riders to have either.
- **Kick charges are the only resource.** A small integer bank per horse. Tapping — any time, no
  separate "urge" — spends one charge and fires the existing kick mechanic (a temporary speed
  multiplier, `speedCap *= 1 + kickStrength`, lasting `KICK_BASE_DURATION`).
- **Kick strength = Grit × jockey skill.** Deliberately NOT scaled by how full the bank is — a
  horse with 3 charges banked and one with 0.2 kick equally hard; the bank only gates whether you
  can fire at all, never how hard.
- **Charges regenerate always**, never stuck, never negative — faster in a good spot for the
  horse's running style, slower out of it. Reuse the position-quality math already built this
  session (`frontPenalty`/`misfit`/`fit`/`RECOVERY_FLOOR` and friends in `engine.ts` — the whole
  "how fast do you refill" computation) — just retarget it at charge-regen rate instead of energy.
- **Holding (take a pull)** still settles the horse back (costs ground, as before) and now ALSO
  gives an extra boost to charge regen on top of the position bonus — a deliberate "bank a charge"
  move.
- **Stamina (the stat) sets the TANK SIZE** — max charge capacity — not power and not regen rate.
  A high-Stamina horse can bank more charges; position/holding decide how fast it fills toward that
  cap. This is the one piece not yet fully decided in conversation but is the natural reading of
  "gas tank" — confirm before locking in a formula.
- **No more "fade."** `FADE_THRESHOLD`/`FADE_FLOOR`/`GRIT_FADE_RELIEF` (speed collapsing on low
  energy) have no meaning without a continuous energy value — remove them, don't repurpose them.
- **Aptitude needs a new home.** It used to cost energy ("a sprinter over a route runs out, not
  slower"). With no energy, the cleanest replacement is a direct `maxSpeed` penalty for a badly
  suited distance — untested, just the obvious mapping.

**What's actually committed right now** (the last checkpoint pushed before the reset): kicks became
a multi-charge resource (`RaceEntrant.kickCharges`, `Runner.kicksRemaining`, defaults to 1 for every
AI/harness entrant, player gets `KICK_CHARGES = 2`), kick strength moved to `Grit × jockeySkill`
(`KICK_JOCKEY_INFLUENCE`), and an empty-tank gate was added so urging/kicking can't fire for free at
0 energy. **This is a stepping-stone, not the target** — it still has the full continuous energy
bar, drain/recovery, urging, and the energy HUD (bar/chevrons/cause-tags) sitting underneath it,
none of which the owner wants anymore per the quotes above. The next session's job is to strip all
of that out and rebuild around charges as described above, not to keep layering on top of it.

**Full blast radius, mapped before the reset so it doesn't have to be re-traced:**
`sim/race/constants.ts` (the whole energy-economy block, `MAX_ENERGY`/`BASE_DRAIN`/
`BASE_RECOVERY`/`REST_RECOVERY_BASE`/`FADE_*`/`APTITUDE_DRAIN_PENALTY` all go), `sim/race/engine.ts`
(`Runner.energy`/`drainRate`/`recoveryRate`/`fadeRelief`/`energyRate`/`energyFactor` all go;
`stepRunner`'s whole energy section rewrites around a charge float; `RunnerSnapshot`/`RunnerView`
lose `energy`, keep/extend `kicksRemaining`), `sim/race/types.ts` (`EnergyFactor` likely removed
entirely — the elaborate "why is energy moving" HUD reporting doesn't have a place in a
charges-only model), `sim/race/ai.ts` (effort computation collapses to ~always-1 now that urging is
gone — most of `HOLD_EFFORT`/`ESTABLISH_GAIN`/the reserve-preservation logic becomes dead code),
`sim/race/recap.ts` (`energyLeft` narrative → `kicksLeft`, same "banked but unspent" idea),
`ui/raceScreen.ts` (drop the energy bar/chevrons/factor tags; tap-to-kick + hold-to-settle is the
whole control surface), and traits that referenced drain/recovery (**Iron Lungs**, **Quick
Recovery**, **Thirsty**, **Cruiser**, **Alert** — see TRAITS.md) each need a charge-regen-rate
equivalent, worked out fresh rather than assumed.

Verify with the usual discipline once rebuilt: `npm run harness` for Gate 1, `tools/margin-profile.ts`
and a fresh trace script for the tail, before declaring it done.

---

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

- **The speed scale.** ✅ **Done.** A winning 8f ran 64.4s against a real ~96s —
  25.0 yd/s where a thoroughbred tops out near 17.5. Every constant measured in
  real seconds (`BASE_SPEED`, `BASE_ACCEL`, drain, recovery, kick/fumble/green
  durations, the escape rate) now derives from one `TIME_SCALE = 1.43` lever in
  `constants.ts`, rather than the render layer dividing the error back out —
  which it no longer needs to. `npm run harness`: style balance and margins
  unchanged from baseline (within the harness's own fixed-seed noise), clock
  now 87–97s across divisions.
  <br><br>
  **This did NOT shrink margins**, correcting what this line originally
  claimed. That estimate assumed scaling `BASE_SPEED` *alone* — which would
  have been a balance-breaking partial fix, since every per-second drain/
  recovery rate would then apply for 1.43× longer real seconds per race. Done
  consistently instead (rates divide by `TIME_SCALE`, durations multiply by
  it, so behaviour per unit of race PROGRESS is unchanged), margin in lengths
  is `time_gap_seconds × speed_yd/s` — and both terms move oppositely by the
  same factor and cancel. Measured directly: 8th-place margin 74.7L before,
  75.2L after (`npm run margin-profile`). **The tail collapse below is
  entirely untouched by this step** — it is the energy floor's job, not the
  clock's.
  <br><br>
  One trap found and fixed by the harness, worth recording: `BASE_ACCEL` is
  yards/sec² — order-2 in time — so it needs `TIME_SCALE²`, not `TIME_SCALE`.
  Dividing it by the bare factor first let horses reach full speed over fewer
  yards than before, shrinking the fraction of the race spent scrambling for
  position, and frontRunner's win share quietly moved from 12.9% to 14.3%
  before the exponent was corrected. Reproduce either measurement with
  `npm run margin-profile` (`tools/margin-profile.ts`) and
  `npm run harness`.
- **The energy floor.** ✅ **Done, and it wasn't the floor curve itself.**
  Traced the worst seed in `margin-profile` directly
  (`tools/margin-profile.ts` still reproduces it): a front-runner crashed from
  93 to 0 energy by 12% of the race, then spent the remaining 88% locked
  between 0 and 14, permanently `outOfPosition` — 106 lengths behind at the
  wire. Not fading. Trapped. Two structural causes, both fixed in `engine.ts`:
  <br><br>
  1. The establish scramble was charged twice for the same thing — `ai.ts`
     already prices reaching your slot as a bounded effort spike
     (`ESTABLISH_GAIN`, up to `MAX_EFFORT`), and the misfit-driven drain
     penalty was charging the SAME distance again, at full strength, from
     tick one. `positional` now fades IN across `ESTABLISH_UNTIL` instead of
     snapping to full strength at the gate.
  2. Misfit cost the same whether a horse had 60 energy or 5 — so a horse
     that lost its slot AND its energy paid full price on both axes with no
     way back: too broke to afford fighting to position, denied the recovery
     to ever afford it, because being out of position was what suppressed
     that recovery. New `MISFIT_ENERGY_RELIEF_FLOOR` discounts the misfit
     PENALTY (not the in-position reward) once a horse is already this deep
     in trouble — inert above `FADE_THRESHOLD`, so it cannot change any race
     that never gets this bad.
  <br><br>
  A third, non-engine cause compounded both: `ai.ts`'s own reserve clause was
  subtracting up to a full 1.0 from effort as energy approached zero — a
  jockey on a beaten horse riding at literal minimum effort rather than
  moderating. Halved.
- **The full re-balance at lower noise.** ✅ **Done.** `BAND_DOWN`/`BAND_UP`
  (consistency) and `FORM_BASE_SPREAD`/`FORM_TEMPER_AMPLIFY` (daily form) cut
  by a third together, exactly as this line specified, followed by a
  compensating retune — because cutting noise alone reproduced precisely the
  failure this line predicts: style balance broke (frontRunner 10.1%, stalker
  8.3% FAIL, midPack 16.0%, closer 15.6%) as the patient styles' late-race
  edge stopped being washed out by chaos. `PHASE_PROFILES` re-tuned against
  the quieter baseline restored it — frontRunner 10.6%, stalker 11.3%,
  midPack 14.2%, closer 13.9%, all inside the harness's 30% bar. See the
  known issue below for the full before/after margin table.
- **A parameter sweep**, done by hand against a fast proxy rather than a grid
  script. A full `npm run harness` run costs ~115s regardless of the `RACES`
  env var (division sanity and pace-collapse don't scale with it), so a
  standalone copy of the harness's own `styleBalance()` method
  (same seed prefix, so numbers are directly comparable) at `RACES=250` gave
  a ~20s iteration loop for tuning `PHASE_PROFILES`, with the full harness run
  only to confirm the final choice. Not committed as a tool — it exists to
  answer "does this specific change move style balance," not as a permanent
  probe like `energy-profile` or `margin-profile`.
- **Re-verify Gate 1.** ✅ **Done**, at the new noise level. `npm run
  harness`: no running style dominates (all four within the 30% bar), every
  division winnable, dominance curve flat in the middle and steep at the ends
  (+5% edge → 27.5%, +40% edge → 92.0%), pace collapses still produce upsets
  (a lone front-runner's 20.2% collapses to 9.3% each when three duel).
- **Reconcile the animation with the simulation.** The gallop sheet is 24 frames
  of one gait; the sim has `intensity` and `drive` that it currently cannot
  express. Stride length no longer needs a render-side correction — it was
  derived from speed, and speed is now correct at the source — but the sheet
  still can't show a horse straining versus coasting at the same speed.

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

**What actually landed, and why it didn't repeat this table.** Every attempt
above tried to make the economy MORE SUSTAINABLE — which is exactly what
breaks it, because a closer's whole win condition is that the horses in front
of it fade. The energy-floor fix above did the opposite of that on purpose: it
never touches how much a horse in good shape drains or recovers, only the
horses already past `FADE_THRESHOLD` in a death spiral with no way out — inert
for the 90%+ of a race that never gets that bad. Confirmed it didn't repeat
the pattern: pace-collapse still passes exactly as before (a lone front-runner
at 20.2% collapses to 9.3% each when three duel — fading is still real and
still the upset mechanism). The noise cut is a separate lever again, and it
DID move style balance, in the direction this section predicts (patient
styles up once chaos stopped washing out their late-race edge) — the
compensating `PHASE_PROFILES` retune above is what put it back.

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

**Currently ~6 lengths between first and second**, down from 6–7. Real racing
is decided by 1–3, and 5+ is a rout. Still too wide, and the harness still
gates on it honestly — but every number below moved in the right direction
this pass, which is the first time that's been true rather than a trade of
one problem for another.

### The tail is still the bigger problem, and it is meaningfully better

Median margin behind the winner, 200 races, 8f open — reproducible with
`npm run margin-profile` (`tools/margin-profile.ts`):

| Place | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th |
|---|---|---|---|---|---|---|---|
| Original baseline | 4.1L | 8.9L | 13.0L | 17.4L | 24.6L | 42.1L | **74.7L** |
| After the speed-scale fix alone | 4.6L | 7.8L | 11.9L | 18.0L | 26.0L | 42.7L | **75.2L** |
| After the death-spiral fix, before noise cut | 5.6L | 9.6L | 13.6L | 18.8L | 27.8L | 45.1L | 65.0L |
| **After the full rebalance** | **3.7L** | **7.7L** | **11.8L** | **15.7L** | **23.8L** | **40.7L** | **60.0L** |

Last place down from 74.7L to 60.0L — about 20% — and every other place
tightened too, including the winning margin itself (4.1L → 3.7L). A real
eight-runner field still finishes inside about twenty lengths end to end;
ours strings out over sixty. Better, not solved.

This matters more than the winning margin because it is what a player actually
sees. A beaten horse is routinely reported as *distanced*, which reads as a
broken game rather than a bad ride.

**Both causes this section named are now addressed — see Phase 4.5.** The
speed scale was corrected first, and on its own it does NOT shrink margins
(margin is `time_gap × speed`, and both move oppositely by the same factor
under a consistent rescale) — that row above is the record of a prior,
now-corrected estimate on this page that claimed otherwise. The energy floor
turned out not to be the fade curve itself: traced directly, a front-runner
crashed to 0 energy by 12% of a race and spent 88% of it trapped, not fading —
see Phase 4.5 for the two structural causes and the fix. The daily-form /
consistency-band noise reduction the diagnosis below calls for is done too,
with the compensating style-balance retune it warned would be necessary.

**What's left to close the gap further** is not a new cause, just more of the
same kind of work: this pass corrected specific bugs (the double charge, the
bottomless recovery penalty, the AI's over-caution) and did one noise-and-retune
pass. A genuinely tighter target (2–3L) likely needs another iteration of the
same loop — cut noise further, re-verify style balance, re-check the tail — not
a new mechanism.

Deliberately not re-shelved after this pass: still reported on every harness
run so any regression is caught immediately, not rediscovered from scratch.

**The diagnosis that got us here, kept for the next iteration.** Margins and
style balance are coupled through variance:

- The dominant driver is **daily form**, fixed for the whole race and so
  compounding directly into the finishing gap. The consistency band and the
  effort-to-speed range matter less than expected — narrowing the speed range
  actually made margins *worse* in earlier testing.
- Cutting that variance tightens finishes but **lets systematic style
  advantages dominate** — confirmed again this pass: cutting `BAND_DOWN`/
  `BAND_UP` and `FORM_BASE_SPREAD`/`FORM_TEMPER_AMPLIFY` by a third alone (no
  compensation) broke style balance exactly as this line predicts (patient
  styles jumped once chaos stopped washing out their late-race edge; see
  Phase 4.5 for the numbers), and needed a `PHASE_PROFILES` retune to recover.
- That retune was done by hand against a fast style-balance proxy (Phase 4.5),
  not a true multi-parameter grid sweep. The next cut of noise should expect
  the same coupling and budget for the same retune-and-verify loop.

---

## Known issue — position costs more than it returns

✅ **Fixed in Phase 4.5** (the establish double-charge, the misfit energy
relief, and the softened AI reserve clause — see there for the code-level
fix). Kept here as the diagnosis record, with before/after numbers.

**The player-facing symptom was: stamina drains hard in the opening, and never
really comes back.** It read as a broken control, not a pacing decision — you
did not fail to hold your position, holding it simply did not pay for what
reaching it cost. Reproduce with `npm run energy-profile`
(`tools/energy-profile.ts`) — hands-off ride, 120 races, 8f open:

| style | 5% | 10% | 20% | 28% | 40% | 60% | 80% | 100% |
|---|---|---|---|---|---|---|---|---|
| **Before** — frontRunner | 55 | 39 | 32 | 32 | 33 | 34 | 32 | 24 |
| **After** — frontRunner | 65 | 49 | 30 | 28 | 27 | 27 | 23 | 18 |
| **Before** — stalker | 72 | 60 | 48 | 45 | 44 | 44 | 40 | 30 |
| **After** — stalker | 72 | 59 | 42 | 37 | 36 | 35 | 30 | 21 |
| **Before** — closer | 95 | 92 | 86 | 81 | 84 | 86 | 83 | 74 |
| **After** — closer | 93 | 88 | 80 | 74 | 77 | 83 | 81 | 73 |

Net energy/sec by phase, across all styles — **before**: establish −2.42/s,
cruise +0.09/s, stretch −0.64/s. **After**: establish −1.91/s, cruise **−0.01/s**
(the AI's own ride, not just the player's capped one — essentially break-even
now), stretch −0.48/s.

Front-runner holds noticeably more early (49 vs 39 at the 10% mark — the
double-charge fix) but finishes with less in reserve (18 vs 24) than before.
That is not a regression: fewer horses are getting trapped in the death spiral
and coasting out the back at minimum effort with energy left unspent: more of
them are genuinely racing all the way to the wire, which is what the reserve
figure should look like in a field that's actually contesting the finish.

**Two causes, both structural, not a tuning miss — the diagnosis, and what
fixed each:**

1. **The establish phase was charged twice for the same thing.** In `ai.ts`, a
   horse starting outside its preferred slot gets
   `effort = HOLD_EFFORT + drift × ESTABLISH_GAIN × urgency`, which clamps to
   `MAX_EFFORT` (1.0) for anything badly out of position. But the engine had no
   notion of "establishing" as a special case — it just saw high effort while
   `misfit` was still high, so `POSITION_COST_PENALTY` (extra drain for being
   out of position) charged *at the same time* as the effort spike. Fixed by
   fading `positional` IN across `ESTABLISH_UNTIL` in `engine.ts`, instead of
   it snapping to full strength at the gate.

2. **The cruise did not refund the reserve, even executed perfectly.** Worked
   by hand for a front-runner sitting in position, uncontested, at
   `HOLD_EFFORT` (0.55): drain ≈1.62/s, recovery ≈1.25/s — net **−0.37/s**, not
   the "must net positive" the comment above `HOLD_EFFORT` in `constants.ts`
   claimed. `BASE_DRAIN` (7.4) and `BASE_RECOVERY` (4.1) were far enough apart
   that even a full positional bonus stack didn't close the gap at that
   effort. Traced further to its worst case (`margin-profile`'s worst seed): a
   front-runner crashed to 0 energy by 12% of the race and spent 88% of it
   trapped at 0–14, permanently `outOfPosition` — not fading, unable to
   afford fighting back to its slot, and denied the recovery to ever afford
   it, because being out of position was what suppressed that recovery. Fixed
   with `MISFIT_ENERGY_RELIEF_FLOOR` in `constants.ts`: discounts the misfit
   PENALTY (not the in-position reward) once a horse is already below
   `FADE_THRESHOLD`, inert above it so no race that never gets this bad is
   affected.

A third cause, found while fixing the second: `ai.ts`'s own reserve clause was
subtracting up to a full 1.0 from effort as energy approached zero — riding a
beaten horse at literal minimum effort rather than moderating. Halved.

**So "getting into position" was never the broken step — a horse got there.**
What was broken is that position never paid back what it cost to reach, and
that a bad trip had no way back from it. Fixed together, verified against the
harness at each step rather than asserted — see Phase 4.5 for the full
before/after margin table this produced.

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
