/**
 * Every tunable number in the race simulation, in one place.
 *
 * These are first-pass values. The balance harness exists to replace guesses
 * here with evidence — see tools/harness.ts and DESIGN.md §4.
 */

export const YARDS_PER_FURLONG = 220;

/** Simulation tick rate. 30 Hz matches the render loop closely enough. */
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

/**
 * The correction for the sim's known-too-fast clock (ROADMAP.md, "Known issue
 * — winning margins are too wide"). A winning 8f took 64.4s against a real
 * ~96s: races ran at 25.0 yd/s against a thoroughbred's ceiling near 17.5.
 *
 * Covering the same physical distance now genuinely takes TIME_SCALE times
 * longer in real seconds, so every constant defined against a real second has
 * to move to still mean what it meant before: a RATE (yards, energy,
 * probability per second) divides by it, a DURATION (seconds an event lasts)
 * multiplies by it. Deriving each through this one lever, rather than writing
 * a second set of hand-picked numbers, is what makes the change balance-
 * neutral by construction — verified below, "Re-verify Gate 1 at the new
 * clock" — instead of a fresh guess sitting next to the old one.
 *
 * Progress-based and dimensionless constants (STYLE_PROFILES, ESTABLISH_UNTIL,
 * the performance bands, every multiplier) are untouched: they were never
 * measured in seconds, so the clock bug never reached them.
 *
 * The exponent matters. A quantity in units/secondⁿ needs TIME_SCALEⁿ, not
 * TIME_SCALE flat — dividing BASE_ACCEL (yards/sec², n=2) by the bare factor
 * was tried first and the harness caught it: acceleration is what decides how
 * many YARDS a horse takes to reach full speed, and dividing it by only
 * TIME_SCALE let horses reach full speed over fewer yards than before,
 * shrinking the fraction of the race spent scrambling for position — which
 * quietly favoured the style that wins that scramble (frontRunner's win share
 * moved from 12.9% to 14.3%, a real shift, not sampling noise: the harness
 * runs off a fixed seed). Squaring it restores the same yards-to-full-speed
 * as before, at the correct real-world clock.
 */
export const TIME_SCALE = 1.43;

/**
 * Base gallop speed in yards/sec for an average horse at full effort.
 * Real thoroughbreds average roughly 19-20 yd/s, putting a 6f sprint near 70s
 * and a 10f route near 2 minutes.
 */
export const BASE_SPEED = 30.5 / TIME_SCALE;

/** How much the Speed stat swings top-end velocity, as a fraction. */
export const SPEED_STAT_INFLUENCE = 0.19;

/** A horse coasting in a race still gallops; effort 0 is not a standstill. */
export const MIN_EFFORT_SPEED = 0.78;

/** Acceleration in yards/sec² at burst 50. */
export const BASE_ACCEL = 5.2 / TIME_SCALE ** 2;
export const BURST_ACCEL_INFLUENCE = 0.5;

// ---------------------------------------------------------------------------
// The energy economy (DESIGN.md §4)
//
// Redesigned from "position costs energy" to "position changes how fast you
// refill." Energy now only ever DRAINS from deliberate spend — riding above
// your style's natural cruise, or the kick — and only ever RECOVERS
// otherwise, at a rate position scales up or down but never below a floor.
// It is structurally impossible to lose energy just by being in the wrong
// spot, which is a stronger guarantee than the old model's death-spiral fix
// (MISFIT_ENERGY_RELIEF_FLOOR, retired here): that discounted a penalty that
// could still, in principle, drain a horse. This removes the drain entirely.
// ---------------------------------------------------------------------------

export const MAX_ENERGY = 100;

/** Energy per second burned per unit of EXCESS effort (above cruiseEffort), squared. */
export const BASE_DRAIN = 7.4 / TIME_SCALE;
export const STAMINA_DRAIN_INFLUENCE = 0.45;

/** Energy per second recovered at full rest, in the style's happy place. */
export const BASE_RECOVERY = 4.1 / TIME_SCALE;

/**
 * Even riding exactly at cruiseEffort — not resting below it, just racing to
 * style — still recovers at this fraction of BASE_RECOVERY. Without this,
 * only a horse actively taking a pull would refill, and "just ride to style"
 * would sit at a dead break-even rather than genuinely climbing, which is
 * what "should only go up" requires whenever you are not spending.
 */
export const REST_RECOVERY_BASE = 0.35;

/**
 * Recovery multiplier never drops below this, however bad the position —
 * leading, contested, badly out of your style's slot. Position can only slow
 * the refill, never stop or reverse it. This is what makes the drain rule
 * above literally true rather than true-except-when-out-of-position: nothing
 * left in this file can push net energy negative outside of excess effort or
 * the kick.
 */
export const RECOVERY_FLOOR = 0.35;

/**
 * Leading refills SLOWER — no slipstream, and you set the tempo. This is the
 * load-bearing asymmetry: without it every style recharges equally well in
 * its own preferred slot, there is no real trade, and whoever spends least
 * near the front simply wins. A front-runner does not escape this — its style
 * merely lets it recharge better than another style would in the same spot,
 * in exchange for never having ground to make up.
 */
export const FRONT_COST_PENALTY = 0.3;
/** Sitting at the back refills faster — but leaves ground to cover. */
export const BACK_RECOVERY_BONUS = 0.10;

/**
 * Yards of clear air needed before a lead counts as uncontested.
 * Inside this, the horse is being pressed and refills at the full penalty.
 */
export const CLEAR_LEAD_GAP = 14;
/**
 * Extra refill slowdown from being PRESSED, on top of the baseline lead
 * penalty and NOT discounted by running style. Being hounded hurts everyone
 * equally — that is what makes contesting a lead a real weapon, and what Pace
 * Pusher exploits.
 */
export const CONTESTED_LEAD_COST = 0.34;

/**
 * Racing your style RIGHT must pay off, not merely avoid a fine.
 *
 * A horse perfectly in its style's slot refills faster; one badly out of
 * position refills slower — never negative, per RECOVERY_FLOOR above.
 * Previously being in position only meant dodging a drain penalty, which let
 * a stalker sit on the lead all race for almost nothing; there was no reward
 * for doing it right and no real consequence for doing it wrong.
 */
/** Extra recovery when perfectly in position. */
export const POSITION_RECOVERY_BONUS = 0.5;
/** Lost recovery when out of position — floored by RECOVERY_FLOOR, never negative. */
export const OUT_POSITION_RECOVERY_PENALTY = 0.5;

/**
 * Positional preference fades out across these two points. Past the end, only
 * energy and speed decide the race — everyone is committed, and where you
 * *wanted* to sit no longer applies.
 */
export const POSITION_FADE_START = 0.6;
export const POSITION_FADE_END = 0.8;

/** Recovery multiplier while sitting in another horse's slipstream. */
export const DRAFT_RECOVERY_BONUS = 0.25;
/** Yards behind a rival that still counts as a draft. */
export const DRAFT_GAP = 7;

/** Below this energy the speed ceiling starts collapsing — the fade. */
export const FADE_THRESHOLD = 35;
/** Worst-case speed multiplier on an empty tank at grit 0. */
export const FADE_FLOOR = 0.86;
/** How much Grit softens the fade. */
export const GRIT_FADE_RELIEF = 0.08;

/** Poor distance aptitude shows up as energy cost, not as a raw speed cut. */
export const APTITUDE_DRAIN_PENALTY = 0.5;

// ---------------------------------------------------------------------------
// The kick — scales with GRIT × JOCKEY SKILL, gated by the tank (DESIGN.md §4)
//
// Deliberately NOT scaled by banked energy. Stamina is the gas tank: it does
// not make a kick more powerful, it decides how many you can afford — see
// KICK_CHARGES and the empty-tank gate in engine.ts. A horse with a healthy
// reserve and one with a single digit left kick with the SAME force; the
// difference is whether either can still afford to fire one at all.
// ---------------------------------------------------------------------------

export const KICK_MAX_BONUS = 0.085;
export const KICK_GRIT_INFLUENCE = 0.35;
/** How much jockey skill swings kick strength, on top of Grit. */
export const KICK_JOCKEY_INFLUENCE = 0.3;
export const KICK_BASE_DURATION = 9.0 * TIME_SCALE;
/** Kick costs energy on top of the effort it implies. */
export const KICK_DRAIN_MULTIPLIER = 1.35;

/**
 * How many kicks the PLAYER starts a race with. Every AI rider, and every
 * harness/test field, still gets exactly one (RaceEntrant.kickCharges
 * defaults to 1 when unset) — this is a player-only mechanic. Establishing
 * position and finishing the race are now two separate, deliberately spent
 * charges of the same resource rather than one automatic ride plus one kick:
 * fight for your slot early, then need to have recovered enough to afford the
 * one that decides the finish.
 */
export const KICK_CHARGES = 2;

/**
 * Automatic lift for being inside your window, with no input at all.
 * A floor so an outclassed field can be beaten on autopilot; a well-timed
 * kick stacks on top to roughly double it.
 */
export const WINDOW_BASE_LIFT = 0.05;

/** Half-width of the window where the kick lands at full force. */
export const KICK_WINDOW_HALF = 0.09;
/** How fast effectiveness falls away outside the window. */
export const KICK_WINDOW_FALLOFF = 0.22;
/** Floor: a badly mistimed kick still holds position, never steals a race. */
export const KICK_MIN_FIT = 0.35;
/** Extra energy burned by a mistimed kick, on top of the normal kick cost. */
export const MISTIMED_KICK_DRAIN = 0.9;

// ---------------------------------------------------------------------------
// Traffic (DESIGN.md §4)
//
// Emergent from lanes rather than rolled at random. Temper governs how rattled
// the horse gets, Grit whether it fights through, jockey skill how often it
// happens at all.
// ---------------------------------------------------------------------------

export const LANE_COUNT = 6;
/** Yards ahead in the same lane that counts as blocked. */
export const BLOCK_GAP = 2.4;
/** Base per-second chance a jockey finds a way out. */
export const BASE_ESCAPE_RATE = 0.9 / TIME_SCALE;
export const JOCKEY_ESCAPE_INFLUENCE = 0.8;
export const TEMPER_ESCAPE_INFLUENCE = 0.35;
export const GRIT_ESCAPE_INFLUENCE = 0.3;
/**
 * Speed while shut off, as a fraction of the blocking horse's speed.
 *
 * Must be ~1.0. At 0.94 a blocked horse ran 6% SLOWER than the horse in front,
 * so it fell away, unblocked, closed again and re-blocked — bleeding ground on
 * every cycle. Being stuck behind a rival means matching its pace, not
 * reversing away from it.
 */
export const BLOCKED_SPEED_FACTOR = 0.995;
/** Seconds shut off before it counts as genuine trouble worth reporting. */
export const TROUBLE_THRESHOLD = 1.2 * TIME_SCALE;

// ---------------------------------------------------------------------------
// Consistency failures (DESIGN.md §4)
// ---------------------------------------------------------------------------

/** Chance of a fumbled start at consistency 0. */
export const FUMBLE_BASE_CHANCE = 0.3;
export const FUMBLE_SPEED_PENALTY = 0.55;
export const FUMBLE_DURATION = 1.4 * TIME_SCALE;

/** Per-second chance of a green moment at consistency 0. */
export const GREEN_MOMENT_RATE = 0.045 / TIME_SCALE;
export const GREEN_MOMENT_PENALTY = 0.93;
export const GREEN_MOMENT_DURATION = 1.1 * TIME_SCALE;

/**
 * The continuous performance band.
 *
 * Consistency defines how tightly a horse delivers its true ability, re-rolled
 * every so often so a race has texture rather than smooth curves. The band is
 * deliberately ASYMMETRIC — more downside than upside — because a horse
 * underperforms more easily than it exceeds itself.
 *
 * This is the chaos dial: low-Consistency fields are volatile and upset-rich,
 * high-Consistency fields precise. Because AI horses in higher divisions are
 * generated with higher Consistency, elite racing tightens up emergently.
 *
 * Cut by roughly a third alongside FORM_BASE_SPREAD/FORM_TEMPER_AMPLIFY below
 * — see the note there. Moved together deliberately: ROADMAP.md's own record
 * of this is that cutting noise ALONE previously tightened finishes (6.4L to
 * 5.2L) but let systematic style advantage dominate once there was less
 * chaos to wash it out (closer to 22%, stalker to 5.7%). A cut here has to
 * ship with the compensating STYLE_PROFILES / phase-profile changes below it,
 * verified together against the harness, not as a lever pulled alone.
 */
export const BAND_DOWN = 0.17 * 0.65;
export const BAND_UP = 0.115 * 0.65;
export const VARIATION_INTERVAL_MIN = 0.5 * TIME_SCALE;
export const VARIATION_INTERVAL_MAX = 2 * TIME_SCALE;

// ---------------------------------------------------------------------------
// Daily form — amplitude driven by Temper (DESIGN.md §4)
//
// Low Temper swings harder in BOTH directions. Temper does not make form better
// or worse; it makes it louder.
// ---------------------------------------------------------------------------

/**
 * Cut by roughly a third from the first-pass values (0.02, 0.06). ROADMAP.md
 * names this the dominant driver of margin variance — fixed for the whole
 * race, so it compounds directly into the finishing gap rather than washing
 * out over 90-odd seconds the way the re-rolled consistency band does.
 * BAND_DOWN/BAND_UP above are cut by the same proportion, deliberately: see
 * the note there for why cutting either alone is not safe on its own.
 */
export const FORM_BASE_SPREAD = 0.02 * 0.65;
export const FORM_TEMPER_AMPLIFY = 0.06 * 0.65;

/** Condition scales performance directly. */
export const CONDITION_INFLUENCE = 0.1;

// ---------------------------------------------------------------------------
// Running styles — each is an energy-efficiency profile keyed to pack position.
// preferred: 0 = front of field, 1 = back. tolerance: free play either side.
// ---------------------------------------------------------------------------

export interface StyleProfile {
  preferred: number;
  tolerance: number;
  /** Where in the race (0-1) this style wants to launch its run. */
  kickAt: number;
  /**
   * The line between "riding to style" and "urging" (DESIGN.md §4). Effort at
   * or below this never drains energy — it only recovers, faster or slower
   * depending on position. Only effort ABOVE this, or the kick, spends.
   */
  cruiseEffort: number;
}

export const STYLE_PROFILES = {
  frontRunner: { preferred: 0.06, tolerance: 0.18, kickAt: 0.82, cruiseEffort: 0.5 },
  stalker: { preferred: 0.3, tolerance: 0.16, kickAt: 0.8, cruiseEffort: 0.5 },
  midPack: { preferred: 0.52, tolerance: 0.13, kickAt: 0.78, cruiseEffort: 0.5 },
  closer: { preferred: 0.85, tolerance: 0.16, kickAt: 0.7, cruiseEffort: 0.46 },
} as const satisfies Record<string, StyleProfile>;

/**
 * PHASE PROFILES — a style's moment in the race, not just its place on the track.
 *
 * Position says where a horse belongs; phase says WHEN it shines. Without this a
 * closer is merely "the horse at the back" rather than "the horse that flies
 * late". Values are speed multipliers at the centre of each third, smoothly
 * interpolated between.
 *
 * Crucially these are scaled by STYLE FIDELITY — how faithfully the horse has
 * actually raced its style so far. A closer only gets its finishing surge if it
 * genuinely sat back and banked energy early. The moment has to be earned.
 */
/**
 * Re-tuned once against the lower-noise baseline above (BAND_DOWN/UP,
 * FORM_BASE_SPREAD/FORM_TEMPER_AMPLIFY). Cutting that noise alone — verified
 * against the harness — left the patient styles overperforming once nothing
 * washed their late-race edge out (midPack 16.0%, closer 15.6%, against a fair
 * 12.5%) while the front-loaded styles paid for it (frontRunner 10.1%,
 * stalker 8.3%, failing the harness's own bar). Stalker and midPack's numbers
 * were the timid ones in the table — smaller in magnitude than frontRunner's
 * or closer's committed bets — so stalker's are raised across all three
 * phases and closer/midPack's LATE number, the biggest lever on the biggest
 * overperformer, is cut back down.
 */
export const PHASE_PROFILES = {
  //                 early    middle    late
  // A bonus LATE is worth more than one early, because the race is decided
  // late. Early-phase numbers are therefore larger to compensate.
  frontRunner: { early: 0.085, middle: 0.007, late: -0.013 },
  stalker: { early: 0.006, middle: 0.025, late: 0.013 },
  midPack: { early: -0.003, middle: 0.0195, late: 0.021 },
  closer: { early: -0.027, middle: -0.001, late: 0.038 },
} as const satisfies Record<string, { early: number; middle: number; late: number }>;

/**
 * How much of the intrinsic front-running cost each style shrugs off.
 * 1 = pays it in full. This is where a front-runner earns its identity.
 */
export const FRONT_COST_RELIEF = {
  frontRunner: 0.02,
  stalker: 0.78,
  midPack: 0.9,
  closer: 1,
} as const satisfies Record<string, number>;

/**
 * The three beats every horse races: ESTABLISH, then HOLD, then COMMIT.
 *
 * HOLD_EFFORT is the cruise a horse settles into once it has its slot. In the
 * right place this MUST net positive energy — that is what lets a horse bank
 * for its window. Without a hold phase the AI only knows spend-and-hope, which
 * is no skill gap at all, and it is why front-runners were empty by the 20%
 * mark: they never stopped paying to be where they already were.
 */
export const HOLD_EFFORT = 0.55;
/** Establishing position is a bounded one-off cost, never an ongoing drain. */
export const ESTABLISH_UNTIL = 0.28;
export const ESTABLISH_GAIN = 2.2;

/** How hard the AI corrects toward its preferred position. */
export const POSITION_CORRECTION_GAIN = 0.5;
export const MAX_EFFORT = 1;
export const MIN_EFFORT = 0.18;
