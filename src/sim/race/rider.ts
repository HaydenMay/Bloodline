import type { Rng } from '../rng.js';
import type { Horse } from '../types.js';
import type { PlayerInput } from './types.js';
import { MOMENTS, type Moment, type RunningStyle } from '../../data/index.js';
import {
  HOLD_TRIGGER_TANK,
  JOCKEY_JITTER,
  JOCKEY_MISS_HOLD,
  JOCKEY_WASTE,
  MOMENT_KICK_SHIFT,
  RECOVERY_RIDE_TANK,
  RECOVERY_RIDE_UNTIL,
} from './constants.js';

/**
 * The rider (REBUILD.md §11).
 *
 * One module serving both AI and player. The player's horse runs THE SAME
 * competent base ride as every opponent; input modulates it, never replaces it.
 *
 * The old build had the player riding a flat cruise while the AI got a commit
 * curve, costing ~11% of top speed — a deficit no kick could buy back, and most
 * of why the owner went 0-for-50 across ~50 manual attempts. Sharing the base
 * ride by construction means the two cannot drift apart again.
 */

export interface RideDecision {
  gear: 'CRUISE' | 'HOLD';
  fireKick: boolean;
}

/** Where in its own race a style intends to spend each charge. */
export type KickPattern = readonly number[];

/**
 * Archetype-distinct kick strategy, built in from the start.
 *
 * This is the deferred "3.5" item from ROADMAP.md. The old AI ran one identical
 * algorithm for every archetype and fired 5-6 kicks per race regardless of
 * style OR moment — measured, not assumed — which is why no amount of tuning
 * ever separated the archetypes from each other. Style sets the PATTERN here;
 * Moment shifts the TIMING.
 *
 * COUNTS ARE EQUAL ACROSS STYLES, deliberately. They were not at first
 * (frontRunner 3, midPack 4, stalker and closer 2) and it quietly decided the
 * whole balance: each kick costs KICK_TANK_COST out of a budget of about 1.0,
 * so midPack was spending 60% of its race on kicks against closer's 30% and
 * measured 1.4% against a fair 12.5%. Style differentiates by WHERE it spends,
 * never by how much it has to spend — the same principle as STYLE_BASE's
 * equal-sum rows and MOMENT_SHIFT's zero-sum rows.
 *
 * The shapes are explicit points rather than an evenly-divided window, because
 * the intent per archetype is not evenly spaced. A front-runner does not just
 * "kick early" — it asserts the lead, then keeps two back to DEFEND it when it
 * is challenged off the turn. A closer spends one early enough to stay in
 * touch, then concentrates the rest.
 */
export const KICK_PLAN: Record<RunningStyle, KickPattern> = {
  /** Assert the lead early, then two held back to defend it off the turn. */
  frontRunner: [0.08, 0.24, 0.62, 0.88],
  /** Sits handy, then a decisive move off the turn. */
  stalker: [0.32, 0.58, 0.8, 0.93],
  /** The generalist: makes its move at halfway and tries to hold on. */
  midPack: [0.36, 0.58, 0.78, 0.94],
  /** One to keep in touch, then everything concentrated late. */
  closer: [0.42, 0.72, 0.86, 0.95],
};

/** How far each Moment shifts a style's pattern, in steps either side of centre. */
function momentOffset(moment: Moment): number {
  return MOMENTS.indexOf(moment) - (MOMENTS.length - 1) / 2;
}

/**
 * Move a planned kick earlier or later, TAPERING TO ZERO at both ends of the race.
 *
 * A uniform shift is the old Moment-window unfairness in new clothes, and it
 * measured exactly like it. Sliding every point by the same amount pushed an
 * `early` front-runner's first kick to 0.01 — fired before the horse has even
 * finished accelerating — and a `late` one's last kick past the wire, so both
 * extremes threw a charge away while `earlyMid` and `midLate` kept all four.
 * earlyMid came out at +40% off fair share, `early` at -24%.
 *
 * The 4p(1-p) weighting is zero at p=0 and p=1 and maximal mid-race, so a
 * Moment changes WHEN a horse spends without ever costing it a charge for
 * sitting at one end of the range. No clamping, so nothing is silently lost.
 */
function shiftKick(point: number, shift: number): number {
  const taper = 4 * point * (1 - point);
  return point + shift * taper;
}

export interface KickPlanned {
  /** Own-progress points at which this horse intends to kick. */
  points: number[];
  /** False if the jockey never settles the horse at all this race. */
  willHold: boolean;
  /** Where this horse's spending phase begins. Before it, holding is affordable. */
  spendFrom: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Precompute a horse's intended ride, at the gate, from the seeded rng.
 *
 * Jockey skill degrades the plan rather than the horse. This is the fix for
 * "the AI was too smart": `horse.jockeySkill` already exists on every horse and
 * `DIVISION_BANDS` already scales it (maiden 30-60, championship 65-95), but
 * nothing was ever reading it during a race. A maiden rival now mistimes badly
 * and a championship rival barely errs, so the difficulty ladder falls out of
 * data the horse already carries.
 */
export function planKicks(horse: Horse, rng: Rng): KickPlanned {
  const pattern = KICK_PLAN[horse.style];
  const shift = MOMENT_KICK_SHIFT * momentOffset(horse.moment);
  const error = 1 - horse.jockeySkill / 100;

  const points: number[] = [];
  for (const base of pattern) {
    const jitter = rng.normal(0, JOCKEY_JITTER * error);
    points.push(clamp(shiftKick(base, shift) + jitter, 0.01, 0.995));
  }

  // A poor jockey throws one away entirely — fires it somewhere it does almost
  // nothing rather than inside the horse's own phase.
  if (points.length > 0 && rng.chance(JOCKEY_WASTE * error)) {
    points[rng.int(0, points.length - 1)] = clamp(rng.range(0.02, 0.99), 0.01, 0.995);
  }

  points.sort((a, b) => a - b);

  return {
    points,
    willHold: !rng.chance(JOCKEY_MISS_HOLD * error),
    spendFrom: Math.min(...points),
  };
}

/** What a rider can see of its own horse. */
export interface RiderState {
  /** This horse's own progress, 0-1. Never the leader's (REBUILD.md §6.1). */
  ownProgress: number;
  tank: number;
  charges: number;
  /** Indices of `plan.points` already spent. */
  fired: boolean[];
  /** Up to racing speed. A kick before this is spent on a ceiling it cannot reach. */
  atSpeed: boolean;
}

/**
 * The shared competent ride. Two decisions, nothing else.
 *
 * There is deliberately no position logic here at all. Position is an output of
 * pace, not an input that buys speed (REBUILD.md R4) — the drift-correction
 * dial the old build used was handing out free speed to whichever style had to
 * fight for its slot, which the roadmap's fifth diagnosis identified as the
 * root cause of frontRunner dominance.
 */
export function baseRide(state: RiderState, plan: KickPlanned): RideDecision {
  // Two reasons to take a pull, and they are different decisions.
  //
  //  1. BANKING — comfortable, phase still ahead, so buy tank cheaply now.
  //  2. IN TROUBLE — the horse has emptied and is being punished for it. A real
  //     jockey eases here; the first build of this rider did not, so an emptied
  //     front-runner just kept grinding at its curve while fatigued, compounding
  //     the loss. That was a large part of why spending early lost to spending
  //     late across the board (frontRunner 2.6%, closer 25.0%).
  const banking =
    plan.willHold && state.tank < HOLD_TRIGGER_TANK && state.ownProgress < plan.spendFrom;
  const inTrouble = state.tank < RECOVERY_RIDE_TANK && state.ownProgress < RECOVERY_RIDE_UNTIL;

  const gear: RideDecision['gear'] = banking || inTrouble ? 'HOLD' : 'CRUISE';

  // Never kick while still accelerating out of the gate — the horse is already
  // flat out toward a target it is nowhere near, so the charge does nothing.
  let fireKick = false;
  if (state.charges >= 1 && state.atSpeed) {
    for (let i = 0; i < plan.points.length; i++) {
      if (!state.fired[i] && state.ownProgress >= plan.points[i]!) {
        fireKick = true;
        break;
      }
    }
  }

  return { gear, fireKick };
}

/**
 * The player's ride: the base ride, modulated.
 *
 * Hold forces a pull; a tap fires a kick immediately. Everything else is the
 * shared autopilot, so a hands-off player is competitive and an attentive one
 * is better — which is the parity target §16.3 gates on.
 */
export function playerRide(
  base: RideDecision,
  input: PlayerInput,
  atSpeed: boolean,
): RideDecision {
  return {
    // The jockey still rides the horse: it settles, it banks, it eases when the
    // horse is in trouble. Holding overrides that downward.
    gear: input.takingBack ? 'HOLD' : base.gear,

    // THE JOCKEY DOES NOT KICK. Note that `base.fireKick` is deliberately not
    // consulted — on the player's horse, every charge is spent by the player or
    // not at all.
    //
    // This is what makes riding a skill rather than a formality. While the
    // autopilot also kicked, it kicked to a plan matched to the horse's own
    // style and moment, which is close to the best a player could do — so
    // riding well could only ever MATCH riding not at all. Measured: a player
    // riding precisely to their horse's own style won 11.7% against a
    // hands-off autopilot's 12.0%, a tie inside noise, and no strategy of any
    // kind beat doing nothing. There was no headroom because there was nothing
    // left for the player to decide.
    //
    // The up-to-speed rule still applies, and is not a restriction so much as a
    // refusal to waste the charge: a tap during the gate break is HELD until
    // the horse can use it, not thrown away.
    fireKick: input.kickPending && atSpeed,
  };
}

/** Which planned kick the AI's own schedule is calling for right now. */
export function nextPendingKick(state: RiderState, plan: KickPlanned): number {
  for (let i = 0; i < plan.points.length; i++) {
    if (!state.fired[i] && state.ownProgress >= plan.points[i]!) return i;
  }
  return -1;
}

/**
 * The next planned kick a PLAYER tap should consume — the first still unspent,
 * whether or not the schedule has reached it yet.
 *
 * This is what makes a tap bring a kick FORWARD rather than add one on top, and
 * it is the difference between the player having agency and the player being
 * punished for touching the screen. Measured before the distinction existed:
 * hands-off won a fair 12.7%, while every active persona — including a
 * carefully-timed one — won 0.0% and was beaten 18-36 lengths, because taps
 * were additive to an already-complete four-kick plan and simply emptied the
 * tank. Riding well has to beat riding not at all.
 *
 * The budget is the same either way; the player owns the TIMING of it. Once
 * every planned kick is spent, further taps still fire if charges remain — the
 * owner's rule, that a player who wants to spend their kicks may, well or
 * badly — but that is now a deliberate overspend rather than the default.
 */
export function nextUnfiredKick(state: RiderState): number {
  for (let i = 0; i < state.fired.length; i++) {
    if (!state.fired[i]) return i;
  }
  return -1;
}
