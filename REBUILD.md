# REBUILD.md — Race Simulation, Ground-Up Rebuild

**Status:** planned, not started. **Audience:** the implementing agent.
**Companions:** [DESIGN.md](DESIGN.md) · [TRAITS.md](TRAITS.md) · [ROADMAP.md](ROADMAP.md)

---

## 0. How to use this document

This is a **specification, not a discussion**. Every number here is a decided first-pass
value. Build exactly what is written, in the order in §15, and verify each step against its
stated acceptance criteria before moving to the next.

Where this document conflicts with `DESIGN.md`, `ROADMAP.md` or a code comment, **this
document wins** — those predate the rebuild and describe systems that no longer exist.

Three things you must not do:

1. **Do not invent a mechanic that is not in this document.** The previous three attempts
   failed because systems accumulated. If something seems missing, it was cut on purpose.
2. **Do not tune a constant before §16's harness passes for the step you are on.** Numbers
   here are first-pass and expected to move — but only against measurements, never by feel.
3. **Do not commit or push.** The owner will say when.

---

## 1. Non-negotiable rules

These are invariants. They are enforced by tests in §16, not by good intentions. Every past
failure in this project violated one of them.

### R1 — One speed pipeline, five factors, one owner each

A runner's speed is computed in exactly one place, from exactly five factors:

```
target = cruise(horse)      // §4.1  the ceiling, from the Speed stat
       × preRace            // §10   condition · morale · form · going · distance — FROZEN at the gate
       × pace               // §6    the pace curve, plus HOLD.  Range [0.920, 1.000]
       × kick               // §8    the ONLY factor that may exceed 1.0.  Range [1.000, 1.060]
       × fatigue            // §5.4  the tank running dry.  Range [0.880, 1.000]
```

Nothing else in the codebase may write to speed. No positional bonus, no catch-up multiplier,
no phase profile, no moment lift, no style bonus applied outside these five.

### R2 — The kick is hard-clamped and never stacks

Overlapping kicks take the **maximum**, never the sum. The final kick factor is clamped to
`1.0 + KICK_MAX_BONUS` before it enters the pipeline. Ten stacked bonuses and one bonus
produce the identical ceiling.

> **This is the fix for the 2x-launch bug.** Four multiplicative modifiers
> (`KICK_STYLE_BONUS` × `KICK_MOMENT_BONUS` × `CLEAR_FIELD_SCALE` × `windowFit`) with no
> ceiling produced horses at double speed, worst on a closer running from behind because the
> catch-up term grew with the deficit — a positive feedback loop. Modifiers may change how
> *easily* a horse reaches the cap. They may never change where the cap is.

### R3 — There is no catch-up speed mechanic. Ever.

A horse that is behind gets no speed bonus of any kind. If a comeback is wanted, it comes
from the **tank** (§5): a horse that sat off the pace genuinely banked energy, so its late run
is real physics. Any mechanic that reads "how far behind am I" and returns a speed number is
forbidden.

### R4 — Position is an output, not an input

No runner steers toward a pack slot. No drift correction, no position-quality multiplier, no
`ESTABLISH_UNTIL` scramble. A horse's place in the field is a **consequence** of the pace it
chose. A closer sits last because it is running slower, not because a dial pushed it there.

### R5 — Moment is zero-sum

`MOMENT_SHIFT` rows (§6.3) must each sum to approximately zero across the race. No Moment may
be inherently faster than another; they may only differ in **when** they spend. Asserted in
§16 as a unit test, not a tuning target.

### R6 — One conserved quantity

The tank (§5) is the only resource. Kick charges are a **quantised view of the tank**, not a
separate pool. Running hard drains it, kicking drains it, sitting off the pace refills it.
There is no second budget anywhere.

### R7 — `sim/` stays pure

No imports from `render/`, `ui/`, `save/`. No `window`, `document`, `localStorage`,
`requestAnimationFrame`, `Math.random`. Enforced by `eslint.config.js` — do not weaken that
rule. All randomness goes through `createRng` from `sim/rng.ts`.

### R8 — Deterministic

Same seed, same field → byte-identical outcome, forever. This is what makes the harness
meaningful. Never introduce wall-clock time or unseeded randomness into `sim/`.

---

## 2. What exists, and what you are building

### Reuse untouched

| File | Why |
|---|---|
| `src/sim/rng.ts` | Seeded RNG, forkable. Correct as-is. |
| `src/render/**` | Track, camera, minimap, sprite sheet, gallop rig. Only unit renames (§3). |
| `src/data/traits.ts` | Trait catalogue. Trait *effects* get new homes (§13.7). |
| `src/save/**` | Does not persist horses yet. **No migration needed.** |

### Rewrite completely

| File | Current state | Target |
|---|---|---|
| `src/sim/race/constants.ts` | 8-line placeholder | Every constant in §13 |
| `src/sim/race/engine.ts` | Stubs that `throw` | The simulation |
| `src/sim/race/pace.ts` | *does not exist* | Pace curves (§6) |
| `src/sim/race/rider.ts` | *does not exist* | AI + player ride logic (§11) |
| `src/sim/race/types.ts` | Type shells | Real types |
| `tools/harness.ts` | `throw` | Gate 1 suite (§16) |
| `tools/ride-probe.ts` | `throw` | Player-parity probe (§16.3) |
| `tools/probe.ts` | `throw` | Single-race trace (§16.4) |

### Modify

| File | Change |
|---|---|
| `src/sim/types.ts` | `Horse`: drop `aptitudes`, add `preferredDistance` + `moment` |
| `src/sim/horse.ts` | Replace `rollAptitudes` with `rollPreferredDistance`; add `rollMoment` |
| `src/data/index.ts` | Drop `DISTANCE_BANDS`; keep `MOMENTS`; add `MOMENT_WEIGHTS_BY_STYLE` |
| `src/ui/raceScreen.ts` | Metres, new snapshot fields, remove the `try/catch` throw |
| `src/ui/infoBox.ts` | Aptitude grades → preferred-length line |
| `src/ui/main.ts` | Race config in metres; drop the moment-window stub |
| `src/render/track.ts` | Yards → metres |

### Do not build in v1

Blocking, lane contention, traffic trouble, the jockey chat rail, the glossary. §18.

---

## 3. Units and the clock

**The simulation works in metres and seconds. So does the render layer.** There is no
conversion boundary anywhere, and no `TIME_SCALE` lever — race duration falls directly out of
`BASE_SPEED`.

> Deleting `TIME_SCALE` also deletes a known trap: it was order-1 in time, but `BASE_ACCEL` is
> order-2 (m/s²) and needed `TIME_SCALE²`. Getting that wrong silently moved front-runner win
> rate by 1.4 points. With no scale lever, the bug cannot exist.

### Target durations

`BASE_SPEED = 21.0 m/s`; average pace factor across a race ≈ 0.98, so ≈ 20.6 m/s effective.

| Race | Metres | Duration |
|---|---|---|
| Early-game short | 600–900 | 29–44 s |
| Mid | 1200–1400 | 58–68 s |
| 8f / one mile | 1609 | ~78 s |
| Long route | 2400 | ~117 s |

The owner's spec: *most races 600–900m; 8f should sit at 60–90s.* Both satisfied.

### Render renames

Mechanical, no behaviour change.

| File | From | To |
|---|---|---|
| `render/track.ts` | `yardToScreen(yards, cam)` | `metreToScreen(metres, cam)` |
| `render/track.ts` | `Camera.pixelsPerYard` | `Camera.pixelsPerMetre` |
| `render/track.ts` | `drawDistanceMarkers(…, totalYards)` | `(…, totalMetres)`, markers every 200 m |
| `ui/raceScreen.ts` | `HORSE_YARDS = 2.7` | `HORSE_METRES = 2.47` |
| `ui/raceScreen.ts` | `STRIDE_YARDS` | `STRIDE_METRES = HORSE_METRES * 3` |
| `ui/raceScreen.ts` | `PULL_UP_WALK = 1.9` | `PULL_UP_WALK = 1.74` |
| `ui/raceScreen.ts` | `visibleYards = 46` | `visibleMetres = 42` |
| `ui/raceScreen.ts` | `YARDS_PER_FURLONG` | **delete** — the HUD counts down in metres |

`MAX_STRIDE_RATE = 0.9` and `SPRITE_PER_RIG_UNIT` are unitless. Leave them.

**A length = 2.4 metres.** Used only by `recap.ts` for margins.

---

## 4. The speed pipeline

### 4.1 Cruise — the ceiling

```ts
cruise(horse) = BASE_SPEED * (1 - SPEED_STAT_SPAN / 2 + SPEED_STAT_SPAN * horse.stats.speed / 100)
```

With `SPEED_STAT_SPAN = 0.08`, the entire 0–100 Speed range spans **±4%**.

> This looks far too small. It is correct, and it is the fix for the "winning margins are too
> wide" issue that has been open since Phase 4.5. Over 1609 m, a 1% speed edge is 16 m ≈ 6.7
> lengths. Real winning margins are 0–5 lengths. A field within one division spans ~17 Speed
> points → 1.4% → ~9 lengths across all eight horses. That is a believable race.
>
> It also delivers `DESIGN.md` §4's dominance curve directly: a 5% stat edge buys 0.4% speed
> (almost nothing, as specified); a 40% edge buys 3.2% ≈ 21 lengths (dominance, as specified).

### 4.2 Acceleration

Speed approaches `target` rather than snapping to it:

```ts
accel(horse) = BASE_ACCEL * (1 - BURST_ACCEL_SPAN / 2 + BURST_ACCEL_SPAN * horse.stats.burst / 100)

// per tick, dt = 1 / TICK_HZ
if (speed < target) speed = Math.min(target, speed + accel * dt);
else                speed = Math.max(target, speed - accel * DECEL_MULT * dt);
```

`BASE_ACCEL = 3.0 m/s²`, `BURST_ACCEL_SPAN = 0.6` (so 0–100 Burst → 0.7×–1.3×),
`DECEL_MULT = 1.5` (slowing down is easier than speeding up).

Burst therefore owns the gate break and how fast a kick actually takes effect — exactly its
job in `DESIGN.md` §2 — without ever touching top speed.

---

## 5. The energy tank

**The tank is the conserved quantity that makes pace matter.** It is never shown as a bar. The
player sees it only as charge dots (§5.5).

> The previous rebuild removed energy entirely at the owner's request and, in doing so, removed
> the only thing that made speed cost anything. The roadmap's own diagnosis #5: *"Effort has no
> cost in this economy — the actual root cause."* This design keeps the owner's UI (charges
> only, no stamina bar) while restoring the conserved quantity the sim needs.

### 5.1 State

`tank` is a float, starts at `TANK_START = 1.0`, clamped to `[0, 1]`.

### 5.2 Drain — superlinear in pace, distance-independent

```ts
const progressPerSecond = speed / totalMetres;
const drain = progressPerSecond * TANK_RACE_COST
            * Math.pow(paceFactor / REFERENCE_PACE, DRAIN_EXPONENT);
```

Draining against **race progress** rather than wall-clock seconds is what makes one set of
constants work for a 600 m dash and a 2400 m route. A horse holding constant pace `p` for a
whole race spends exactly `TANK_RACE_COST × (p / REFERENCE_PACE) ^ DRAIN_EXPONENT`, whatever
the distance.

`DRAIN_EXPONENT = 12` is the whole game. At just 2.5% above reference pace, drain is 34%
higher. That steepness is why going too fast early is genuinely punished, and therefore why
pace collapse produces upsets on its own — `DESIGN.md` §4's *"upsets come from pace, not from
a fudge factor."*

### 5.3 Recovery

```ts
const staminaFactor = 1 - STAMINA_RECOVER_SPAN / 2
                        + STAMINA_RECOVER_SPAN * horse.stats.stamina / 100;
const recover = progressPerSecond * TANK_RECOVER_RATE * staminaFactor
              * (drafting ? 1 + DRAFT_RECOVER_BONUS : 1);

tank = clamp01(tank + (recover - drain) * dt);
```

Both `drain` and `recover` are already per-second rates (they carry the
`progressPerSecond` term), so the tick applies them with a plain `* dt`.

Stamina sets **regen rate, continuously** — never tank size. Every point of Stamina pays off
immediately, with no breakpoint where training feels dead. This matches the owner's stated
intent recorded in `ROADMAP.md`.

Worked check with the §13 constants, average stamina, no drafting:

| Pace held all race | Drain | Recover | Net over race | Outcome |
|---|---|---|---|---|
| 1.000 (flat out) | 4.04 | 3.00 | **−1.04** | empties exactly at the wire |
| 0.975 (reference) | 3.00 | 3.00 | **0.00** | holds steady |
| 0.950 (sitting off) | 2.19 | 3.00 | **+0.81** | banks (caps at full) |

A front-runner that leads throughout arrives on empty and fades. A closer arrives with a full
bank. Neither is scripted; both fall out of one formula.

### 5.4 Fatigue

```ts
fatigue = tank >= FATIGUE_START
  ? 1.0
  : FATIGUE_FLOOR + (1 - FATIGUE_FLOOR) * (tank / FATIGUE_START);
```

`FATIGUE_START = 0.15`, `FATIGUE_FLOOR = 0.88`. Smooth ramp, never a cliff. An emptied horse
runs 12% below cruise — the largest single penalty in the game, which is what makes emptying
the worst thing that can happen to you.

### 5.5 Charges are the tank, quantised

```ts
charges = Math.min(CHARGE_CAPACITY, Math.floor(tank / KICK_TANK_COST));
```

`KICK_TANK_COST = 0.15`, `CHARGE_CAPACITY = 5`:

| tank | 1.00 | 0.75 | 0.60 | 0.45 | 0.30 | 0.15 | 0.14 |
|---|---|---|---|---|---|---|---|
| dots | 5 | 5 | 4 | 3 | 2 | 1 | 0 |

The last dot goes out at exactly the point fatigue begins to bite. **The dots are an honest
readout of the tank with no extra instrumentation** — which is why §12 can make them the whole
of the player's information problem.

Firing a kick subtracts `KICK_TANK_COST` from the tank directly. Nothing else is deducted, and
there is no separate charge counter to keep in sync.

> This is also what makes kick-spam self-limiting, closing the hole the previous build had
> where AI riders were never charge-gated at all. Five kicks costs 0.75 of tank, so a spammer
> empties and fades. No cap on kicks is needed, and none is wanted — the owner: *"If a player
> wants to use their kicks then let them."*

---

## 6. Pace curves — how Style and Moment work now

**Style and Moment do exactly one thing between them: select the shape of a pace curve.** No
kick windows, no phase-bonus curves, no commit ramps, no `UNIVERSAL_FINAL_STRETCH`.

> The old Moment system wired one attribute to three systems at once (kick window, passive
> bonus, AI commit point), and the four windows were different widths — `midLate` got 35% of
> the race, `late` got 20%. `midLate` won 34–48% against a fair 12.5%; `late` sat at **0.0%**
> through five individually-correct fixes, because by the time its window opened the field was
> 150–200 m clear and closing that inside the remaining 200 m needs double the leader's speed.
> Zero-sum shift rows (R5) make that structurally impossible.

### 6.1 The function

```ts
// pace.ts
export function paceFactor(style: RunningStyle, moment: Moment, t: number): number;
```

`t` is **the horse's own progress** (`distance / totalMetres`), never the leader's. Sampling
against the leader's clock was a real bug in the previous build; do not reintroduce it.

Both tables hold five control points at `t = 0, 0.25, 0.5, 0.75, 1.0`, linearly interpolated:

```ts
paceFactor = clamp(
  interp(STYLE_BASE[style], t) + interp(MOMENT_SHIFT[moment], t),
  PACE_MIN, PACE_MAX
);
```

### 6.2 `STYLE_BASE` — where the horse sits

```ts
export const STYLE_BASE: Record<RunningStyle, number[]> = {
  frontRunner: [1.000, 0.998, 0.990, 0.985, 0.992],
  stalker:     [0.975, 0.980, 0.988, 0.996, 1.000],
  midPack:     [0.965, 0.972, 0.984, 0.995, 1.000],
  closer:      [0.948, 0.958, 0.975, 0.994, 1.000],
};
```

Read the front-runner row against §5.3: it holds ~0.99 average, which drains ~23% more than it
recovers. It leads because it is fast early and it fades because that cost is real.

### 6.3 `MOMENT_SHIFT` — when it spends

Each row **must sum to ≈ 0** (R5). These are redistributions, not bonuses.

```ts
export const MOMENT_SHIFT: Record<Moment, number[]> = {
  early:    [+0.012, +0.008, -0.004, -0.008, -0.008],
  earlyMid: [-0.004, +0.012, +0.006, -0.006, -0.008],
  midLate:  [-0.008, -0.006, +0.008, +0.010, -0.004],
  late:     [-0.010, -0.008, -0.004, +0.008, +0.014],
};
```

### 6.4 HOLD — the player's second verb

`HOLD_DELTA = -0.030` is added to the pace factor, floored at `HOLD_FLOOR = 0.920`. It costs
ground immediately and banks tank fast (§5.3). It is a *deliberate* move, not a state the AI
sits in permanently.

### 6.5 Moment assignment

`MOMENT_WEIGHTS_BY_STYLE` in `data/index.ts`, rolled at generation. Weighted so archetypes stay
sensible without being fixed — two horses of one style can still peak at different points.

```ts
export const MOMENT_WEIGHTS_BY_STYLE: Record<RunningStyle, Record<Moment, number>> = {
  frontRunner: { early: 0.55, earlyMid: 0.30, midLate: 0.10, late: 0.05 },
  stalker:     { early: 0.10, earlyMid: 0.25, midLate: 0.40, late: 0.25 },
  midPack:     { early: 0.15, earlyMid: 0.30, midLate: 0.30, late: 0.25 },
  closer:      { early: 0.02, earlyMid: 0.08, midLate: 0.30, late: 0.60 },
};
```

---

## 7. Distance preference

**Replaces the three-band aptitude system entirely**, per the owner: *"a start on the horse that
assigns them to a preferred race length in a range… gives an easier understanding to the player."*

Delete `Aptitudes`, `DISTANCE_BANDS`, `bandFor()`, `rollAptitudes()`. Nothing persists them yet,
so there is no migration.

### 7.1 The type

```ts
// sim/types.ts
export interface DistancePreference {
  /** Metres. Lower bound of the sweet spot. */
  min: number;
  /** Metres. Upper bound of the sweet spot. */
  max: number;
}
```

Displayed verbatim: **“Preferred Length 600–800 m”**.

### 7.2 Generation

```ts
function rollPreferredDistance(rng: Rng): DistancePreference {
  const centre = rng.range(DIST_CENTRE_MIN, DIST_CENTRE_MAX);   // 700 .. 2400 m
  const width  = rng.range(DIST_WIDTH_MIN,  DIST_WIDTH_MAX);    // 200 .. 700 m
  return {
    min: Math.round((centre - width / 2) / 25) * 25,
    max: Math.round((centre + width / 2) / 25) * 25,
  };
}
```

Rounded to 25 m so the label reads cleanly.

### 7.3 The factor, and the narrow/wide trade

```ts
export function distanceFactor(pref: DistancePreference, metres: number): number {
  const width = pref.max - pref.min;
  const narrowness = 1 - clamp01((width - DIST_WIDTH_MIN) / (DIST_WIDTH_MAX - DIST_WIDTH_MIN));
  const peak = DIST_PEAK_BASE + DIST_PEAK_NARROW_BONUS * narrowness;

  if (metres >= pref.min && metres <= pref.max) return peak;

  const outside = metres < pref.min ? pref.min - metres : metres - pref.max;
  const t = clamp01(outside / DIST_TOLERANCE);
  return peak - (peak - DIST_FLOOR) * t;
}
```

**Range width is a real horse quality, and it is a trade, not a tier.** A narrow specialist
(200 m) peaks at 1.020 but falls off a cliff outside it. A versatile horse (700 m) peaks at
1.000 and handles anything. Neither is strictly better — exactly the shape `TRAITS.md` asks
for. Out of distance bottoms out at `DIST_FLOOR = 0.960`, a 6% penalty against a narrow
specialist in its range: a sprinter over a route gets beaten, decisively.

### 7.4 UI

`ui/infoBox.ts` — replace the three-grade `aptitudes` block under `<p class="ib-section">Distance</p>`:

```html
<p class="ib-section">Distance</p>
<div class="ib-dist">
  <span class="ib-k">Preferred Length</span>
  <span class="ib-v">${horse.preferredDistance.min}–${horse.preferredDistance.max} m</span>
</div>
```

Keep the existing `.ib-apt` CSS or add `.ib-dist` alongside it in `style.css`.

---

## 8. The kick

The only thing that may exceed cruise (R1), hard-clamped and non-stacking (R2).

### 8.1 Strength

```ts
strength = clamp01(
    KICK_GRIT_WEIGHT   * horse.stats.grit      / 100
  + KICK_BURST_WEIGHT  * horse.stats.burst     / 100
  + KICK_JOCKEY_WEIGHT * horse.jockeySkill     / 100
);
```

`0.45 / 0.30 / 0.25`. Grit × Burst × jockey skill, per the owner's stated intent. **Not scaled
by the tank** — a horse on 5 charges and one on 1 kick equally hard. The tank gates *whether*
you can fire, never *how hard*.

### 8.2 Shape and clamp

```ts
// elapsed = seconds since this kick fired
function kickShape(elapsed: number): number {
  if (elapsed < 0 || elapsed > KICK_DURATION) return 0;
  if (elapsed < KICK_RAMP) return elapsed / KICK_RAMP;                     // ramp in
  const decayFrom = KICK_DURATION - KICK_DECAY;
  if (elapsed > decayFrom) return 1 - (elapsed - decayFrom) / KICK_DECAY;  // decay out
  return 1;                                                                // hold
}

kickFactor = 1 + Math.min(KICK_MAX_BONUS, KICK_MAX_BONUS * strength * kickShape(elapsed));
```

`KICK_DURATION = 4.0 s`, `KICK_RAMP = 0.5 s`, `KICK_DECAY = 1.5 s`, `KICK_MAX_BONUS = 0.060`.

Over 4 seconds at 20.6 m/s, a full-strength kick is worth roughly **+4 m ≈ 1.7 lengths**.
Meaningful, and nothing like a launch.

### 8.3 Firing

- Costs `KICK_TANK_COST` off the tank, immediately. Requires `charges >= 1`.
- Firing while a kick is live **refreshes** its timer. It does not stack (R2) and it does not
  add a second kick to the pipeline. It still costs a charge — that is the player's call.
- No windows. No per-window caps. No "already kicked" guard. Fire any time you have a charge.

---

## 9. Drafting

The only piece of pack interaction in v1. **Drafting affects the tank, never speed.**

```ts
// A runner drafts if another runner is close ahead, in the same lane band.
drafting = fieldContains(other =>
     other.distance > self.distance
  && other.distance - self.distance <= DRAFT_RANGE_METRES
  && Math.abs(other.lane - self.lane) <= DRAFT_LANE_TOLERANCE
);
```

`DRAFT_RANGE_METRES = 4.0`, `DRAFT_LANE_TOLERANCE = 1`. Effect: `DRAFT_RECOVER_BONUS = 0.20`
applied to recovery in §5.3. Automatic — never a player action.

Lanes exist **only as a render concern in v1.** Assign each runner a fixed lane at the gate
(spread across `LANE_COUNT = 8`) so the field is visually separated, and read it for drafting.
Nothing blocks anything. `RunnerSnapshot.blocked` stays in the type for UI compatibility and is
always `false`.

---

## 10. Pre-race factors

**Computed once at the gate, then frozen for the whole race.** One value per runner. This is
the single biggest simplification in the rebuild: five things that used to poke at speed
mid-race now collapse to one number that never moves.

```ts
preRace = conditionFactor   // 0.985 .. 1.000   from horse.condition
        * moraleFactor      // 0.990 .. 1.005   from horse.morale
        * formFactor        // §10.1
        * goingFactor       // 0.980 .. 1.005   going vs traits (§13.7)
        * distanceFactor    // §7.3
        * deliveryFactor;   // §10.2
```

### 10.1 Daily form — driven by Temper

```ts
const amplitude = FORM_BASE_SPREAD + FORM_TEMPER_AMPLIFY * (1 - horse.stats.temper / 100);
formFactor = 1 + rng.normal(0, amplitude);
```

`FORM_BASE_SPREAD = 0.004`, `FORM_TEMPER_AMPLIFY = 0.010`. Low Temper → bigger swings in both
directions, exactly as `DESIGN.md` §2 specifies.

### 10.2 Consistency failures

Three forms, all rolled at the gate, all reported in the recap:

```ts
// 1. Slow or fumbled start — costs early position
fumbledStart = rng.chance(FUMBLE_BASE * (1 - horse.stats.consistency / 100));
//    → speed starts at 0 and the horse holds PACE_MIN for FUMBLE_DURATION seconds

// 2. Off-colour — running below true ability
offColour = rng.chance(OFF_COLOUR_BASE * (1 - horse.stats.consistency / 100));
deliveryFactor = offColour ? OFF_COLOUR_PENALTY : 1.0;
//    → surfaced on RunnerSnapshot.offColour so the HUD shows it DURING the race,
//      per DESIGN.md §4: "never silently"

// 3. Green moments — drift, costing ground
//    → rolled at the gate as 0-2 timed events; each applies PACE_MIN for GREEN_DURATION
```

`FUMBLE_BASE = 0.22`, `OFF_COLOUR_BASE = 0.16`, `OFF_COLOUR_PENALTY = 0.985`,
`FUMBLE_DURATION = 1.6 s`, `GREEN_DURATION = 1.2 s`.

Consistency owning essentially all in-race variance is what makes elite divisions tighten up
emergently — `DIVISION_BANDS` already rolls championship consistency at 70–92 against maiden's
22–46, so no "less randomness up here" rule is needed. §16 gates on this.

---

## 11. The rider

One module, `sim/race/rider.ts`, serving both AI and player. The player's horse runs **the same
competent ride** as every opponent; input modulates it, never replaces it.

> The old build had the player riding a flat cruise while AI got a commit curve, costing ~11%
> of top speed — which no kick could buy back. That is most of why the owner went 0-for-50.
> The base ride is shared by construction here so it cannot drift apart again.

### 11.1 Base ride

```ts
export interface RideDecision {
  gear: 'CRUISE' | 'HOLD';
  fireKick: boolean;
}

export function baseRide(runner: Runner, view: RaceView, rng: Rng): RideDecision;
```

Two decisions per tick, nothing else:

**Gear.** `HOLD` if the horse is below its charge target and is not yet in its spending phase;
otherwise `CRUISE`. Concretely: `HOLD` when `tank < HOLD_TRIGGER_TANK` **and**
`ownProgress < SPEND_PHASE_START[style]`.

**Kick.** Fire when `charges >= 1` and `ownProgress >= nextPlannedKick`.

### 11.2 Planned kicks — archetype-distinct by construction

Precomputed at the gate. **This is the deferred "3.5" item from `ROADMAP.md`, built in from the
start rather than added later** — the old AI ran one identical algorithm for every archetype
and fired 5–6 kicks per race regardless of style or moment, which is why no amount of tuning
separated the archetypes.

```ts
export const KICK_PLAN: Record<RunningStyle, { count: number; from: number; to: number }> = {
  frontRunner: { count: 3, from: 0.05, to: 0.55 },  // front-loaded and decisive
  stalker:     { count: 2, from: 0.45, to: 0.85 },  // one or two tactical moves
  midPack:     { count: 4, from: 0.25, to: 0.95 },  // spread out
  closer:      { count: 2, from: 0.70, to: 0.98 },  // patient, concentrated, late
};
```

Kick points are spread evenly across `[from, to]`, then **shifted by the horse's Moment**: the
window `[from, to]` is nudged earlier for `early` and later for `late` by
`MOMENT_KICK_SHIFT = 0.08` per step away from the middle. Style sets the *pattern*; Moment sets
the *timing*.

### 11.3 Jockey error — the difficulty ladder

```ts
const error = 1 - runner.horse.jockeySkill / 100;
```

Applied at the gate (deterministically, from the seeded rng) to each planned kick:

| Error | Effect |
|---|---|
| Timing jitter | each kick point offset by `rng.normal(0, JOCKEY_JITTER * error)` |
| Wasted kick | `rng.chance(JOCKEY_WASTE * error)` → one kick point moved to a useless spot |
| Missed hold | `rng.chance(JOCKEY_MISS_HOLD * error)` → skips `HOLD` for that race |

`JOCKEY_JITTER = 0.18`, `JOCKEY_WASTE = 0.35`, `JOCKEY_MISS_HOLD = 0.30`.

**This is the fix for "the AI was too smart."** `horse.jockeySkill` already exists on every
horse and `DIVISION_BANDS` in `sim/horse.ts` already scales it — maiden 30–60, championship
65–95. Nothing was ever reading it during a race. A maiden rival now mistimes badly; a
championship rival barely errs. The difficulty ladder falls out of data that already exists,
and beating a maiden field feels different from beating a championship field for a *mechanical*
reason.

### 11.4 Player input

```ts
export function playerRide(base: RideDecision, input: PlayerInput): RideDecision {
  return {
    gear: input.takingBack ? 'HOLD' : base.gear,
    fireKick: input.kickPending || base.fireKick,
  };
}
```

Tap fires a kick immediately; hold forces `HOLD`. Everything else is the shared base ride, so
a hands-off player is competitive and an attentive one is better. Gated by §16.3.

---

## 12. Jockey skill — what it buys

Three jobs, all information or execution, never raw speed.

1. **Autopilot quality** (§11.2–11.3). Your jockey's skill drives your own horse's base ride.
   A good jockey means handing it over is viable.
2. **AI fallibility** (§11.3). The same stat on opponents, which is the difficulty ladder.
3. **Instrument fidelity.** The tank is real in the sim; what the HUD reports of it is filtered
   by jockey skill.

For (3), keep it minimal in v1 — the owner's confusion was the *old* control scheme (urging +
double-tap + a stamina bar to read), not a general need for instrumentation, and the charge
dots are already an honest tank readout (§5.5):

```ts
// RunnerSnapshot carries the true values; the HUD degrades them by jockey skill.
readoutLag   = JOCKEY_READOUT_LAG * (1 - jockeySkill / 100);  // seconds of staleness on the dots
readoutNoise = JOCKEY_READOUT_NOISE * (1 - jockeySkill / 100); // flicker on the regen arrows
```

`JOCKEY_READOUT_LAG = 0.8`, `JOCKEY_READOUT_NOISE = 0.35`. A top jockey's dots are exact and
instant; a poor one's lag and flicker.

Do not build the "he's got another one in him" advance cue in v1 — it belongs with the jockey
chat rail (§18).

---

## 13. Constants reference

Everything below goes in `src/sim/race/constants.ts`. **All values are first-pass.** Tune only
against §16 measurements.

### 13.1 Clock and scale
```ts
export const TICK_HZ = 30;
export const BASE_SPEED = 21.0;          // m/s at 50 Speed, reference pace
export const SPEED_STAT_SPAN = 0.08;
export const BASE_ACCEL = 3.0;           // m/s²
export const BURST_ACCEL_SPAN = 0.6;
export const DECEL_MULT = 1.5;
export const METRES_PER_LENGTH = 2.4;
```

### 13.2 Pipeline bounds — R1/R2 enforcement
```ts
export const PACE_MIN = 0.940;
export const PACE_MAX = 1.000;
export const HOLD_DELTA = -0.030;
export const HOLD_FLOOR = 0.920;
export const KICK_MAX_BONUS = 0.060;
export const FATIGUE_FLOOR = 0.880;
export const FATIGUE_START = 0.15;
/** Harness invariant. No runner may ever exceed cruise * preRace * this. */
export const ABSOLUTE_SPEED_CEILING = 1.060;
```

### 13.3 Tank
```ts
export const TANK_START = 1.00;
export const REFERENCE_PACE = 0.975;
export const DRAIN_EXPONENT = 12;
export const TANK_RACE_COST = 3.00;
export const TANK_RECOVER_RATE = 3.00;
export const STAMINA_RECOVER_SPAN = 0.50;
export const DRAFT_RECOVER_BONUS = 0.20;
export const KICK_TANK_COST = 0.15;
export const CHARGE_CAPACITY = 5;
```

### 13.4 Kick
```ts
export const KICK_DURATION = 4.0;
export const KICK_RAMP = 0.5;
export const KICK_DECAY = 1.5;
export const KICK_GRIT_WEIGHT = 0.45;
export const KICK_BURST_WEIGHT = 0.30;
export const KICK_JOCKEY_WEIGHT = 0.25;
```

### 13.5 Distance preference
```ts
export const DIST_CENTRE_MIN = 700;
export const DIST_CENTRE_MAX = 2400;
export const DIST_WIDTH_MIN = 200;
export const DIST_WIDTH_MAX = 700;
export const DIST_PEAK_BASE = 1.000;
export const DIST_PEAK_NARROW_BONUS = 0.020;
export const DIST_FLOOR = 0.960;
export const DIST_TOLERANCE = 500;       // metres outside the range to reach the floor
```

### 13.6 Pre-race, rider, drafting
```ts
export const FORM_BASE_SPREAD = 0.004;
export const FORM_TEMPER_AMPLIFY = 0.010;
export const FUMBLE_BASE = 0.22;
export const FUMBLE_DURATION = 1.6;
export const OFF_COLOUR_BASE = 0.16;
export const OFF_COLOUR_PENALTY = 0.985;
export const GREEN_DURATION = 1.2;

export const HOLD_TRIGGER_TANK = 0.80;
export const MOMENT_KICK_SHIFT = 0.08;
export const JOCKEY_JITTER = 0.18;
export const JOCKEY_WASTE = 0.35;
export const JOCKEY_MISS_HOLD = 0.30;
export const JOCKEY_READOUT_LAG = 0.8;
export const JOCKEY_READOUT_NOISE = 0.35;

export const DRAFT_RANGE_METRES = 4.0;
export const DRAFT_LANE_TOLERANCE = 1;
export const LANE_COUNT = 8;
```

### 13.7 Traits — where the five homeless ones land

`TRAITS.md` lists five traits that referenced the deleted drain/recovery model, plus Gate
Rusher's early cost. Rehome them as **tank** modifiers, never speed modifiers (R1):

| Trait | New effect |
|---|---|
| Iron Lungs | `TANK_RECOVER_RATE` ×1.12 for this horse |
| Quick Recovery | `DRAFT_RECOVER_BONUS` ×2 for this horse |
| Thirsty | `TANK_RECOVER_RATE` ×0.90 |
| Cruiser | `DRAIN_EXPONENT` −2 (flatter cost curve at pace) |
| Alert | `FUMBLE_BASE` ×0.4 |
| Gate Rusher | `paceFactor` +0.015 for `t < 0.15`, then −0.010 for `t < 0.4` |

Conditions traits (Mudder, Firm Specialist, All-Weather) feed `goingFactor` in §10. Every other
trait is out of scope for v1 — do not wire them.

---

## 14. File-by-file contracts

### `src/sim/types.ts`
```ts
// REMOVE: Aptitudes, and the `aptitudes` field on Horse.
// ADD:
export interface DistancePreference { min: number; max: number }

export interface Horse {
  // …unchanged fields…
  style: RunningStyle;
  moment: Moment;                        // ADDED — restored, see §6.5
  preferredDistance: DistancePreference; // ADDED — replaces aptitudes
  // …unchanged fields…
}
```

### `src/data/index.ts`
```ts
// REMOVE: DISTANCE_BANDS, DistanceBand.
// KEEP:   DIVISIONS, RUNNING_STYLES, MOMENTS, FIELD_SIZE, COAT_IDS, WORLD_POPULATION.
// ADD:    MOMENT_WEIGHTS_BY_STYLE (§6.5).
// Update the MOMENTS doc comment: Moment now selects a pace-curve shape, not a kick window.
```

### `src/sim/horse.ts`
Replace `rollAptitudes` with `rollPreferredDistance` (§7.2); add `rollMoment(rng, style)`
reading `MOMENT_WEIGHTS_BY_STYLE`. Everything else — `DIVISION_BANDS`, `rollStats`,
`rollPotential`, `rollTraits`, `generateStarterSix`, `generateWorld` — is unchanged.

In `generateStarterSix`, replace the `bands` shuffle with a spread of preferred-distance
centres so the six starters still cover short/middle/long.

### `src/sim/race/types.ts`
```ts
export interface RaceConfig {
  metres: number;        // was: furlongs
  going: Going;
  hype: number;
  seed: string;
}
// REMOVE: bandFor(), ControlInput, RunnerView, RaceView-as-stub.
// KEEP:   Going, RaceEntrant, RaceEvent, RaceResult, RaceOutcome — recap.ts depends on them.
// RaceResult keeps kicksLeft, sectionals, hadTrouble, fumbledStart, offColour.
//   hadTrouble is always false in v1 (no blocking, §9).
```

### `src/sim/race/pace.ts` *(new)*
Exports `STYLE_BASE`, `MOMENT_SHIFT`, `paceFactor(style, moment, t)`, and `interp`.

### `src/sim/race/rider.ts` *(new)*
Exports `RideDecision`, `planKicks(horse, rng)`, `baseRide(...)`, `playerRide(...)`.

### `src/sim/race/engine.ts`
The simulation. Keeps the existing exported shape so `ui/raceScreen.ts` needs minimal change:

```ts
export interface LiveRace {
  step(): boolean;                 // false when the race is over
  snapshot(): RaceSnapshot;
  outcome(): RaceOutcome;
  readonly totalMetres: number;    // was totalYards
  readonly config: RaceConfig;
}
export function createRace(entrants: RaceEntrant[], config: RaceConfig): LiveRace;
export function simulateRace(entrants: RaceEntrant[], config: RaceConfig): RaceOutcome;
```

`RunnerSnapshot` — keep every field `raceScreen.ts` already reads, so the UI does not need
rewriting. Repoint the ones whose meaning changed:

| Field | v1 meaning |
|---|---|
| `distance`, `speed`, `lane`, `rank`, `coat`, `finished`, `finishTime` | unchanged |
| `effort` | the current pace factor, remapped to 0–1 for the render rig's `drive` |
| `kicking` | a kick is live |
| `kicksRemaining` | `floor(tank / KICK_TANK_COST)`, capped (§5.5) |
| `chargeProgress` | fractional part toward the next dot |
| `regenMult` | `recover / drain` this tick — drives the existing 1–3 arrow indicator |
| `blocked` | **always `false`** in v1 (§9) |
| `drafting` | §9 |
| `offColour` | §10.2 |

`RaceOutcome.paceRating` must stay "late sectional ÷ early sectional" — `recap.ts`'s `paceOf()`
already reads it that way and needs no change.

### `src/sim/race/recap.ts`
One change only: line 159's comment references the old capacity. `CHARGE_CAPACITY` is still 5,
so `me.kicksLeft > 2` remains correct. Import the constant instead of hardcoding it.

### `src/ui/raceScreen.ts`
- Delete the `try/catch` around `createRace` (lines 144–149) — it exists only to throw.
- Metre renames (§3).
- Restore the commented-out charge dots (lines 476–482) using `CHARGE_CAPACITY`.
- Leave the moment-window HUD block (lines 417–427) **deleted, not restored** — there are no
  windows any more (§6).
- Replace the `YOUR MOMENT` label with nothing; keep `TAKING A PULL`.
- `TICK_HZ` (line 702) imports from `constants.ts` rather than the local stub.

### `src/main.ts`
- `config: { metres: 1400, going: 'good', hype: 0.65, seed: … }`.
- Delete the `lo`/`hi` moment-window stub (lines 58–62) and the `.rb-moment` block; replace with
  the horse's preferred-length text.

---

## 15. Build order

Each step must compile (`npm run build`) and lint (`npm run lint`) before the next.
**Do not proceed past a failed acceptance check.**

### Step 1 — Types and data
`sim/types.ts`, `data/index.ts`, `sim/horse.ts` per §14.
**Accept:** `npm run build` clean. `generateHorse` produces a `moment` and a
`preferredDistance`; no reference to `aptitudes` or `DISTANCE_BANDS` remains anywhere.

### Step 2 — Constants
All of §13 into `sim/race/constants.ts`.
**Accept:** builds; every constant in §13 present with its stated value.

### Step 3 — Pace curves
`sim/race/pace.ts` per §6.
**Accept:** a unit test asserts each `MOMENT_SHIFT` row sums to within ±0.001 of zero (R5), and
`paceFactor` stays inside `[PACE_MIN, PACE_MAX]` for all 16 style×moment pairs across
`t = 0 … 1` in steps of 0.01.

### Step 4 — The tank
Tank drain/recover/fatigue/charges as pure functions, before any engine exists.
**Accept:** a unit test reproduces §5.3's table — flat 1.000 pace empties the tank to within
±0.05 of zero over a simulated race; flat 0.975 holds within ±0.05 of start; flat 0.950 banks.

### Step 5 — Engine
`sim/race/engine.ts`. Fixed 30 Hz tick. Per tick, per runner, in this order:

1. `pace` ← `paceFactor(style, moment, ownProgress)` + `HOLD_DELTA` if holding
2. `kick` ← §8.2, clamped
3. `fatigue` ← §5.4
4. `target` ← `cruise × preRace × pace × kick × fatigue`  ← **the only place speed is written**
5. `speed` ← approach `target` at `accel` (§4.2)
6. `distance += speed × dt`
7. tank ← §5.2 / §5.3
8. rank, drafting, finish detection

**Accept:** `simulateRace` returns a full `RaceOutcome` for a field of 8. Same seed twice →
identical JSON. No runner's speed ever exceeds `cruise × preRace × ABSOLUTE_SPEED_CEILING`.

### Step 6 — Rider
`sim/race/rider.ts` per §11, wired into the engine.
**Accept:** kick counts per race differ measurably by style — front-runner ~3 and front-loaded,
closer ~2 and late. Not the flat 5–6 for everyone the old build produced.

### Step 7 — Harness
`tools/harness.ts` per §16. **Write this before tuning anything.**
**Accept:** runs, reports all nine checks, and is honest about failures.

### Step 8 — Tune to Gate 1
Iterate constants against §16 until every check passes. Record each change and its measured
effect in `ROADMAP.md` — the history of *what was measured* is the most valuable artifact this
project has.
**Accept:** §16's full suite green.

### Step 9 — Reconnect the UI
Only now. `raceScreen.ts`, `main.ts`, `infoBox.ts`, `render/track.ts` per §14 and §3.
**Accept:** `npm run check` clean; a race runs on screen; charge dots track the tank; the
preferred-length line reads correctly in the info box.

### Step 10 — Ride probe
`tools/ride-probe.ts` per §16.3, then tune the player side only.
**Accept:** §16.3 passes.

### Step 11 — Report
Update `ROADMAP.md`: tick Phase 1, record the final harness numbers, note what was deferred.
**Then stop and report to the owner. Do not commit or push.**

---

## 16. The harness — Gate 1

`npm run harness`. `RACES` env var controls volume; default 1200.

**Nothing reconnects to the UI until this passes.** This is the single process change that
separates this rebuild from the three that failed — every previous attempt tuned against a
running game and could never attribute a change to a cause.

### 16.1 Invariants — unit tests, never tuned

| # | Check |
|---|---|
| I1 | Determinism: same seed → byte-identical `RaceOutcome` |
| I2 | Speed ceiling: no runner, any tick, any race, exceeds `cruise × preRace × ABSOLUTE_SPEED_CEILING` |
| I3 | Moment zero-sum: every `MOMENT_SHIFT` row sums to 0 ± 0.001 |
| I4 | Tank bounds: `tank` stays in `[0, 1]` always |
| I5 | Pace bounds: the pace factor stays in `[HOLD_FLOOR, PACE_MAX]` always |

I2 is the guard against the 2x-launch bug ever returning. It must fail loudly, naming the
runner and tick.

### 16.2 Balance — tuned to pass

Field of 8, styles assigned round-robin so there are two of each. Win rate is measured
**per horse**, so a fair share is **12.5%** — the same basis as every historical number in
`ROADMAP.md`, so results stay directly comparable.

| # | Check | Bar |
|---|---|---|
| B1 | Style balance | all four styles within ±30% relative of 12.5% → **8.75%–16.25%** |
| B2 | Moment balance | all four moments within the same band |
| B3 | Pace collapse | a lone front-runner wins ~20%; with three front-runners in the field each drops to ≤11% |
| B4 | Dominance curve | +5% stat edge → 25–32% win rate; +40% edge → ≥85% |
| B5 | Division sanity | every division winnable; championship winning margins **tighter** than maiden |
| B6 | Margin profile | median 8th-place margin ≤ **20 lengths** (48 m) |

B6 is the long-open "winning margins are too wide" issue. §4.1's tight `SPEED_STAT_SPAN` is the
intended fix; if B6 fails, that constant is the first lever, not the last.

B3 is the load-bearing one. If pace collapse does not produce upsets, the tank is not doing its
job and `DRAIN_EXPONENT` / `TANK_RACE_COST` are where to look — not the kick.

### 16.3 `npm run ride-probe` — player parity

150 races, player horse in a normal field, one strategy per run:

| Persona | Behaviour |
|---|---|
| `hands off` | no input at all — pure autopilot |
| `spam` | tap the instant a charge exists |
| `save late` | hold everything, spend from 75% on |
| `spend early` | spend everything before 40% |
| `well ridden` | hold while banked, spend across the horse's own strong phase |

**Pass conditions:**
1. `well ridden` ≥ 12.5% wins — a good ride earns a fair share.
2. `well ridden` beats `spam` by ≥ 3 points — timing beats mashing.
3. `hands off` ≥ 7% — the autopilot is competent, not a punishment.
4. No persona is beaten by more than 20 lengths on average — no blowouts.

Condition 3 is the direct answer to 0-for-50 with a best of 2nd. Condition 1 is the direct
answer to "riding well should matter."

### 16.4 `npm run probe` — single-race trace

Not a gate; a diagnostic. Dumps per-tick `pace`, `kick`, `fatigue`, `tank`, `charges`, `speed`,
`rank` for every runner in one seeded race. Every historical bug in this project was found by
tracing one race directly rather than reasoning about aggregates. Build it early and use it.

---

## 17. Do-not list

Each of these is a specific, documented failure from the previous three attempts.

| Do not | Because |
|---|---|
| Add a multiplicative kick modifier without a clamp | The 2x-launch bug. R2. |
| Add a catch-up speed bonus | It is a positive feedback loop. R3. |
| Let position buy speed | Free speed nobody was paying for — roadmap diagnosis #5. R4. |
| Reintroduce kick windows | Different widths made `midLate` 34–48% and `late` 0.0%. §6. |
| Give Moment its own passive speed bonus | One attribute driving three systems is what broke it. §6. |
| Compare Moment timing to the leader's progress | Use each horse's own progress. §6.1. |
| Give the AI a ride the player cannot get | ~11% of top speed, unrecoverable. §11. |
| Cap kicks per window | Owner: *"If a player wants to use their kicks then let them."* The tank is the cap. §8.3. |
| Make kick strength scale with the tank | Bank gates *whether*, never *how hard*. §8.1. |
| Add a `TIME_SCALE` lever | Order-1 vs order-2 trap. §3. |
| Tune before the harness passes | This is how all three previous attempts failed. §15 step 8. |
| Add a second resource | R6. |
| Commit or push | The owner will say when. |

---

## 18. Deferred — the maybe pile

Explicitly agreed as out of scope for v1. Do not build any of these.

- **Blocking, lane contention, traffic trouble.** Drafting only in v1 (§9). Layer traffic on
  afterwards and re-run §16 — owner: *"There were too many variables with everything included."*
- **Jockey chat rail.** A side panel of Persona-style chat bubbles where the jockey calls the
  race and flags what the horse is doing. Owner: *"that can be in the maybe do pile lol."*
  Wanted, not v1.
- **Advance "he's got another one in him" cue.** Belongs with the chat rail.
- **Glossary of mechanics.** Owner: *"long term… but that's down the road stuff."*
- **Auto-race / skip to result** (`DESIGN.md` §4). Trivial once `simulateRace` exists — the
  headless path already produces the full outcome.
- **Metres/yards display toggle.** `SaveSettings.distanceUnits` already exists; the sim is
  metric, so this is a display-layer concern for later.

---

## 19. Decision log

For the record, so nothing here reads as arbitrary later.

| Decision | Rationale |
|---|---|
| Hidden tank, charges as its face | Keeps the owner's "no stamina bar" while restoring the conserved quantity. Removing energy removed the cost of speed — the documented root cause. |
| Style + Moment → pace curve | Kills windows, phase bonuses and commit ramps in one move. Position becomes an output. |
| Zero-sum `MOMENT_SHIFT` | Structurally prevents one Moment being inherently faster. The `late`-at-0.0% failure cannot recur. |
| Preferred length in metres | Owner's own idea, and better than a fourth band: no extra aptitude grades, no schema change, continuous rather than a cliff, and it reads plainly. |
| Drafting only, no blocking | Owner. Keeps every early measurement attributable to one cause. |
| Shared autopilot, input modulates | Owner chose parity option 1. Prevents player/AI ride drift by construction. |
| Jockey drives instruments, autopilot **and** AI error | Owner's idea, extended. Makes jockey skill visible and fixes "the AI was too smart" from data already in the horse. |
| Harness first, gate on it | Owner. The single process change that separates this from three failed attempts. |
| 8f ≈ 78 s; most races 600–900 m | Owner: 8f felt long; early-game races should be short. |
| Metres end to end | Owner thinks in metres. A conversion boundary is a permanent bug source. |
