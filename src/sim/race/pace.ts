import type { Moment, RunningStyle } from '../../data/index.js';
import { PACE_MAX, PACE_MIN } from './constants.js';

/**
 * Pace curves — the whole of what Style and Moment do (REBUILD.md §6).
 *
 * A horse's pace curve is one number per tick: the fraction of its cruise speed
 * it is trying to run at right now. Style says WHERE it sits in the pack,
 * Moment says WHEN it spends, and between them they do exactly one thing —
 * select the shape of this curve.
 *
 * There are NO kick windows, no passive phase bonuses, and no AI commit ramps.
 * The previous build wired Moment to all three at once, and because the four
 * windows were different widths (`midLate` 35% of the race against `late`'s
 * 20%) one Moment compounded three separate advantages. `midLate` won 34-48%
 * against a fair 12.5%; `late` sat at 0.0% through five individually-correct
 * fixes. Zero-sum shift rows (below) make that structurally impossible.
 *
 * Two things fall out of driving position from pace rather than the reverse:
 *
 *  1. The pack order is EMERGENT. Nothing steers toward a slot. A closer runs
 *     at the back because it is genuinely running slower early — not because a
 *     drift-correction dial pushed it there and handed it free speed on the way.
 *     That deletes the bug class that ate the last three attempts.
 *
 *  2. The tank makes it self-balancing. A closer's early sag banks real energy,
 *     and that bank is why its late run exists; a front-runner's flat opening is
 *     why it fades. Pace collapse becomes physics rather than a mechanic bolted
 *     on top — DESIGN.md §4's "upsets come from pace, not from a fudge factor".
 */

/** Control points are sampled at these fractions of the race. */
const POINTS = 5;

/**
 * STYLE_BASE — where the horse sits.
 *
 * EVERY ROW SUMS TO THE SAME TOTAL, exactly as MOMENT_SHIFT sums to zero, and
 * for the same reason. The first harness run had frontRunner averaging 0.993
 * against closer's 0.975, which meant a front-runner was simply FASTER and had
 * to be rescued by fading, while a closer was simply SLOWER and had to be
 * rescued by not fading. Balance then hung on those two rescues cancelling to
 * three decimal places — frontRunner came out at 0.2% and closer at 25.4%.
 *
 * Equal-sum rows mean no style is inherently quicker. They differ only in WHEN
 * they spend the same budget, and the tank decides who converts it. Style
 * balance becomes a property of the structure rather than a tuning coincidence.
 *
 * The rows are near mirror images by design: a front-runner's curve is a
 * closer's read backwards.
 *
 * THE FOUR PEAKS ARE EVENLY SPACED ACROSS THE RACE, and that is the point of
 * the table. Two earlier versions failed because midPack was given the same
 * RISING shape as closer with a lower ceiling (0.980 against 0.986) — strictly
 * dominated, a weaker copy rather than a different archetype, and it measured
 * -30% off fair share through two separate attempts to fix it by moving its
 * numbers around. Making it flat instead did not help either: drain is convex,
 * so a flat curve is genuinely the cheapest to run, but races are decided at
 * the wire and a horse that is never quick is never quick THERE.
 *
 * Each style now peaks somewhere no other style does — gate, halfway, off the
 * turn, on the wire — so none can be dominated by another.
 *
 * The SPREAD matters as much as the sums. An earlier, narrower version of this
 * table spanned only 2.2% between the fastest and slowest opening, and the
 * field never separated as a result: measured, a front-runner drafted 17.3% of
 * the race against everyone else's 29-38%, and never once got far enough clear
 * to earn EASY_LEAD_RECOVER_BONUS, because any rival inside PRESS_RANGE_METRES
 * cancels it. It spent 39.8% of the race fatigued against a closer's 2.5%. The
 * positions these styles are named after have to actually happen on the track.
 *
 * Peaks are capped at 0.986 so that the largest MOMENT_SHIFT (+0.014) lands
 * exactly on PACE_MAX and the clamp in `paceFactor` never binds — a bound shift
 * would silently break the zero-sum guarantee (R5) for whichever Moment hit it.
 */
export const STYLE_BASE: Record<RunningStyle, readonly number[]> = {
  /** Peaks at the gate. Takes them along and tries to last. */
  frontRunner: [0.986, 0.98, 0.972, 0.962, 0.955],
  /**
   * The generalist. Sustains through the middle and keeps a little back.
   *
   * Tried and rejected: a mid-race PEAK (0.960/0.970/0.980/0.977/0.968), which
   * measured -41% to -47% off fair share. Peaking mid-race means fading at the
   * wire, and the wire is where races are decided. Rejected in the other
   * direction too: the same rising shape as closer with a lower ceiling, which
   * is strictly dominated. This sustained, slightly rising row measured best.
   */
  midPack: [0.95, 0.966, 0.981, 0.977, 0.981],
  /** Peaks off the turn. Sits handy, then quickens. */
  stalker: [0.958, 0.966, 0.974, 0.984, 0.973],
  /** Peaks on the wire. Everything kept for the run home. */
  closer: [0.957, 0.964, 0.974, 0.978, 0.982],
};

/**
 * MOMENT_SHIFT — when it spends.
 *
 * EVERY ROW MUST SUM TO ZERO (REBUILD.md R5). These are redistributions, not
 * bonuses: a Moment may change WHEN a horse spends its race, never how much it
 * has to spend. Asserted in pace.test.ts, and it is an invariant rather than a
 * tuning target — if a row stops summing to zero, that is a bug, not a balance
 * decision.
 *
 * ZERO-SUM IS NOT SUFFICIENT ON ITS OWN, which took a measurement to learn.
 * The first version of this table put `early`'s positive lobe at t=0 and
 * `late`'s at t=1, and both are dead ground: at the gate a horse is still
 * accelerating and is accel-limited rather than pace-limited, so it CANNOT use
 * a pace bonus there — but it is charged tank for it all the same — and a bonus
 * arriving on the wire has no race left to spend it in. Only `earlyMid` and
 * `midLate` had lobes in usable territory, and earlyMid measured +41% off fair
 * share against `early`'s -17%.
 *
 * So the lobes are spaced across the four usable quarters instead. "Early"
 * means the first quarter of the race, not the first stride.
 */
export const MOMENT_SHIFT: Record<Moment, readonly number[]> = {
  early: [+0.002, +0.014, +0.002, -0.009, -0.009],
  earlyMid: [-0.005, +0.007, +0.011, -0.004, -0.009],
  midLate: [-0.009, -0.007, +0.008, +0.014, -0.006],
  late: [-0.009, -0.009, -0.005, +0.011, +0.012],
};

/** Linear interpolation across a control-point table, `t` in [0, 1]. */
export function interp(points: readonly number[], t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const scaled = clamped * (POINTS - 1);
  const i = Math.min(POINTS - 2, Math.floor(scaled));
  const frac = scaled - i;
  return points[i]! + (points[i + 1]! - points[i]!) * frac;
}

/**
 * The pace a horse is trying to run at, as a fraction of its cruise speed.
 *
 * `t` is the horse's OWN progress (`distance / totalMetres`), never the
 * leader's. Sampling Moment timing against the leader's clock was a real bug in
 * the previous build — a horse running behind has not covered as much of its
 * own race as the leader has of theirs, so its curve was being read off the
 * wrong clock entirely. Do not reintroduce it.
 */
export function paceFactor(style: RunningStyle, moment: Moment, t: number): number {
  const base = interp(STYLE_BASE[style], t) + interp(MOMENT_SHIFT[moment], t);
  return base < PACE_MIN ? PACE_MIN : base > PACE_MAX ? PACE_MAX : base;
}

/**
 * The average pace a style holds across a whole race.
 *
 * Equal for every style by construction (see STYLE_BASE), and asserted in
 * pace.test.ts. REFERENCE_PACE is set to this number, so the average horse
 * running its own race is the horse the tank is calibrated against.
 */
export function averagePace(style: RunningStyle): number {
  return STYLE_BASE[style].reduce((a, b) => a + b, 0) / STYLE_BASE[style].length;
}
