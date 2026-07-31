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
 * Base gallop speed in yards/sec for an average horse at full effort.
 * Real thoroughbreds average roughly 19-20 yd/s, putting a 6f sprint near 70s
 * and a 10f route near 2 minutes — which lands inside our 45-75s target once
 * the render layer applies its time compression.
 */
export const BASE_SPEED = 30.5;

/** How much the Speed stat swings top-end velocity, as a fraction. */
export const SPEED_STAT_INFLUENCE = 0.22;

/** A horse coasting in a race still gallops; effort 0 is not a standstill. */
export const MIN_EFFORT_SPEED = 0.90;

/** Acceleration in yards/sec² at burst 50. */
export const BASE_ACCEL = 5.2;
export const BURST_ACCEL_INFLUENCE = 0.5;

// ---------------------------------------------------------------------------
// The energy economy (DESIGN.md §4)
//
// One currency. Energy drains when you drive and recovers when you settle, and
// both rates depend on whether the horse is where its running style wants to be.
// ---------------------------------------------------------------------------

export const MAX_ENERGY = 100;

/** Energy per second burned at full effort by a stamina-50 horse in position. */
export const BASE_DRAIN = 6.2;
export const STAMINA_DRAIN_INFLUENCE = 0.45;

/** Energy per second recovered at zero effort, in the style's happy place. */
export const BASE_RECOVERY = 2.2;

/**
 * Leading is INTRINSICALLY expensive — no slipstream, and you set the tempo.
 * This is the load-bearing asymmetry: without it every style is equally
 * efficient in its own preferred slot, there is no real trade, and whoever
 * runs the least effort nearest the front simply wins.
 *
 * A front-runner does not escape this cost. Its style merely lets it carry the
 * cost without falling apart, in exchange for never having ground to make up.
 */
export const FRONT_COST_PENALTY = 0.38;
/** Sitting at the back is cheap and restful — but leaves ground to cover. */
export const BACK_RECOVERY_BONUS = 0.5;

/**
 * Yards of clear air needed before a lead counts as uncontested.
 * Inside this, the horse is being pressed and pays the full front cost.
 */
export const CLEAR_LEAD_GAP = 14;
/** Fraction of the front cost still paid with a completely clear lead. */
export const CLEAR_LEAD_RELIEF = 0.3;

/** Extra drain when badly out of position for your style. */
export const POSITION_COST_PENALTY = 0.55;
/** Extra recovery when perfectly in position. */
export const POSITION_RECOVERY_BONUS = 0.35;

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
// The kick — scales with banked energy × Grit (DESIGN.md §4)
//
// This is what stops the sim collapsing into "closers always win late": a
// front-runner who burned everything gets a feeble kick, and a well-paced
// leader can still defend.
// ---------------------------------------------------------------------------

export const KICK_MAX_BONUS = 0.12;
export const KICK_GRIT_INFLUENCE = 0.35;
export const KICK_BASE_DURATION = 9.0;
/** Kick costs energy on top of the effort it implies. */
export const KICK_DRAIN_MULTIPLIER = 1.35;

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
export const BASE_ESCAPE_RATE = 0.9;
export const JOCKEY_ESCAPE_INFLUENCE = 0.8;
export const TEMPER_ESCAPE_INFLUENCE = 0.35;
export const GRIT_ESCAPE_INFLUENCE = 0.3;
/** Speed multiplier while genuinely shut off. */
export const BLOCKED_SPEED_FACTOR = 0.94;
/** Seconds shut off before it counts as genuine trouble worth reporting. */
export const TROUBLE_THRESHOLD = 1.2;

// ---------------------------------------------------------------------------
// Consistency failures (DESIGN.md §4)
// ---------------------------------------------------------------------------

/** Chance of a fumbled start at consistency 0. */
export const FUMBLE_BASE_CHANCE = 0.3;
export const FUMBLE_SPEED_PENALTY = 0.55;
export const FUMBLE_DURATION = 1.4;

/** Per-second chance of a green moment at consistency 0. */
export const GREEN_MOMENT_RATE = 0.045;
export const GREEN_MOMENT_PENALTY = 0.93;
export const GREEN_MOMENT_DURATION = 1.1;

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
 */
export const BAND_DOWN = 0.13;
export const BAND_UP = 0.09;
export const VARIATION_INTERVAL_MIN = 0.5;
export const VARIATION_INTERVAL_MAX = 2;

// ---------------------------------------------------------------------------
// Daily form — amplitude driven by Temper (DESIGN.md §4)
//
// Low Temper swings harder in BOTH directions. Temper does not make form better
// or worse; it makes it louder.
// ---------------------------------------------------------------------------

export const FORM_BASE_SPREAD = 0.02;
export const FORM_TEMPER_AMPLIFY = 0.06;

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
  /** Baseline effort before positional correction. */
  cruiseEffort: number;
}

export const STYLE_PROFILES = {
  frontRunner: { preferred: 0.06, tolerance: 0.14, kickAt: 0.82, cruiseEffort: 0.5 },
  stalker: { preferred: 0.3, tolerance: 0.16, kickAt: 0.8, cruiseEffort: 0.5 },
  midPack: { preferred: 0.52, tolerance: 0.13, kickAt: 0.78, cruiseEffort: 0.5 },
  closer: { preferred: 0.85, tolerance: 0.16, kickAt: 0.7, cruiseEffort: 0.46 },
} as const satisfies Record<string, StyleProfile>;

/**
 * How much of the intrinsic front-running cost each style shrugs off.
 * 1 = pays it in full. This is where a front-runner earns its identity.
 */
export const FRONT_COST_RELIEF = {
  frontRunner: 0.04,
  stalker: 0.78,
  midPack: 0.9,
  closer: 1,
} as const satisfies Record<string, number>;

/** How hard the AI corrects toward its preferred position. */
export const POSITION_CORRECTION_GAIN = 0.5;
export const MAX_EFFORT = 1;
export const MIN_EFFORT = 0.18;
