# NEXT-STEP.md — Equalise style rows by tank COST, not by sum

**Scope: two changes. Nothing else.** Read §5 (Hard stop) before you start.
**Prerequisite reading:** [REBUILD.md](REBUILD.md) §1 (the rules) and §17 (the do-not list).

Current state on this branch: Gate 1 **10/12**, player parity **4/4**, `npm run check`
clean. B3, B4, B5, B6 and all five invariants pass. B1 and B2 fail, on front-runners
(5.9%) and `early` (7.9%) against a fair 12.5%.

---

## 1. The diagnosis, already done

Do not re-diagnose this. It cost about twenty-five measured iterations to find, and six
different constants were tried and were either inert or backwards:

| tried | result |
|---|---|
| `EASY_LEAD_RECOVER_BONUS` 0.9 → 1.6 → 2.4 | frontRunner 6.1% → 6.2% → 6.1%. Inert. |
| `EASY_LEAD_CLEAR_METRES` 12 → 4 → 2.5 | Inert. |
| `DRAIN_EXPONENT` 12 → 9 → 7 | **Backwards** — front-runners got worse (6.9% → 5.3%). |
| `RANK_SHELTER` 0.3 → 0.18 → 0.10 | Helps B1 but breaks B6 (margins 16.5L → 26L). |
| `KICK_MAX_BONUS` 0.22 → 0.16 → 0.12 | Barely moved it. |
| `MOMENT_SHIFT` amplitude reshaping | Moved the problem between Moments, never removed it. |

**The actual cause.** `STYLE_BASE` rows in `src/sim/race/pace.ts` all sum to the same
total, and that invariant was supposed to guarantee no style is inherently advantaged.
It does not, because tank drain is **convex**:

```
drain ∝ (pace / REFERENCE_PACE) ^ DRAIN_EXPONENT        DRAIN_EXPONENT = 12
```

A front-loaded curve therefore costs far more tank than a back-loaded one of *identical
sum*. `frontRunner` opens at 0.986 where `closer` opens at 0.957, and 12th-power
weighting turns that 3% pace gap into roughly **1.43× the drain**. Measured across 120
races:

```
style          %tiring   avgCondition
frontRunner      19.9        0.929
stalker           5.1        0.980
midPack           9.9        0.964
closer            1.5        0.996
```

Recovery bonuses cannot outrun a 43% drain penalty, which is exactly why every
`EASY_LEAD` value was inert.

**Equal sum is the wrong invariant. Equal cost is the right one.**

---

## 2. Change 1 — the equal-cost invariant

### The maths

Drain per second is `(speed / L) × TANK_RACE_COST × f(pace)`. A tick covers `dx = speed·dt`,
so drain per unit *distance* is `TANK_RACE_COST × f(pace) / L` — the speed cancels. Total
drain across a race is therefore just the mean of `f(pace)` over the race, and it is
computable from the row alone with no simulation:

```ts
cost(style) = mean over t in [0,1] of
              (interp(STYLE_BASE[style], t) / REFERENCE_PACE) ** DRAIN_EXPONENT
```

### What to implement

In `src/sim/race/pace.ts`:

```ts
/**
 * The tank a style's curve costs across a whole race, relative to reference pace.
 * Equal for every style by construction — see styleCost.test asserting it.
 */
export function styleCost(style: RunningStyle, steps = 2000): number;
```

Then adjust the four `STYLE_BASE` rows so their costs match. Use a **uniform offset per
row** — add the same δ to all five control points of a row — and solve for δ by bisection:

```
target = mean of the four current costs
for each style:
  bisect δ in [-0.030, +0.030] until |cost(row + δ) - target| < 1e-6
  apply δ, then round every control point to 3 decimals
```

A uniform offset preserves each row's *shape* (its archetype identity) and changes only
its overall height, which is the one thing that must move.

**Why this should fix it, and the number that says so:** lowering a row by δ costs it δ
of pace (linear) but saves it roughly `12δ` of tank (convex). The tank saving is an order
of magnitude larger than the speed loss, so an expensive front-loaded row gains far more
than it gives up.

### The test

In `src/sim/race/pace.test.ts`, **replace** the existing `every style row sums to the same
budget` test — that invariant is now known to be wrong — with:

```ts
it('every style costs the same tank across a race (the real invariant)', () => {
  const costs = RUNNING_STYLES.map((s) => styleCost(s));
  for (const c of costs) expect(c).toBeCloseTo(costs[0]!, 3);
});
```

**Keep** the other pace tests unchanged, especially:
- `front-runners start faster than closers`
- `closers finish at least as fast as front-runners`
- `the field spreads far enough for a clear lead to be possible` (spread > 0.028)

If the offsets break the spread test, the rows have converged too far — widen the two
extreme rows symmetrically about their own means and re-solve, rather than relaxing the
test. The field has to actually separate or `EASY_LEAD` stops firing (REBUILD.md §6.2).

---

## 3. Change 2 — the pace clamp is binding

Separately, and much smaller. `paceFactor` clamps to `PACE_MAX` (1.0), and one
combination now hits it:

```
frontRunner at t=0.25    0.980
MOMENT_SHIFT.early[1]   +0.022
                       = 1.002  ->  clamped to 1.000, losing 0.002
```

A bound clamp silently breaks the zero-sum guarantee (R5) for whichever Moment hits it —
`early` keeps its full negative lobe but loses part of its positive one. `frontRunner` +
`early` is precisely the weakest combination in the harness, so this may be contributing.

**Implement:** add a test asserting the clamp never binds for any style × moment × t:

```ts
it('the pace clamp never binds — a bound shift breaks zero-sum', () => {
  for (const style of RUNNING_STYLES) {
    for (const moment of MOMENTS) {
      for (let t = 0; t <= 1.0001; t += 0.005) {
        const raw = interp(STYLE_BASE[style], t) + interp(MOMENT_SHIFT[moment], t);
        expect(raw).toBeLessThanOrEqual(PACE_MAX + 1e-9);
        expect(raw).toBeGreaterThanOrEqual(PACE_MIN - 1e-9);
      }
    }
  }
});
```

If it fails, fix by **scaling `MOMENT_SHIFT` rows down** by the smallest factor that clears
it — scaling preserves zero-sum exactly. Do not clamp harder and do not raise `PACE_MAX`;
only a kick may exceed cruise (R1).

---

## 4. How to verify

In this order:

```bash
npm run check                 # lint + build + 74 tests. Must be clean.
npx tsx tools/sweep.ts 800    # fast style/moment proxy, ~60s
npm run harness               # full Gate 1, 1200 races, ~5 min
npm run ride-probe            # player parity
```

**Target:** Gate 1 12/12 with parity still 4/4.

`tools/sweep.ts` uses the same seeds and field construction as the harness's B1/B2, so its
numbers are directly comparable — use it to iterate and the full harness only to confirm.

---

## 5. HARD STOP

**Make these two changes. Run the checks. Report the numbers. Change nothing else.**

If Gate 1 does not reach 12/12 after the two changes above:

- **Stop.** Report which checks fail and their numbers.
- **Do not** start adjusting constants to close the gap.

That last rule is the whole point of this document. `src/sim/race/constants.ts` holds
about a dozen interacting levers, and this project has now failed four times by tuning
them one at a time without attribution — the removal commit that preceded this rebuild
called it "8+ hours of incremental patches". Every row in the table in §1 is a lever that
looked obvious and was inert or backwards. A partial result you can attribute is worth
more than a passing one you cannot.

### Do not touch

- Anything in `src/sim/race/constants.ts`. Both changes above are in `pace.ts` and the tests.
- `RANK_SHELTER`, `PRESS_*`, `EASY_LEAD_*` — all recently measured, all doing their job.
- `charges.ts` — parity is 4/4 and the charge economy was just reset from first principles.
- The five invariants in REBUILD.md §1. If a change would violate one, the change is wrong.
- `git commit` / `git push` unless the owner asks.

### When done

Update REBUILD.md: R5 and §6.2 both describe equal-sum as the style invariant, and that
is now superseded. Follow the existing convention in that file — strike the old text
through and put the measurement that replaced it underneath.
