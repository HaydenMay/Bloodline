# Bloodline Development History

A measured record of design iterations, failed attempts, and lessons learned.

**For context and debugging only** — this is the "why" behind current systems. See [ROADMAP.md](ROADMAP.md) for current phases and [REBUILD.md](REBUILD.md) for the active race simulation spec.

---

## ⛔ IMPORTANT

The race simulation described below **no longer exists in its original form** — AI, movement, constants, the charge economy and the Moment system were all deliberately removed and rebuilt multiple times after failed redesigns.

**[REBUILD.md](REBUILD.md) is the current specification.** Read it before touching anything under `src/sim/race/`.

Keep this document. It is the most valuable debugging resource in this repository: a complete record of what was tried, what it did to the numbers, and why it failed. REBUILD.md's "Do-not list" is drawn directly from these sections. Read them as evidence, never as code documentation.

---

## 📚 HISTORY — the energy economy was replaced with kick charges

**Superseded by [REBUILD.md](REBUILD.md). Kept as a measured record.**

The kick-charge rebuild itself is DONE and compiles/lints/tests clean. On top of it, WHEN a horse kicks has been split out from running style into its own independent `Moment` attribute (see the Moment history section further down) — that part is NOT yet balanced: style balance and pace-collapse both currently fail the harness, after a serious structural bug (effort commitment never coming back down) was found and fixed. Start there, not from scratch — the fix is done, the retune on top of it is not. Elsewhere still open: elite divisions no longer visibly tightening up. The owner's own words, kept for context — these supersede anything below in this doc that still describes the old model:

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
- **No continuous 0–100 energy value at all.** Not just hidden from the player — removed from the simulation. This affects every runner, AI included, since there is no separate resource left for AI riders to have either.
- **Kick charges are the only resource.** A small integer bank per horse. Tapping — any time, no separate "urge" — spends one charge and fires the existing kick mechanic (a temporary speed multiplier, `speedCap *= 1 + kickStrength`, lasting `KICK_BASE_DURATION`).
- **Kick strength = Grit × jockey skill.** Deliberately NOT scaled by how full the bank is — a horse with 3 charges banked and one with 0.2 kick equally hard; the bank only gates whether you can fire at all, never how hard.
- **Charges regenerate always**, never stuck, never negative — faster in a good spot for the horse's running style, slower out of it. Reuse the position-quality math already built this session (`frontPenalty`/`misfit`/`fit`/`RECOVERY_FLOOR` and friends in `engine.ts` — the whole "how fast do you refill" computation) — just retarget it at charge-regen rate instead of energy.
- **Holding (take a pull)** still settles the horse back (costs ground, as before) and now ALSO gives an extra boost to charge regen on top of the position bonus — a deliberate "bank a charge" move.
- **Stamina (the stat) sets REGEN RATE, continuously — not tank size.** Reversed from the first reading of "gas tank" above: capacity as an integer breakpoint (every N Stamina points = +1 charge) makes training feel dead everywhere except the breakpoint itself. Regen rate is continuous instead, so every point of Stamina always pays off immediately — same shape as `STAMINA_CHARGE_REGEN_INFLUENCE` used to scale `BASE_DRAIN`. Capacity (`CHARGE_CAPACITY`) is a **fixed constant for every horse**, set to 5 rather than 3 — races run 45–75s+ and scale with distance, so a field needs enough charges across establishing position, a mid-race response, and the finish without exhausting the resource early in a long route. Both numbers are first-pass and named explicitly in "Known issue" below for retuning.
- **No more "fade."** `FADE_THRESHOLD`/`FADE_FLOOR`/`GRIT_FADE_RELIEF` (speed collapsing on low energy) have no meaning without a continuous energy value — remove them, don't repurpose them.
- **Aptitude needs a new home.** It used to cost energy ("a sprinter over a route runs out, not slower"). With no energy, the cleanest replacement is a direct `maxSpeed` penalty for a badly suited distance — untested, just the obvious mapping.

**What's done now, matching the target design above:** the continuous energy value is gone entirely — `MAX_ENERGY`/`BASE_DRAIN`/`BASE_RECOVERY`/`REST_RECOVERY_BASE`/`FADE_*`/`APTITUDE_DRAIN_PENALTY` all removed from `constants.ts`. `Runner.energy`/`drainRate`/`recoveryRate`/`fadeRelief`/`energyRate`/`energyFactor` are gone from `engine.ts`; `stepRunner`'s energy section is rewritten around `chargeProgress` (a 0–1 float per horse that converts into a `kicksRemaining` integer at 1, capped at `CHARGE_CAPACITY`). `EnergyFactor` is removed from `types.ts` entirely — no HUD "why is it moving" reporting in a charges-only model. `ai.ts`'s energy-reserve effort throttle is gone (the establish/hold position-correction logic stays — it is navigational, not a budget, now). `recap.ts`'s `energyLeft` narrative became `kicksLeft`, same "banked but unspent" idea. `raceScreen.ts` dropped the energy bar/chevrons/cause-tags and the whole urge mechanic — **every tap now spends a kick charge, at any point in the race**, exactly as the owner specified; hold still takes a pull. The five traits that referenced drain/recovery (**Iron Lungs**, **Quick Recovery**, **Thirsty**, **Cruiser**, **Alert**) plus **Gate Rusher**'s early cost got charge-regen equivalents — see TRAITS.md, "The charge economy". Aptitude is now a direct `maxSpeed` penalty (`APTITUDE_SPEED_PENALTY`) rather than an energy cost.

Found and fixed along the way: the AI's kick condition (`race.progress >= kickAt`) stayed true every tick once crossed, with no "already kicked" guard in the engine — every AI horse would have burned its whole charge bank in a fraction of a second on entering its kick window rather than spending one. Fixed with a one-shot guard in `ai.ts`'s closure. The player side was never affected — the UI already consumed `kickPending` immediately per tap.

### Known issue — style balance broke with the charge rebuild

✅ **Fixed.** The real cause: `PHASE_PROFILES.frontRunner.late` was `-0.013`, tuned back in the original Phase 4.5 pass when a continuous energy fade ALSO existed to reinforce a front-runner's late-race slowdown. Removing fade entirely left that `-0.013` as an uncompensated penalty with nothing backing it up anymore, while every other style's positive late number went on working unopposed. Fixed by removing the now-unbacked penalty.

### Known issue — the player's own ride never committed in the stretch

✅ **Fixed.** `npm run ride-probe` surfaced this: the player's own controller rode at a FLAT `cruiseEffort` for the entire race, never ramping into the stretch commitment AI riders get. Effort feeds speed via `effortSpeed = MIN_EFFORT_SPEED + (1 - MIN_EFFORT_SPEED) * effort` — at `MIN_EFFORT_SPEED = 0.78`, riding the stretch at `cruiseEffort` (~0.5) versus an AI's commitment (~1.0) cost roughly 11% of top speed, which `KICK_MAX_BONUS` (8.5% at full strength) could not fully buy back regardless of timing.

Fixed by giving the player's default ride the AI's own establish/hold/commit curve (`baseRide`'s `effort`, not a flat constant) — input still MODULATES it (hold caps it down, tap fires a kick) but no longer replaces it outright.

### Known issue — spamming every charge out-earned a well-timed one

✅ **Fixed.** A mistimed kick's STRENGTH was already discounted by `windowFit` (`KICK_MIN_FIT` floor, `KICK_WINDOW_FALLOFF`), but its DURATION (`kickRemaining = KICK_BASE_DURATION`) was not — so a stream of weak mistimed kicks, refired the instant a new charge arrived, still covered most of the race at reduced strength and out-earned one strong kick held for its ~13s window on raw TIME COVERED, not strength.

Fixed with two changes: `KICK_MIN_FIT` lowered 0.35 → 0.05 (a badly mistimed kick is now genuinely weak, not a guaranteed 35% floor), and a new `KICK_MISTIMED_DURATION_FLOOR` (0.3) scales a kick's DURATION by the same `windowFit` its strength already used — a mistimed kick is now shorter as well as weaker.

---

## 📚 HISTORY — Moment: WHEN a horse kicks, split out from Style

**New independent attribute**, `Horse.moment` (`'early' | 'earlyMid' | 'midLate' | 'late'`, `data/index.ts`), added because the kick window used to be a fixed function of running style — every frontRunner peaked at the same point, every closer at another — which read as flat once you noticed it. Style (`STYLE_PROFILES`) now governs WHERE a horse sits in the pack only; Moment (`MOMENT_WINDOWS`, `MOMENT_PROFILES`, `sim/race/constants.ts`) governs WHEN its kick window opens and its passive phase-bonus curve peaks.

**A serious structural bug was found and fixed while building this.** The actual cause was `effort = Math.max(effort, commitment)` in `ai.ts` never coming back down once a horse commits. Under the old style-keyed system every style's commit point clustered together late (0.7-0.82), so nobody benefited much from committing "early" — the race was nearly over either way. Splitting Moment out spread commit points across the WHOLE race (0-80%), so an `early`-moment horse could commit at t=0 and simply stay at ~max effort for the entire race.

Fixed with `UNIVERSAL_FINAL_STRETCH` (0.9): commitment now holds only through a horse's own window, then EASES BACK to normal hold effort until this universal threshold, where every style commits together regardless of its own Moment.

---

## 📚 HISTORY — full redesign: HOLD / CRUISE / KICK replaces the effort dial

**Why a redesign, not another tuning pass.** After diagnosing the above issues, it was clear that `ai.ts`'s effort formula was fusing two things that should never have shared one number: fighting for pack position, and how hard a horse is actually running. Every fix leaked from one into the other.

**The new model (constants.ts, "Effort: HOLD / CRUISE / KICK").** A horse is in exactly one of three states, never a continuous dial:
- **CRUISE** — top speed. The default. Nothing to manage.
- **HOLD** — deliberately below top speed, for a large regen payoff. A horse fighting for its pack slot can't afford this; one that's comfortable, or banking for a Moment still well off, can.
- **KICK** — the ONLY thing that ever exceeds top speed. A bounded lunge, not a sustained gear.

Position is no longer a speed lever past a short, tightly bounded opening scramble. A style's identity now comes from WHEN it can afford to hold (naturally correlated with its Moment — frontRunner's window opens almost immediately, so it barely gets to hold; closer's is far off, so it holds early and drifts back to exactly where it wants to sit) and from the existing charge-regen mechanics.

Kick strength gained Burst as a factor (Grit x Burst x Jockey Skill), and `KICK_MAX_BONUS` was raised sharply (0.085 → 0.22) since it's now the only speed lever that exists at all.

---

## 📚 HISTORY — small UI wins and player-parity problem

Three small, low-risk fixes landed: a pre-race countdown (3-2-1, then "And they're off!") instead of snapping straight into motion; the race bar's Style "seat" text folded with Moment text; and a 1-3 arrow regen indicator next to the kick-charge dots.

**A bigger problem surfaced:** The owner's real play history showed roughly 50 manual race attempts, zero wins. Testing with `tools/ride-probe.ts` showed every strategy loses far below a fair share, including "kick in window" (a single, perfectly-timed kick): 7.3% win rate, beaten by 30.8L on average. This points to a fundamental player-vs-AI parity issue that's deeper than archetype fairness: a human tapping a touchscreen is competing against seven opponents that never mistime a kick and never forget to hold.

---

**Unit of estimation is a *work session*, not a calendar day** — pace depends entirely on how often we sit down with it. Sizes are honest, not optimistic.
