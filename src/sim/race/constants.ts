/**
 * Every tunable number in the race simulation, in one place.
 *
 * These are first-pass values. The balance harness exists to replace guesses
 * here with evidence — see tools/harness.ts and DESIGN.md §4.
 */

import type { Moment, RunningStyle } from '../../data/index.js';

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
// Kick charges — the ONLY resource (DESIGN.md §4, ROADMAP.md)
//
// No continuous energy value. A horse banks a small integer number of kick
// charges; every tap/kick spends exactly one. Charges regenerate always —
// never stuck, never negative — at a rate Stamina and position scale up or
// down but never below a floor. Capacity is fixed for every horse; Stamina
// buys TEMPO (how often you can afford to spend), never a bigger tank — see
// the note on STAMINA_CHARGE_REGEN_INFLUENCE below for why.
// ---------------------------------------------------------------------------

/**
 * Fixed for every horse. Not stat-driven: tying capacity to Stamina makes
 * training only pay off at whatever breakpoint you pick (every N stat points
 * buys +1 slot) with nothing in between — training feels dead most of the
 * time. Regen RATE is the continuous lever instead (below), so every point of
 * Stamina always does something. Set above 3 deliberately: races run
 * 45-75s+ and scale with distance, so a field needs enough charges across a
 * whole race — establishing position, a mid-race response, the finish —
 * without exhausting the resource in the first third of a long route.
 */
export const CHARGE_CAPACITY = 5;

/** Charges regenerated per second at Stamina 50, at the neutral position multiplier. */
export const BASE_CHARGE_REGEN = 1 / 30;

/**
 * How much Stamina swings charge regen, as a fraction either side of the
 * baseline (same shape as the old STAMINA_DRAIN_INFLUENCE). Continuous and
 * uncapped by any threshold — this is where training Stamina always pays,
 * immediately, unlike a capacity breakpoint would.
 */
export const STAMINA_CHARGE_REGEN_INFLUENCE = 0.45;

/**
 * Riding BELOW your style's cruiseEffort — taking a pull, or an AI horse
 * genuinely holding back rather than merely cruising — boosts regen on top
 * of the position multiplier below. Scales with how far below cruise the
 * horse is riding, so a deeper pull banks charges faster still.
 */
export const CHARGE_REGEN_HOLD_GAIN = 1.0;

/**
 * Regen multiplier never drops below this, however bad the position —
 * leading, contested, badly out of your style's slot. Position can only slow
 * the refill, never stop or reverse it.
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
 * Positional preference fades out across these two points. Past the end,
 * charges and speed decide the race — everyone is committed, and where you
 * *wanted* to sit no longer applies.
 */
export const POSITION_FADE_START = 0.6;
export const POSITION_FADE_END = 0.8;

/**
 * Regen multiplier while sitting in another horse's slipstream. Raised from
 * 0.25 — this is the back-of-the-pack styles' main lever for banking the
 * charges their late Moment needs, and it was too weak to matter much next to
 * the front-of-pack penalties (FRONT_COST_PENALTY, CONTESTED_LEAD_COST) that
 * already stack against anyone up front.
 */
export const DRAFT_RECOVERY_BONUS = 0.45;
/**
 * Yards behind a rival that still counts as a draft. Widened from 7 so a
 * trailing horse sitting a few lengths off the pace — not just tucked
 * directly behind one rival — still gets credit for it.
 */
export const DRAFT_GAP = 10;

/**
 * Poor distance aptitude is a direct top-speed penalty now — a sprinter over a
 * route runs SLOWER, not out of a resource it no longer has. Fraction of
 * maxSpeed lost at zero aptitude for the distance; scales linearly with how
 * unsuited the horse is.
 */
export const APTITUDE_SPEED_PENALTY = 0.15;

// ---------------------------------------------------------------------------
// The kick — scales with GRIT × JOCKEY SKILL, gated by charges (DESIGN.md §4)
//
// Deliberately NOT scaled by how many charges are banked. A horse with a full
// bank and one with a single charge left kick with the SAME force; the bank
// only gates whether either can afford to fire one at all.
// ---------------------------------------------------------------------------

export const KICK_MAX_BONUS = 0.085;
export const KICK_GRIT_INFLUENCE = 0.35;
/** How much jockey skill swings kick strength, on top of Grit. */
export const KICK_JOCKEY_INFLUENCE = 0.3;
export const KICK_BASE_DURATION = 9.0 * TIME_SCALE;

/**
 * Automatic lift for being inside your window, with no input at all.
 * A floor so an outclassed field can be beaten on autopilot; a well-timed
 * kick stacks on top to roughly double it.
 */
export const WINDOW_BASE_LIFT = 0.05;

/** Half-width of the window where the kick lands at full force. */
export const KICK_WINDOW_HALF = 0.09;
/** How fast effectiveness falls away outside the window. */
export const KICK_WINDOW_FALLOFF = 0.15;
/**
 * Floor: a badly mistimed kick still holds position, never steals a race.
 * Deliberately low — saving charges for the window has to clearly beat
 * spending them the moment they're available regardless of timing, or
 * "spam every charge" out-earns a single well-timed one on raw uptime alone
 * (ROADMAP.md, "spam vs timing").
 */
export const KICK_MIN_FIT = 0.05;
/**
 * A mistimed kick is SHORTER as well as weaker, scaled by the same windowFit
 * — this is what actually stops spamming, not the strength floor alone. A
 * kick's duration used to be fixed regardless of timing, so a stream of weak
 * mistimed kicks could still cover most of a race at reduced strength and
 * out-earn one strong kick held for its ~13s window on raw TIME COVERED. The
 * floor below is duration retained at the worst possible timing — never
 * instant, since even a bad kick should do something.
 */
export const KICK_MISTIMED_DURATION_FLOOR = 0.3;

/**
 * How many full-strength kicks a horse gets inside its OWN Moment window,
 * evenly spaced across it. Not "however many charges and cooldown time
 * happen to fit" — that handed wide windows (`midLate`, 35% of the race) far
 * more repeat kicks than narrow ones (`late`, 20%, ending at the finish with
 * no room for a second), which is what made midLate spike to 48% win rate
 * the moment AI was allowed more than one kick. Fixing the count instead of
 * the cooldown gives every Moment the same number of opportunities
 * regardless of width (sim/race/ai.ts).
 */
export const MAX_KICKS_PER_MOMENT = 2;

/**
 * Extra kick strength by running style, applied on top of the Grit x jockey
 * skill formula above. A frontRunner's kick only has to defend a lead it
 * already holds; a closer's kick has to actually MAKE UP the ground it spent
 * the whole race conceding. Without this, both get the identical kick and the
 * closer is left needing its passive Moment curve and charge-regen edge alone
 * to overturn a deficit built over 70-90% of the race — not enough on its own
 * (ROADMAP.md, Moment win-rate investigation).
 */
export const KICK_STYLE_BONUS = {
  frontRunner: 0,
  stalker: 0.15,
  midPack: 0.3,
  closer: 0.5,
} as const satisfies Record<RunningStyle, number>;

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
// Running styles — WHERE a horse sits in the pack, and its charge-regen profile.
// preferred: 0 = front of field, 1 = back. tolerance: free play either side.
//
// Style no longer says WHEN a horse kicks or when its speed peaks — that's
// Moment, below, deliberately independent so two frontRunners can differ.
// ---------------------------------------------------------------------------

export interface StyleProfile {
  preferred: number;
  tolerance: number;
  /**
   * The style's natural riding baseline. Effort BELOW this counts as taking a
   * pull — restraint that boosts charge regen (CHARGE_REGEN_HOLD_GAIN) on top
   * of the position multiplier. Riding at or above it is simply racing.
   */
  cruiseEffort: number;
}

export const STYLE_PROFILES = {
  frontRunner: { preferred: 0.06, tolerance: 0.18, cruiseEffort: 0.5 },
  stalker: { preferred: 0.3, tolerance: 0.16, cruiseEffort: 0.5 },
  midPack: { preferred: 0.52, tolerance: 0.13, cruiseEffort: 0.5 },
  closer: { preferred: 0.85, tolerance: 0.16, cruiseEffort: 0.46 },
} as const satisfies Record<RunningStyle, StyleProfile>;

// ---------------------------------------------------------------------------
// Moment — WHEN a horse's kick lands and its passive speed curve peaks.
// Independent of running style: a frontRunner and a closer can both be
// `late`. Style only WEIGHTS which Moment a horse is likelier to roll
// (MOMENT_WEIGHTS_BY_STYLE, sim/horse.ts) — it never determines it outright.
// ---------------------------------------------------------------------------

/**
 * The kick window, in race progress (0-1), for each Moment. Not a centre +/-
 * half-width like the old style-keyed window was — the owner's own framing:
 * "during your entire moment, your horse should be getting full-strength
 * kicks. This is where players should be planning to utilise their kicks."
 * A kick anywhere inside this range lands at full force; outside it, strength
 * and duration fall away by distance to the nearest edge (KICK_WINDOW_FALLOFF,
 * KICK_MIN_FIT, KICK_MISTIMED_DURATION_FLOOR — sim/race/engine.ts).
 */
export const MOMENT_WINDOWS = {
  early: [0, 0.25],
  earlyMid: [0.2, 0.55],
  midLate: [0.55, 0.9],
  late: [0.8, 1],
} as const satisfies Record<Moment, readonly [number, number]>;

/**
 * How far BEFORE its Moment window a horse starts building toward full
 * effort (sim/race/ai.ts) — full commitment is reached BY `kickAt`, not
 * merely begun there, so a horse is already flat out the instant it fires
 * its kick.
 */
export const MOMENT_RAMP_LEAD = 0.15;

/**
 * Fixed TOTAL span of race progress a horse spends at max effort, the SAME
 * for every Moment — a ramp of MOMENT_RAMP_LEAD up to `kickAt`, then held for
 * the remainder of this duration afterward. Deliberately NOT "however wide
 * this Moment's own window happens to be".
 *
 * First attempt at this fix held effort for the horse's entire window, then
 * eased off until a universal final-stretch threshold. That was still wrong,
 * caught by the new "Moment win rate" harness suite built to check exactly
 * this (ROADMAP.md): `midLate` won 48.1% of races on its own, independent of
 * style, against a fair 12.5% — because its window [0.55, 0.9] happened to
 * END exactly where the universal stretch began, so it never eased off at
 * all, running near-max effort continuously for 60% of the race. `late`'s
 * window ending at the literal finish (1.0) had the same "never eases off"
 * property, just for a shorter continuous span (35%). `early` and `earlyMid`,
 * whose windows close well before the universal stretch, got force-cooled
 * for up to 65% of the race before rejoining — nowhere near comparable total
 * time at effort. The win-rate gap tracked total TIME AT MAX EFFORT almost
 * exactly, not window width or position on their own.
 *
 * The fix: decouple "how long a horse runs flat out" from "how wide this
 * Moment's window is" entirely. The window still governs the KICK (when it
 * lands at full strength — MOMENT_WINDOWS, unchanged), but the EFFORT surge
 * around it is now a fixed duration for everyone, so no Moment gets a
 * structurally longer run at max effort just because of where its window
 * happens to sit relative to the finish.
 */
export const MOMENT_COMMIT_DURATION = 0.35;

/**
 * Race progress past which EVERY horse commits flat out regardless of its
 * own Moment — a short universal "down the stretch" close for whichever
 * Moments finish their own fixed-duration surge well before the finish
 * (`early`, `earlyMid`). Kept narrow deliberately: a wide one is what
 * created the `midLate` bug above by handing some Moments a free, unearned
 * extension of their own surge.
 */
export const UNIVERSAL_FINAL_STRETCH = 0.94;

/**
 * MOMENT PROFILES — a horse's moment in the race, not just its place on the
 * track. Position (style, above) says where a horse belongs; this says WHEN
 * it shines. Without this a `late` horse is merely "the one that kicks late"
 * rather than one whose whole speed curve builds to it. Values are speed
 * multipliers at the centre of each third, smoothly interpolated between.
 *
 * Crucially these are scaled by MOMENT FIDELITY — how faithfully the horse
 * has actually held its preferred pack position so far (style's job). A
 * `late` horse only gets its finishing surge if it genuinely raced its
 * style's position early. The moment has to be earned.
 *
 * Moved here from PHASE_PROFILES (style-keyed) when Moment was split out from
 * Style as its own attribute — the owner's framing: style determines pack
 * position (and where charge regen is best), Moment determines optimal kick
 * timing AND strength, including this passive curve. Values are carried over
 * from the old style-keyed table rather than re-guessed: `early` ~ the old
 * frontRunner curve, `late` ~ the old closer curve (both harness-tuned across
 * two rounds — see the retune history this replaced), `midLate` ~ the old
 * stalker/midPack average (both were mild, similar curves — "round the turn"
 * matches that identity), and `earlyMid` is new, interpolated between `early`
 * and `midLate` since no style occupied that shape before. NOT yet re-verified
 * against the harness under the new per-horse Moment rolls — every style can
 * now land on any Moment, weighted (MOMENT_WEIGHTS_BY_STYLE), so the balance
 * this table was tuned against no longer holds exactly. Re-verify before
 * calling this done (ROADMAP.md).
 */
export const MOMENT_PROFILES = {
  //           early    middle    late
  early: { early: 0.085, middle: 0.007, late: 0 },
  earlyMid: { early: 0.04, middle: 0.015, late: 0.008 },
  midLate: { early: 0, middle: 0.022, late: 0.017 },
  late: { early: -0.027, middle: -0.001, late: 0.038 },
} as const satisfies Record<Moment, { early: number; middle: number; late: number }>;

/**
 * How likely each Moment is, per running style — independent, but weighted so
 * archetypes stay sensible (a "quick-start closer" makes no sense; a
 * "quick-start frontRunner" does — Derby Owners Club's naming for exactly this
 * kind of archetype). A gradient from most early-committed to most
 * late-committed:
 *
 *   frontRunner — sharply `early`. Asserts the lead in its window, then has
 *     to hold it. The only style `early` makes sense for at all.
 *   midPack — the generalist, deliberately flat across the latter three
 *     (roughly a third each). No strong opinion on when it moves; "mid" in
 *     timing as much as in position.
 *   stalker — leans `late` hard, same general shape as closer, but keeps
 *     real weight on `midLate` too — willing to make its move a little
 *     earlier, sneaking into contention before the closers arrive.
 *   closer — the purest, latest-committed identity: overwhelmingly `late`,
 *     barely anything earlier than that.
 *
 * Every Moment stays reachable for every style except the one combination
 * flagged as nonsensical (`early` for the patient styles, at 0%) — a real
 * roll, not a fixed assignment, so two horses of the same style can still
 * kick at different points.
 */
export const MOMENT_WEIGHTS_BY_STYLE = {
  frontRunner: { early: 0.7, earlyMid: 0.15, midLate: 0.1, late: 0.05 },
  stalker: { early: 0, earlyMid: 0.15, midLate: 0.35, late: 0.5 },
  midPack: { early: 0, earlyMid: 0.33, midLate: 0.33, late: 0.34 },
  closer: { early: 0, earlyMid: 0.05, midLate: 0.2, late: 0.75 },
} as const satisfies Record<RunningStyle, Record<Moment, number>>;

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
 * How much of the CONTESTED-lead cost (pressCost, engine.ts) each style
 * shrugs off — separate from FRONT_COST_RELIEF above, which only discounts
 * the baseline "you're up front" tax (leadCost). A front-runner already pays
 * leadCost almost in full (relief 0.02): that alone is its brake against
 * holding a lead forever. Stacking the FULL contest tax on top as well left
 * it double-taxed for doing the one thing its style is built to do — hold a
 * lead under pressure. Not full immunity, so contesting a front-runner's lead
 * still means something (the upset mechanism this was built to protect).
 */
export const PRESS_COST_RELIEF = {
  frontRunner: 0.5,
  stalker: 0.85,
  midPack: 0.95,
  closer: 1,
} as const satisfies Record<RunningStyle, number>;

/**
 * The three beats every horse races: ESTABLISH, then HOLD, then COMMIT.
 *
 * HOLD cruises at the style's own `cruiseEffort` (STYLE_PROFILES above), not
 * a single universal number — a navigational baseline, not a spending
 * decision now that there is no energy to budget. Without a hold phase the AI
 * has no reason to stay off a full sprint the moment it reaches its
 * preferred spot, which would collapse every style into the same shape.
 *
 * A single global HOLD_EFFORT (0.55) was tried first and sat ABOVE every
 * style's cruiseEffort (0.5, or 0.46 for closer) — meaning `restraint`
 * (CHARGE_REGEN_HOLD_GAIN, engine.ts: riding below cruise banks bonus regen)
 * could never trigger for a horse simply holding its established slot. A
 * closer used to dip below 0.46 during quieter stretches and bank charges
 * from it; pinned to a universal 0.55 it never did. Cruising at the style's
 * own cruiseEffort restores that: each style's baseline IS its restraint
 * threshold, not a fixed number sitting above all of them.
 */
/** Establishing position is a bounded one-off push, not an ongoing effort. */
export const ESTABLISH_UNTIL = 0.28;
export const ESTABLISH_GAIN = 2.2;

/**
 * How hard the AI corrects toward its preferred position, once outside
 * tolerance. Lowered from 0.5 — a style with a narrow, contested preferred
 * slot near the edge of the pack (frontRunner: preferred 0.06, tolerance
 * 0.18, competing with every other forward-leaning entry for that same
 * sliver) essentially never re-enters "established" and pays this
 * correction continuously for most of the race. Since effort has no cost in
 * this economy (charges are never actually gated for AI), that continuous
 * correction was a real, free, ongoing speed advantage having nothing to do
 * with style identity or Moment — see NON_COMMIT_EFFORT_CAP above for the
 * fuller diagnosis (ROADMAP.md, "Moment win-rate investigation").
 */
export const POSITION_CORRECTION_GAIN = 0.22;

/**
 * Ceiling on effort OUTSIDE a horse's own committing window. Since charges
 * are never actually gated for AI (a horse never spends more than
 * MAX_KICKS_PER_MOMENT out of CHARGE_CAPACITY, always plenty of time to
 * regen — ROADMAP.md), sustained effort has NO cost in this economy: nothing
 * stops a horse from just running higher than cruise for free outside its
 * window. That is exactly what frontRunner's own tolerance-band scrambling
 * did — its preferred slot is narrow and contested, so it spent nearly half
 * the race in the drifted-HOLD correction branch at 0.63-0.86 effort, a real
 * and completely free speed advantage having nothing to do with its Moment.
 * Lowered from 0.86 so extended position-fighting can't quietly buy the same
 * speed a genuine commit does.
 */
export const NON_COMMIT_EFFORT_CAP = 0.65;
export const MAX_EFFORT = 1;
export const MIN_EFFORT = 0.18;
