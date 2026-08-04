/**
 * Race simulation constants.
 *
 * Every number the race runs on lives here, and nowhere else. See REBUILD.md
 * §13 for the reasoning behind each block, and §1 for the rules these numbers
 * exist to serve.
 *
 * WORKING UNITS ARE METRES AND SECONDS. There is deliberately no `TIME_SCALE`
 * lever: race duration falls straight out of BASE_SPEED. The old one was
 * order-1 in time while BASE_ACCEL is order-2 (m/s²), and getting that
 * exponent wrong silently moved front-runner win rate by 1.4 points. With no
 * scale factor, the bug cannot exist.
 *
 * Before changing anything here, read REBUILD.md §17 — the do-not list. Every
 * row on it is a change that was tried, measured, and failed.
 */

// ---------------------------------------------------------------------------
// Clock and scale
// ---------------------------------------------------------------------------

/** Simulation ticks per second. Fixed; the renderer interpolates between them. */
export const TICK_HZ = 30;

/**
 * Metres per second for a 50-Speed horse at reference pace, perfect conditions.
 *
 * Sets the whole clock. At an average pace factor of ~0.98 this gives ~20.6 m/s
 * effective, so 1609 m (8f) runs ~78 s and a 700 m dash ~34 s — the owner's
 * spec: most races short, 8f in the 60-90 s band.
 */
export const BASE_SPEED = 21.0;

/**
 * How much of BASE_SPEED the whole 0-100 Speed range is worth. ±4%.
 *
 * This looks far too small and it is deliberate. Over 1609 m a 1% speed edge is
 * already ~16 m, which is ~6.7 lengths, and real winning margins are 0-5. A
 * field inside one division spans ~17 Speed points, so ~1.4%, so ~9 lengths
 * across all eight horses — a believable race rather than the 28-length tails
 * the old build produced.
 *
 * It also delivers DESIGN.md §4's dominance curve directly: a 5% stat edge buys
 * 0.4% speed (almost nothing, as specified), a 40% edge buys 3.2% (dominance).
 */
export const SPEED_STAT_SPAN = 0.08;

/**
 * m/s² at 50 Burst. Burst owns the gate break and how fast a kick bites.
 *
 * A real thoroughbred is near racing speed 3-4 seconds out of the gate. At the
 * 3.0 this started at it took 6.9 s and ~71 m, which is not just unrealistic —
 * it eats the front of the race. While a horse is still accelerating it is
 * ACCEL-limited rather than pace-limited, so neither a pace bonus nor a kick
 * does anything for it: it is already going flat out toward a target it is
 * nowhere near. That dead zone was 5% of a 1400 m race and 10% of a 700 m one,
 * and most races in this game are 600-900 m — so the early Moment lost a tenth
 * of its window to physics nobody could ride around.
 *
 * At 5.5 the same horse is up to speed in ~3.7 s and ~38 m: 2.7% of a 1400 m
 * race, 5% of a 700 m one. An early kick now lands on a horse that can use it.
 */
export const BASE_ACCEL = 5.5;

/** Full 0-100 Burst range as a fraction of BASE_ACCEL. 0.7x .. 1.3x. */
export const BURST_ACCEL_SPAN = 0.6;

/** Slowing down is easier than speeding up. */
export const DECEL_MULT = 1.5;

/** A length, in metres. Used only for reporting margins. */
export const METRES_PER_LENGTH = 2.4;

// ---------------------------------------------------------------------------
// Speed pipeline bounds — these enforce REBUILD.md R1 and R2
// ---------------------------------------------------------------------------

/** Floor of the pace curve. A horse sitting right off the pace. */
export const PACE_MIN = 0.94;

/** Ceiling of the pace curve. Full cruise. Only a kick may go above this. */
export const PACE_MAX = 1.0;

/** Added to the pace factor while taking a pull. */
export const HOLD_DELTA = -0.03;

/** Absolute floor once HOLD_DELTA is applied. */
export const HOLD_FLOOR = 0.92;

/**
 * The most a kick may ever add, after every modifier. HARD CLAMP.
 *
 * The 2x-launch bug came from four multiplicative kick modifiers with no
 * ceiling compounding on a closer running from behind. Modifiers may change how
 * EASILY a horse reaches this cap. They may never change where it is.
 */
export const KICK_MAX_BONUS = 0.13;

/**
 * Speed factor of a completely empty horse.
 *
 * Still the largest single penalty in the game, but nothing like the 0.88 this
 * started at. Measured: at 0.88 fatigue was a 12% swing against a 2.2% pace
 * band and a 6% kick, so it swamped every other lever — a kick gained ~0.13% of
 * race time and cost ~1.8% by bringing the empty point forward, making kicks
 * net-NEGATIVE and handing the race to whichever style planned fewest of them.
 *
 * Softened again from 0.94 for the same reason one level down. A kick is only
 * ever worth firing if the ground it gains outweighs the fatigue it brings
 * forward, and at 0.94 that was true only inside the final fifth of the race —
 * a player who simply never kicked beat almost every ride that did. THE COST
 * GRADIENT IS THE POINT and is deliberately kept: a kick near the line is
 * nearly free because there is no race left to pay it back in, while an early
 * one carries a long bill. That gradient is what makes timing a skill. What
 * changed is the magnitude, so that spending is worthwhile across most of the
 * race rather than only in the last furlong.
 */
export const FATIGUE_FLOOR = 0.96;

/**
 * Tank level at which fatigue starts to bite. A smooth ramp below, never a cliff.
 *
 * Held EQUAL TO KICK_TANK_COST on purpose, so the last charge dot going out and
 * fatigue beginning are the same moment. That is what lets the dots the HUD
 * already draws be an honest readout of a hidden budget (REBUILD.md §5.5) —
 * change one of these two numbers and you must change the other.
 */
export const FATIGUE_START = 0.15;

/**
 * Harness invariant (REBUILD.md I2), not a tuning value.
 *
 * No runner may ever exceed `cruise * preRace * this`. Asserted every tick of
 * every race in the harness so the launch bug cannot silently return.
 */
export const ABSOLUTE_SPEED_CEILING = 1.14;

// ---------------------------------------------------------------------------
// The tank — the one conserved quantity (REBUILD.md R6, §5)
// ---------------------------------------------------------------------------

/** Every horse starts full. */
export const TANK_START = 1.0;

/**
 * The pace the tank is calibrated against.
 *
 * Set to the average pace of EVERY style's curve, which are equal by
 * construction (see pace.ts, STYLE_BASE). So the horse the economy is measured
 * against is an average horse running its own race, whatever style that is —
 * not one style's baseline that every other style is then judged against.
 */
export const REFERENCE_PACE = 0.971;

/**
 * Metres within which a rival counts as pressing you.
 *
 * The only pack interaction in the simulation besides drafting, and like
 * drafting it is TANK-side — nothing here touches speed (R1).
 */
export const PRESS_RANGE_METRES = 5.0;

/**
 * Extra drain per pressing rival, for a horse in the front of the field.
 *
 * DESIGN.md §4 requires that "when two front-runners refuse to yield they burn
 * each other out, the leading group empties at once, and a closer sweeps past".
 * Nothing in the first build of this rebuild delivered it: pace curves are
 * fixed per horse, so a lone leader and one of three duelling leaders ran the
 * identical race and B3 could never pass. Being pressed costs tank; the horses
 * doing the pressing pay it too, which is what makes a duel mutually
 * destructive rather than a tax on whoever happens to be in front.
 */
export const PRESS_COST = 0.1;

/** Rank at or above which a horse is "in front" and can be pressed. */
export const PRESS_RANK_LIMIT = 3;

/** Never more than this many rivals count, so a bunched field cannot run away. */
export const PRESS_MAX_RIVALS = 2;

/**
 * No press before this much of the race has run.
 *
 * At the gate every horse is inside PRESS_RANGE_METRES of every other, so
 * without a grace period the front three paid maximum press from tick one —
 * measured, and it drove frontRunner to a 0.0% win rate. That is not a
 * contested lead, it is a field that has not spread out yet.
 */
export const PRESS_FROM = 0.2;

/**
 * How sharply cost rises with pace. THIS IS THE WHOLE GAME.
 *
 * At 12, running just 2.5% above reference costs 34% more tank. That steepness
 * is why going too fast early is genuinely punished, and therefore why pace
 * collapse produces upsets on its own rather than needing a fudge factor
 * (DESIGN.md §4). If pace collapse ever stops producing upsets, look here and
 * at TANK_RACE_COST — never at the kick.
 */
export const DRAIN_EXPONENT = 12;

/**
 * Tank spent over a whole race held exactly at REFERENCE_PACE.
 *
 * Drain is charged against race PROGRESS rather than wall-clock seconds, which
 * is what lets one set of constants serve a 600 m dash and a 2400 m route.
 */
export const TANK_RACE_COST = 3.0;

/**
 * Tank recovered over a whole race, before Stamina and drafting.
 *
 * DELIBERATELY BELOW TANK_RACE_COST. The tank is a race-long budget that every
 * horse is spending down, not a bucket that sits brim-full — at parity the
 * first probe run showed closers holding 5 charges from gate to wire, so their
 * early sag bought them nothing at all and they simply lost 40 lengths for
 * free. Below parity, sitting off the pace genuinely banks, and HOLD is the
 * only state where a horse gains ground on its own budget.
 */
export const TANK_RECOVER_RATE = 2.4;

/**
 * Full 0-100 Stamina range as a fraction of TANK_RECOVER_RATE. 0.75x .. 1.25x.
 *
 * Stamina sets regen RATE, continuously — never tank size. Capacity as an
 * integer breakpoint would make training feel dead everywhere except at the
 * breakpoint; a rate means every point pays off the moment it is trained.
 */
export const STAMINA_RECOVER_SPAN = 0.5;

/**
 * Recovery bonus while drafting. The only effect drafting has (REBUILD.md §9).
 *
 * This is the MIDDLE of the field's structural advantage, and it has to be
 * worth something for stalker and midPack to have a win condition at all: a
 * front-runner wins by getting an easy lead, a closer by keeping everything for
 * the run home, and if shelter pays less than leading does then the two styles
 * in between are simply squeezed. Measured at 0.2 they drafted 35-40% of every
 * race — by far the most in the field — and still finished worst.
 */
export const DRAFT_RECOVER_BONUS = 0.34;

/**
 * Recovery bonus for a leader nobody is pressing — racing's "easy lead".
 *
 * The counterweight to PRESS, and the reason front-running is a strategy rather
 * than pure cost. Without it a leader had every disadvantage and no upside: it
 * cannot draft (there is nobody ahead to shelter behind) and it pays press the
 * moment anyone closes, so frontRunner measured 0.6% against a fair 12.5%.
 *
 * A horse allowed to dictate its own tempo in front is genuinely having an
 * easier time of it. When three front-runners refuse to yield, none of them
 * gets this and all of them pay press instead — which is exactly the collapse
 * DESIGN.md §4 asks for, now driven from both directions.
 *
 * Raised to 0.45 while the field was still bunched and this almost never
 * triggered; once STYLE_BASE was widened and leads became real, it started
 * paying out 30% of every race and pushed frontRunner to +32%. Cut back to suit
 * the field that actually exists now.
 */
export const EASY_LEAD_RECOVER_BONUS = 0.28;

/**
 * Tank spent per kick. Also the size of one charge dot.
 *
 * Sized against the number of kicks a style plans (KICK_PLAN, rider.ts) so the
 * TOTAL a race costs in kicks stays near 0.48 of the budget. When the patterns
 * went from three kicks to four — so a front-runner could keep two back to
 * defend its lead — leaving this at 0.15 quietly raised every style's kick
 * spend from 0.45 to 0.60 and pushed midPack to -31% off fair share.
 */
export const KICK_TANK_COST = 0.15;

/**
 * Charge dots shown. The dots ARE the tank, quantised — floor(tank / cost).
 *
 * With cost 0.15 the last dot goes out at tank 0.15, exactly where FATIGUE_START
 * begins to bite. That coincidence is not luck, it is the reason the existing
 * HUD needs no extra instrumentation to be honest.
 */
export const CHARGE_CAPACITY = 5;

// ---------------------------------------------------------------------------
// The kick (REBUILD.md §8)
// ---------------------------------------------------------------------------

/**
 * Seconds a kick lasts.
 *
 * Lengthened from 4.0 rather than raising KICK_MAX_BONUS further, because the
 * problem was a kick's VALUE, not its peak: at 4 seconds one gained about 0.75
 * lengths while costing 0.12 of tank, which brings the empty point forward far
 * enough to cost around 4 lengths in fatigue. Kicks were net-negative, and it
 * showed — a player who never kicked at all won 13.8%, ABOVE fair share, purely
 * by not spending what everyone else was wasting.
 *
 * Buying the value back through duration keeps the top speed of a kicking horse
 * sane and leaves the I2 ceiling comfortable. A longer, flatter surge also
 * reads better on screen than a sharper one.
 */
export const KICK_DURATION = 4.5;

/**
 * Seconds from firing one kick until another may be fired.
 *
 * A horse cannot lunge repeatedly — it produces an effort, then has to come
 * back to itself before producing another. Real thoroughbreds manage two or
 * three sustained efforts in a race, not ten.
 *
 * This is the constraint that makes TIMING matter rather than volume, and it
 * was missing: with the tank as the only limit a player could afford ten kicks
 * and fire one every time the last expired, covering 60 seconds of a 70-second
 * race. The kick stopped being a lunge and became a gear, and mashing beat
 * every timed ride outright (spam 13.5%, a ride matched to the horse's own
 * style 11.8%). It is the same failure the previous build recorded — "repeat
 * kicks fired close together read as one continuous boosted state" — arrived at
 * from the other direction.
 *
 * It is a SPACING, not a cap on how many kicks a race may contain: the owner's
 * rule that a player who wants to spend their charges may, well or badly,
 * still holds. What it removes is the option of spending them all at once.
 */
export const KICK_COOLDOWN = 12.0;

/** Seconds ramping in. */
export const KICK_RAMP = 0.5;

/** Seconds decaying out. */
export const KICK_DECAY = 1.5;

/**
 * Strength weights. Grit x Burst x jockey skill.
 *
 * Deliberately NOT scaled by how full the tank is: a horse on five charges and
 * one on a single charge kick equally hard. The bank gates WHETHER you can
 * fire, never HOW HARD.
 */
export const KICK_GRIT_WEIGHT = 0.45;
export const KICK_BURST_WEIGHT = 0.3;
export const KICK_JOCKEY_WEIGHT = 0.25;

// ---------------------------------------------------------------------------
// Distance preference (REBUILD.md §7)
// ---------------------------------------------------------------------------

/** Metres. Range of preferred-distance centres rolled at generation. */
export const DIST_CENTRE_MIN = 700;
export const DIST_CENTRE_MAX = 2400;

/** Metres. Range widths. Narrow is a specialist, wide is versatile. */
export const DIST_WIDTH_MIN = 200;
export const DIST_WIDTH_MAX = 700;

/** Speed factor inside the preferred range, for the widest possible horse. */
export const DIST_PEAK_BASE = 1.0;

/** Extra peak a maximally narrow specialist gets. The other half of the trade. */
export const DIST_PEAK_NARROW_BONUS = 0.02;

/** Speed factor once fully out of range. A sprinter over a route gets beaten. */
export const DIST_FLOOR = 0.96;

/** Metres outside the range over which the penalty reaches DIST_FLOOR. */
export const DIST_TOLERANCE = 500;

// ---------------------------------------------------------------------------
// Pre-race factors (REBUILD.md §10) — computed once at the gate, then frozen
// ---------------------------------------------------------------------------

/** Daily form spread for a maximally professional (100 Temper) horse. */
export const FORM_BASE_SPREAD = 0.004;

/** Extra spread as Temper falls. Low Temper swings bigger in BOTH directions. */
export const FORM_TEMPER_AMPLIFY = 0.01;

/** Chance of a fumbled start at 0 Consistency. Scales down as Consistency rises. */
export const FUMBLE_BASE = 0.22;

/** Seconds a fumbled starter is stuck at PACE_MIN. */
export const FUMBLE_DURATION = 1.6;

/** Chance of running below true ability at 0 Consistency. */
export const OFF_COLOUR_BASE = 0.16;

/** Speed factor applied all race when off-colour. Surfaced live, never silently. */
export const OFF_COLOUR_PENALTY = 0.985;

/** Seconds a green moment costs. */
export const GREEN_DURATION = 1.2;

/** Chance of each of up to two green moments, at 0 Consistency. */
export const GREEN_BASE = 0.3;

/** Condition 0-100 maps into this speed factor range. */
export const CONDITION_MIN_FACTOR = 0.985;
export const CONDITION_MAX_FACTOR = 1.0;

/** Morale 0-100 maps into this speed factor range. */
export const MORALE_MIN_FACTOR = 0.99;
export const MORALE_MAX_FACTOR = 1.005;

/** Going penalty at its worst (heavy, no suiting trait) and best. */
export const GOING_MIN_FACTOR = 0.98;
export const GOING_MAX_FACTOR = 1.005;

// ---------------------------------------------------------------------------
// The rider (REBUILD.md §11)
// ---------------------------------------------------------------------------

/**
 * How close to its target a horse must be running before a rider will kick.
 *
 * A horse that has not finished accelerating is ACCEL-limited, not pace-limited:
 * it is already going flat out toward a target it is nowhere near, so a kick
 * raises a ceiling it cannot reach and the charge buys nothing. A rider waits
 * for the horse to be up to speed before asking. Cheap, obvious, and it is why
 * the early phase of a race no longer eats charges for free.
 */
export const KICK_READY_FRACTION = 0.97;

/** Below this tank level, and before its spending phase, a horse takes a pull. */
export const HOLD_TRIGGER_TANK = 0.8;

/**
 * Tank level at which a rider eases regardless of phase — the recovery ride.
 *
 * Set at FATIGUE_START, so a horse takes a pull exactly when fatigue begins to
 * bite rather than grinding on while being punished for it.
 */
export const RECOVERY_RIDE_TANK = 0.15;

/**
 * Past this much of the race, nobody eases any more — the wire is close enough
 * that finishing beats recovering, empty or not.
 */
export const RECOVERY_RIDE_UNTIL = 0.85;

// ---------------------------------------------------------------------------
// Keeping in touch (REBUILD.md §6.6)
//
// A patient horse still has to stay in the race. Without this a closer simply
// rides its curve while the field walks away, and a race it was never in is
// not patience, it is coasting.
//
// THIS IS NOT A CATCH-UP MECHANIC, and the distinction is the one that matters
// most in this file. R3 forbids any speed bonus that grows with how far behind
// a horse is — that positive feedback loop is exactly what produced the 2x
// launch. What this does instead is let a horse ASK FOR MORE OF ITS OWN
// CEILING: the lift is added to its pace curve, still clamped by the same
// PACE_MAX every horse shares, and still charged at the full superlinear drain
// rate. A horse that has to chase pays for the chase and arrives with less in
// the tank. It never goes faster than a horse that did not have to.
// ---------------------------------------------------------------------------

/** Lengths clear of this horse before its rider starts asking for more. */
export const CONTACT_LENGTHS = 6;

/** Further behind than this and the horse is asking for everything it has. */
export const CONTACT_RAMP_LENGTHS = 14;

/**
 * The most contact may add to a horse's pace, before the PACE_MAX clamp.
 *
 * Small on purpose. It buys a horse the top of its own range sooner than its
 * curve would have; it cannot buy anything above that range.
 */
export const CONTACT_MAX_LIFT = 0.018;

/** How far each step of Moment shifts a style's kick window. */
export const MOMENT_KICK_SHIFT = 0.08;

/**
 * Timing jitter on planned kicks, at 0 jockey skill.
 *
 * This is the number that makes player skill worth anything at all, which is
 * not obvious and was found by measurement. The player's horse runs the same
 * base ride as every opponent, so if that ride were executed perfectly there
 * would be no headroom above it and riding well could only ever MATCH riding
 * not at all — measured exactly so: a player riding precisely to their horse's
 * own style won 11.2% against a hands-off autopilot's 12.7%, a tie inside
 * noise, with every other strategy well below.
 *
 * A jockey that mistimes is a jockey a paying-attention player can improve on.
 * Raised from 0.18, where an open-division jockey's kick points scattered by
 * only about 0.05 of the race and there was nothing to correct.
 */
export const JOCKEY_JITTER = 0.38;

/** Chance of throwing one kick away entirely, at 0 jockey skill. */
export const JOCKEY_WASTE = 0.35;

/** Chance of never taking a pull all race, at 0 jockey skill. */
export const JOCKEY_MISS_HOLD = 0.3;

/** Seconds of staleness on the player's charge dots, at 0 jockey skill. */
export const JOCKEY_READOUT_LAG = 0.8;

/** Flicker on the regen arrows, at 0 jockey skill. */
export const JOCKEY_READOUT_NOISE = 0.35;

// ---------------------------------------------------------------------------
// Drafting and lanes (REBUILD.md §9)
// ---------------------------------------------------------------------------

/** Metres ahead within which a runner catches another's slipstream. */
export const DRAFT_RANGE_METRES = 4.0;

/** Lane separation still close enough to draft. */
export const DRAFT_LANE_TOLERANCE = 1;

/** Lanes across the track. Visual separation and the drafting test; nothing blocks. */
export const LANE_COUNT = 8;

// ---------------------------------------------------------------------------
// Trait effects (REBUILD.md §13.7)
//
// Every one is a TANK modifier, never a speed modifier — R1 allows exactly five
// factors to write to speed and traits are not one of them.
// ---------------------------------------------------------------------------

export const TRAIT_IRON_LUNGS_RECOVER = 1.12;
export const TRAIT_THIRSTY_RECOVER = 0.9;
export const TRAIT_QUICK_RECOVERY_DRAFT = 2.0;
export const TRAIT_CRUISER_EXPONENT_RELIEF = 2;
export const TRAIT_ALERT_FUMBLE = 0.4;
export const TRAIT_GATE_RUSHER_EARLY = 0.015;
export const TRAIT_GATE_RUSHER_PAYBACK = -0.01;
