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
export const SPEED_STAT_INFLUENCE = 0.19;

/** A horse coasting in a race still gallops; effort 0 is not a standstill. */
export const MIN_EFFORT_SPEED = 0.78;

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
export const BASE_DRAIN = 7.4;
export const STAMINA_DRAIN_INFLUENCE = 0.45;

/** Energy per second recovered at zero effort, in the style's happy place. */
export const BASE_RECOVERY = 4.1;

/**
 * Leading is INTRINSICALLY expensive — no slipstream, and you set the tempo.
 * This is the load-bearing asymmetry: without it every style is equally
 * efficient in its own preferred slot, there is no real trade, and whoever
 * runs the least effort nearest the front simply wins.
 *
 * A front-runner does not escape this cost. Its style merely lets it carry the
 * cost without falling apart, in exchange for never having ground to make up.
 */
export const FRONT_COST_PENALTY = 0.3;
/** Sitting at the back is cheap and restful — but leaves ground to cover. */
export const BACK_RECOVERY_BONUS = 0.10;

/**
 * Yards of clear air needed before a lead counts as uncontested.
 * Inside this, the horse is being pressed and pays the full front cost.
 */
export const CLEAR_LEAD_GAP = 14;
/**
 * Cost of being PRESSED, applied on top of the baseline front cost and NOT
 * discounted by running style. Being hounded hurts everyone equally — that is
 * what makes contesting a lead a real weapon, and what Pace Pusher exploits.
 */
export const CONTESTED_LEAD_COST = 0.34;

/**
 * Racing your style RIGHT must pay, not merely avoid a fine.
 *
 * These four numbers form a two-sided curve around 1.0: a horse perfectly in
 * its style's slot burns LESS than baseline and recovers MORE, while one out of
 * position burns more and recovers less. Previously being in position only
 * meant dodging a penalty, which let a stalker sit on the lead all race for
 * almost nothing — there was no reward for doing it right and no real
 * consequence for doing it wrong.
 */
/** Drain discount at a perfect fit. */
export const IN_POSITION_DRAIN_BONUS = 0.28;
/** Extra drain when badly out of position for your style. */
export const POSITION_COST_PENALTY = 1.1;
/** Extra recovery when perfectly in position. */
export const POSITION_RECOVERY_BONUS = 0.5;
/** Lost recovery when out of position. */
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
// The kick — scales with banked energy × Grit (DESIGN.md §4)
//
// This is what stops the sim collapsing into "closers always win late": a
// front-runner who burned everything gets a feeble kick, and a well-paced
// leader can still defend.
// ---------------------------------------------------------------------------

export const KICK_MAX_BONUS = 0.085;
export const KICK_GRIT_INFLUENCE = 0.35;
export const KICK_BASE_DURATION = 9.0;
/** Kick costs energy on top of the effort it implies. */
export const KICK_DRAIN_MULTIPLIER = 1.35;

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
export const BASE_ESCAPE_RATE = 0.9;
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
export const BAND_DOWN = 0.17;
export const BAND_UP = 0.115;
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
export const PHASE_PROFILES = {
  //                 early    middle    late
  // A bonus LATE is worth more than one early, because the race is decided
  // late. Early-phase numbers are therefore larger to compensate.
  frontRunner: { early: 0.085, middle: 0.007, late: -0.013 },
  stalker: { early: 0.003, middle: 0.0245, late: 0.012 },
  midPack: { early: -0.003, middle: 0.0195, late: 0.0255 },
  closer: { early: -0.027, middle: -0.001, late: 0.042 },
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
