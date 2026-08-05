import type { Moment } from '../../data/index.js';
import {
  CHARGE_CAPACITY,
  CHARGE_REGEN_SECONDS,
  CHARGE_REGEN_SETTLED,
  CHARGE_START,
  KICK_OUT_OF_WINDOW,
} from './constants.js';

/**
 * Kick charges — the PLAYER's resource, and the only one they spend.
 *
 * Deliberately separate from the tank (tank.ts), which is the jockey's and
 * which the player never sees or touches. The two were combined at first —
 * charges were the tank quantised — and that made a kick cost stamina, so
 * spending a charge could lose more ground than it gained and hoarding beat
 * riding. The owner's call, and the right one: "Kicks should not take away from
 * tank. Kicks should always reward players."
 *
 * So a kick here costs exactly one charge and nothing else. What limits how
 * many a horse fires is the regen rate and the cooldown between efforts, not
 * its stamina. Charges regenerate ALWAYS, faster when the horse is settled or
 * sheltered — which is what makes taking a pull a real tactical move rather
 * than just giving up ground.
 */

export interface ChargeState {
  /** Whole charges in the bank, 0..CHARGE_CAPACITY. */
  count: number;
  /** Fraction of the way to the next one, 0..1. Drives the HUD's fill wedge. */
  progress: number;
}

export function startingCharges(): ChargeState {
  return { count: Math.min(CHARGE_CAPACITY, CHARGE_START), progress: 0 };
}

/**
 * Advance the bank by one tick.
 *
 * `settled` covers every way a horse is having an easier time of it — taking a
 * pull, drafting, or dictating an unpressed lead. All of them refill faster.
 */
export function regenCharges(state: ChargeState, dt: number, settled: boolean): void {
  // A full bank holds NO stored progress. Pinning it at 1 while full meant that
  // spending a charge was refunded on the very next tick — progress was already
  // at the threshold, so it immediately rolled over into a new charge and a
  // horse at capacity effectively had unlimited kicks. Measured: a mashing ride
  // fired 7.4 kicks from a bank of three on a 60-second regen and finished the
  // race still full, which is arithmetically impossible and was the real reason
  // volume kept beating timing.
  if (state.count >= CHARGE_CAPACITY) {
    state.progress = 0;
    return;
  }
  const seconds = CHARGE_REGEN_SECONDS * (settled ? CHARGE_REGEN_SETTLED : 1);
  state.progress += dt / seconds;
  while (state.progress >= 1 && state.count < CHARGE_CAPACITY) {
    state.progress -= 1;
    state.count += 1;
  }
  if (state.count >= CHARGE_CAPACITY) state.progress = 0;
}

/** Spend one. Returns false if the bank is empty. */
export function spendCharge(state: ChargeState): boolean {
  if (state.count < 1) return false;
  state.count -= 1;
  return true;
}

/**
 * The window shapes — where each Moment's kick is worth most, and how sharply.
 *
 * EQUAL AREA, DIFFERENT SHAPE. That is the whole design, and it resolves a real
 * tension between two things that both matter.
 *
 * Fairness first: the previous build ran windows of 25%, 35%, 35% and 20% of
 * the race, so a `midLate` horse simply got a third more opportunity than a
 * `late` one, for no reason anybody chose. midLate won 34-48% against a fair
 * 12.5% and late sat at 0.0% through five separate attempts to fix it. Whatever
 * the windows look like, they have to be worth the same.
 *
 * But equal WIDTHS — the obvious way to get there — make all four Moments feel
 * like the same mechanic with the numbers shuffled, which is the flatness
 * splitting Moment out from Style was meant to cure in the first place.
 *
 * So every window pays the SAME at its peak, and what differs is how big a
 * target you have to hit. An `early` horse is forgiving: anywhere in half the
 * race produces something close to its best. A `late` horse pays exactly the
 * same, but only inside a window a quarter that size. Riding them is a
 * genuinely different job, and neither is worth more than the other for a rider
 * who finds the moment.
 */
interface WindowShape {
  /** Where the peak sits, as a fraction of the horse's own race. */
  centre: number;
  /** Half-width of the bump. Narrow means fierce. */
  width: number;
}

/**
 * Every window sits FULLY INSIDE the race — `centre` +/- `width` never crosses
 * 0 or 1. A window running past the wire or opening before the gate has the
 * overhanging part of its lift silently clipped, which quietly breaks the equal
 * area the whole scheme rests on. `charges.test.ts` catches it if it ever does.
 */
const WINDOW_SHAPE: Record<Moment, WindowShape> = {
  /** Broad and gentle. Better for half the race, never by much. */
  early: { centre: 0.26, width: 0.26 },
  earlyMid: { centre: 0.46, width: 0.21 },
  midLate: { centre: 0.66, width: 0.17 },
  /** Narrow and savage. Half again as strong, for a quarter of the race. */
  late: { centre: 0.865, width: 0.135 },
};

/**
 * The lift at every window's peak. THE SAME FOR ALL FOUR.
 *
 * The fairness constant, and it took two attempts to find the right one. The
 * first was equal AREA under each window, with narrow windows made
 * proportionally fiercer to compensate — mathematically fair and wrong in
 * practice, because a horse fires four POINTS, not an integral. Sampling a
 * narrow, sharp bump lands near its peak; sampling a broad, flat one lands near
 * its average. Measured: `early`, the broadest, came out at -38% off fair share.
 *
 * Equal peaks make every Moment worth the same at its best, and leave WIDTH
 * doing something better than arithmetic: it sets how FORGIVING the timing is.
 * An `early` horse is generous — anywhere in half the race will do. A `late`
 * horse pays exactly the same, but only if you find a much smaller target.
 * Which of those a horse is becomes a real quality you can read off it and
 * ride to, rather than a number that quietly decides races for you.
 */
const WINDOW_PEAK_LIFT = 0.45;

/** Raised cosine: 1 at the centre, 0 at the edges, smooth throughout. */
function bump(t: number, centre: number, width: number): number {
  const d = Math.abs(t - centre) / width;
  if (d >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * d));
}

/**
 * How much a kick fired here is worth, as a multiplier on its base strength.
 *
 * Never zero: a badly mistimed kick is weak, not wasted. The owner's rule that
 * a player may spend their charges as they see fit, well or badly, still holds
 * — this only decides what they get for it.
 */
export function kickWindowBonus(moment: Moment, ownProgress: number, style?: string): number {
  const shape = WINDOW_SHAPE[moment];
  if (style === 'midPack') {
    // Mid-pack gets flat bonus with no diminishing returns outside window
    // Baseline 33% + moment peak 45% = 78% at moment (vs 75% for others)
    const baseline = 0.33;
    return baseline + WINDOW_PEAK_LIFT * bump(ownProgress, shape.centre, shape.width);
  }
  return KICK_OUT_OF_WINDOW + WINDOW_PEAK_LIFT * bump(ownProgress, shape.centre, shape.width);
}

/** The integral of a Moment's lift. Larger for wider windows, by design. */
export function windowArea(moment: Moment, steps = 2000): number {
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    total += (kickWindowBonus(moment, t) - KICK_OUT_OF_WINDOW) / steps;
  }
  return total;
}

export function windowPeak(moment: Moment): number {
  return kickWindowBonus(moment, WINDOW_SHAPE[moment].centre);
}

/** The stretch worth calling a horse's window, for the HUD and for the AI. */
export function momentWindow(moment: Moment): { from: number; to: number } {
  const { centre, width } = WINDOW_SHAPE[moment];
  return { from: Math.max(0, centre - width), to: Math.min(1, centre + width) };
}

/** Whether a horse's own progress falls inside its window. */
export function inMomentWindow(moment: Moment, ownProgress: number): boolean {
  const w = momentWindow(moment);
  return ownProgress >= w.from && ownProgress <= w.to;
}
