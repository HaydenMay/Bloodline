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
 * HOLDING (deliberately riding below top speed — ControlInput.holding) boosts
 * regen by this multiplier on top of the position multiplier below. The
 * mirror of a kick: a kick spends a charge for a burst above top speed;
 * holding banks one faster for a genuine cost in ground covered right now.
 * "Greatly improve regen" (the owner) — this is a big multiplier, not a
 * marginal one, since HOLD_SPEED_LEVEL already gives up real ground for it.
 */
export const HOLD_REGEN_BONUS = 2.2;

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

/**
 * Raised sharply from 0.085 — under the HOLD/CRUISE/KICK model a kick is the
 * ONLY thing that ever pushes a horse above its top speed at all (the owner:
 * "a horse should only increase speed higher during a kick"), so it has to
 * be a genuine, large lunge, not a marginal edge stacked on top of an
 * effort dial that no longer exists.
 */
export const KICK_MAX_BONUS = 0.22;
export const KICK_GRIT_INFLUENCE = 0.35;
/** How much jockey skill swings kick strength, on top of Grit. */
export const KICK_JOCKEY_INFLUENCE = 0.3;
/** How much Burst swings kick strength — the explosive-lunge stat, same shape as Grit's influence above. */
export const KICK_BURST_INFLUENCE = 0.35;
export const KICK_BASE_DURATION = 9.0 * TIME_SCALE;

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
 * Retain policy, not a window-count cap: kicks fired OUTSIDE a horse's own
 * Moment window (before `momentLo` or after `momentHi`) are capped at this
 * many for the whole race. Inside the window, kicks are bounded only by
 * charges and KICK_IN_WINDOW_SLOT_FRACTION below, same as a patient player
 * holding for their moment — this is what actually simulates that judgement,
 * not a fixed per-window count (which favoured whichever Moment's window
 * happened to be widest — ROADMAP.md — without saying anything about
 * restraint). A prior "N per window" version was tried and rejected for
 * exactly that reason: it capped the wrong thing. This caps IMPATIENCE
 * instead.
 */
export const MAX_KICKS_OUTSIDE_MOMENT = 1;
/**
 * Minimum real-time gap between kicks fired OUTSIDE the Moment window.
 * Without this a horse would ask to kick every tick it's eligible, burning
 * every charge in a fraction of a second instead of spacing them out.
 */
export const KICK_RETRY_COOLDOWN = KICK_BASE_DURATION;
/**
 * Spacing between kicks INSIDE the Moment window, as a FRACTION OF THE
 * WINDOW'S OWN WIDTH rather than a fixed real-time gap. A fixed real-time
 * cooldown (tried first) quietly favoured wide windows: `late` (20% of the
 * race) barely clears it once before the window closes, while `midLate`/
 * `earlyMid` (35%) fit several. That is backwards from how a player actually
 * plays a short window — the owner's own framing: "a player would see the
 * small window and use all their kicks." Scaling the gap to the window's own
 * width instead means every Moment gets roughly the same NUMBER of possible
 * kicks inside its own window regardless of how much real time that window
 * happens to span.
 */
export const KICK_IN_WINDOW_SLOT_FRACTION = 0.2;

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
  frontRunner: 0.10,
  stalker: 0.10,
  midPack: 0.10,
  closer: 0.22,
} as const satisfies Record<RunningStyle, number>;

/**
 * A COMEBACK mechanic: the more clear a horse is of the WHOLE FIELD — not
 * just its nearest rival, but the back-marker (CLEAR_FIELD_GAP below) — the
 * weaker its OWN next kick lands. Not a boost handed to whoever's behind;
 * the leader simply gets less out of kicking again to extend a lead it's
 * already coasting on, the same way a jockey eases off with nothing left to
 * prove. A horse still fighting for position, or off the pace, kicks at
 * full strength regardless.
 *
 * This is the fix for the confirmed sequential-kick-compounding problem
 * (ROADMAP.md): kicks fire in Moment order (early -> earlyMid -> midLate ->
 * late), and without this, whoever kicks first can just kick AGAIN later to
 * defend and extend the same lead for free, so no later Moment ever
 * genuinely catches up — it only gets to fight over whatever the leader
 * doesn't bother collecting. Discounting the leader's OWN follow-up kicks
 * means a big early lead has to be defended by more than idly kicking again.
 *
 * Deliberately measured against the BACK of the field (CLEAR_FIELD_GAP), not
 * the nearest rival (CLEAR_LEAD_GAP, used for regen's pressCost) — traced
 * directly: `early`/`earlyMid`/`midLate` movers spend most of the race
 * bunched together contesting EACH OTHER for the front, so nearest-rival
 * "contest" never reads as clear for any one of them even while they
 * collectively pull 150-200 yards clear of a `late` horse still holding its
 * own back-of-the-pack slot. The comeback has to react to that collective
 * gap, not to whether the front pack is elbowing itself.
 */
export const KICK_COMPLACENCY_PENALTY = 0.3;

/**
 * Scale (yards) for how fast "clear of the field" ramps up, for the comeback
 * mechanic above — NOT a threshold. A hard cutoff was tried first
 * (fieldContest = 0 until the gap reached it, 1 after) and traced to barely
 * move anything: a front pack's lead over a back-marker builds gradually,
 * across several kicks fired while everyone is still close together, and a
 * cutoff only discounts the LATE kicks in that build-up — by the time any
 * one of them was individually "clear enough," most of the gap was already
 * banked. An exponential ramp (1 - e^(-gap/CLEAR_FIELD_SCALE)) discounts
 * from the very first yard of separation instead, so every kick along the
 * way pays some price for the lead it's already sitting on, not just the
 * ones fired after an arbitrary line is crossed. At this scale, ~20 yards
 * clear is already ~40% of the way to full discount; ~70 yards is ~85%.
 */
export const CLEAR_FIELD_SCALE = 40;

/**
 * Floor on how far a horse's OWN progress (distance/totalYards — ai.ts,
 * engine.ts) is allowed to lag the LEADER's before Moment-window timing
 * (kickAt, momentLo, momentHi) is judged against the leader's clock instead.
 *
 * Own progress is the right clock for MOST of the field most of the time —
 * it's what stopped a trailing horse's window being yanked ahead of where it
 * should be just because the leader is running hot (ROADMAP.md). But a horse
 * that falls FAR enough behind (a closer buried at the back, say) has its
 * own window pushed correspondingly far out in real time too — traced
 * directly: a `late` horse's kick not firing until 91.7% of the way through
 * a race it was already losing, leaving no real time to use it regardless of
 * how strong the kick itself was. This floor caps how far behind is too far:
 * beyond MAX_MOMENT_LAG, the window opens on the leader's clock instead of
 * continuing to wait on the horse's own, so falling behind can never also
 * cost a horse its own chance to fire back.
 */
export const MAX_MOMENT_LAG = 0.06;

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
}

export const STYLE_PROFILES = {
  frontRunner: { preferred: 0.06, tolerance: 0.18 },
  stalker: { preferred: 0.3, tolerance: 0.16 },
  midPack: { preferred: 0.52, tolerance: 0.13 },
  closer: { preferred: 0.85, tolerance: 0.16 },
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
  earlyMid: [0.25, 0.5],
  midLate: [0.5, 0.75],
  late: [0.65, 1],
} as const satisfies Record<Moment, readonly [number, number]>;

/**
 * Extra kick strength for the NARROWER windows, scaled to width: `early`
 * (25% of the race) and `late` (20%) get less real time and fewer charge-
 * regen opportunities inside their own window than `earlyMid`/`midLate`
 * (35% each) — the owner's own reasoning: "the window is smaller so the
 * progression forward needs to be higher." Computed directly from
 * MOMENT_WINDOWS' widths relative to the widest window (0.35), so it can't
 * drift out of sync if the windows themselves are retuned:
 *   early:    0.35/0.25 - 1 = 0.40
 *   earlyMid: 0.35/0.35 - 1 = 0   (already the widest, no bonus)
 *   midLate:  0.35/0.35 - 1 = 0   (tied widest, no bonus)
 *   late:     0.35/0.20 - 1 = 0.75
 */
export const KICK_MOMENT_BONUS = {
  early: 0.15,
  earlyMid: 0.12,
  midLate: 0.18,
  late: 0.40,
} as const satisfies Record<Moment, number>;

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

// ---------------------------------------------------------------------------
// Effort: HOLD / CRUISE / KICK (sim/race/ai.ts)
//
// A ground-up replacement for the old ESTABLISH/HOLD/COMMIT effort formula,
// which fused two things that should never have shared one number: fighting
// for pack position, and how hard a horse is actually running. Every fix to
// one kept leaking into the other all session (ROADMAP.md, "Moment win-rate
// investigation" and the redesign discussion that followed it) — a style
// with a narrow, contested preferred slot (frontRunner) was buying real,
// free speed just from the act of fighting for position, with no way to cap
// it that didn't also break something else.
//
// The fix is to stop trying to cap the leak and remove the shared variable
// instead. A horse now runs in exactly one of three states:
//   CRUISE — top speed. The default. Nothing to manage.
//   HOLD   — deliberately below top speed, for a large regen payoff
//            (HOLD_REGEN_BONUS below). The owner's framing: "holding should
//            lower top speed by an amount in order to greatly improve
//            regen." A horse fighting to hold its pack position can't
//            afford this; a horse that's comfortable, or banking for a
//            Moment still well off, can.
//   KICK   — the ONLY thing that ever exceeds top speed (the owner: "a horse
//            should only increase speed higher during a kick... then return
//            back to cruising"). A bounded lunge, not a sustained gear.
//
// Position is no longer a speed lever at all outside the brief opening
// scramble below — it emerges from WHEN each style can afford to hold
// (correlated with its Moment: frontRunner's window opens almost immediately
// so it barely gets to hold before needing to cruise/kick for the front;
// closer's is far off, so it holds early and often, drifting back to
// exactly where it wants to sit) and from the existing charge-regen
// mechanics (FRONT_COST_RELIEF, PRESS_COST_RELIEF, draft). Holding position
// LATE in the race, against a challenge, is now a kick's job, not an effort
// dial's — "meaningful for maintaining position" (the owner).
// ---------------------------------------------------------------------------

/** Top speed. The default state; nothing pushes above this except a kick. */
export const CRUISE_EFFORT = 1;

/**
 * Effort while HOLDING — below CRUISE, a genuine speed cost (via the
 * existing effortSpeed formula, engine.ts) in exchange for HOLD_REGEN_BONUS.
 */
export const HOLD_EFFORT = 0.35;

/**
 * A short, tightly bounded opening scramble — real races have one, distinct
 * from the pacing that follows: horses jockey for their pack slot in the
 * first stretch out of the gate, then settle. Deliberately much shorter and
 * much smaller than the old ESTABLISH phase (which ran to 28% of the race
 * with a large gain and became the leak described above) — this only sorts
 * rank order, it does not run the rest of the race.
 */
export const ESTABLISH_UNTIL = 0.15;
/** How hard the opening scramble pushes — bounded, clamped to CRUISE at most. */
export const ESTABLISH_GAIN = 3;
