import type { Horse } from '../types.js';
import type { ControlInput, Controller, RaceView, RunnerView } from './types.js';
import { hasTrait } from '../../data/traits.js';
import {
  CHARGE_CAPACITY,
  CRUISE_EFFORT,
  ESTABLISH_GAIN,
  ESTABLISH_UNTIL,
  HOLD_EFFORT,
  KICK_IN_WINDOW_SLOT_FRACTION,
  KICK_RETRY_COOLDOWN,
  MAX_KICKS_OUTSIDE_MOMENT,
  MAX_MOMENT_LAG,
  MOMENT_WINDOWS,
  STYLE_PROFILES,
} from './constants.js';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The jockey AI.
 *
 * Three states, never more: CRUISE (top speed, the default), HOLD
 * (deliberately below top speed, banking charges fast for the Moment ahead),
 * and KICK (the only thing that ever exceeds top speed — a bounded lunge,
 * not a sustained gear). See constants.ts's "Effort: HOLD / CRUISE / KICK"
 * section for the full rationale — this replaces the old ESTABLISH/HOLD/
 * COMMIT formula, which fused position-fighting and raw speed into one
 * leaky variable.
 *
 * Position is no longer something this controller spends speed correcting
 * for, past a short opening scramble to sort rank order. A style's identity
 * now comes from WHEN it can afford to hold (correlated with its Moment) and
 * from the existing charge-regen mechanics (engine.ts), not from a
 * continuous drift-correction dial.
 *
 * The player's own races use the same shape of decision, with `effort` and
 * `holding` coming from the DRIVE control instead.
 */
export function createAiController(horse: Horse): Controller {
  const profile = STYLE_PROFILES[horse.style];
  const traits = horse.traits;

  // Jockey skill perturbs both where they aim and when they kick, so a poor
  // jockey is genuinely exploitable rather than just slightly slower.
  const skill = horse.jockeySkill / 100;
  const sloppiness = (1 - skill) * 0.14;

  const preferred = clamp(profile.preferred + (hasTrait(traits, 'tractable') ? 0 : 0), 0, 1);
  // Moment's window governs the kick (MOMENT_WINDOWS, engine.ts) — a poor
  // jockey is a little slower to start firing once it opens.
  const [momentLo, momentHi] = MOMENT_WINDOWS[horse.moment];
  const kickAt = momentLo + (1 - skill) * 0.05;
  // Spacing between IN-WINDOW kicks, scaled to this Moment's own window width
  // rather than a fixed real-time gap — a narrow window (`late`, 20%) gets a
  // proportionally tight gap so the AI can spend its bank in quick succession
  // before the window closes, exactly like a player who sees a short window
  // and taps it out, instead of being rationed by a cooldown sized for a wide
  // window and barely fitting once into a narrow one.
  const kickSlotGap = Math.max(0.005, (momentHi - kickAt) * KICK_IN_WINDOW_SLOT_FRACTION);

  // A horse may fire more than one kick if it has banked the charges for it
  // — it shouldn't be handcuffed to a single shot when it has ground left to
  // spend. Inside its own Moment window that's bounded only by charges and
  // kickSlotGap above, same as a patient player holding for their moment.
  // Past `momentHi` every kick is mistimed (weak, per windowFit in
  // engine.ts) and only burns the bank for near-zero gain, so those are
  // capped at MAX_KICKS_OUTSIDE_MOMENT — a little impatience is realistic,
  // spending the whole bank on kicks that do almost nothing is not.
  let kicksOutsideMoment = 0;
  let lastKickProgress = -Infinity;
  let lastKickElapsed = -Infinity;

  return (self: RunnerView, race: RaceView): ControlInput => {
    // The horse's OWN progress toward the finish, not race.progress (which
    // tracks the LEADER's distance over the total) — a horse running behind
    // the pace hasn't covered as much of ITS OWN race as the leader has of
    // theirs, so its kick window has to be judged against its own clock.
    const ownProgress = clamp(self.distance / race.totalYards, 0, 1);
    // But own progress alone can lag the leader's by MORE than MAX_MOMENT_LAG
    // for a horse that's fallen far behind — traced directly: a `late` horse
    // buried at the back had its own window not open until 91.7% of the way
    // through a race it was already losing. Past that lag, Moment-window
    // timing (kickAt, momentLo, momentHi below) is judged against the
    // leader's clock instead, so falling behind can never also cost a horse
    // its own chance to fire back.
    const momentProgress = Math.max(ownProgress, race.progress - MAX_MOMENT_LAG);

    const drift = self.fieldPosition - preferred;
    const outOfTolerance = Math.abs(drift) > profile.tolerance;

    // --- Effort: opening scramble, then HOLD or CRUISE ----------------------
    let effort: number;
    let holding = false;

    if (ownProgress < ESTABLISH_UNTIL && outOfTolerance) {
      // Opening scramble only — a short, bounded push to sort rank order,
      // not an ongoing effort. Behind the preferred slot, push up toward top
      // speed (never above it — only a kick does that); ahead of it, ease
      // down to let the horses who want this ground come through.
      const urgency = 1 - ownProgress / ESTABLISH_UNTIL;
      if (drift > 0) {
        effort = clamp(CRUISE_EFFORT * 0.85 + drift * ESTABLISH_GAIN * urgency, 0, CRUISE_EFFORT);
      } else {
        effort = CRUISE_EFFORT * (1 - Math.min(0.4, -drift * 0.7) * urgency);
      }
    } else if (!outOfTolerance && self.kicksRemaining < CHARGE_CAPACITY && momentProgress < momentLo) {
      // HOLD — comfortable in position, not yet fully banked, and the
      // Moment window hasn't opened yet. Give up real ground now for a big
      // regen payoff (HOLD_REGEN_BONUS, engine.ts) so the bank is full when
      // it matters. Stops the instant the window opens — arrive at full
      // speed for the kick, not still recovering.
      effort = HOLD_EFFORT;
      holding = true;
    } else {
      // CRUISE — top speed. Either fighting for position (can't afford to
      // hold), already fully banked, or the Moment window is here/past.
      effort = CRUISE_EFFORT;
    }

    // Free Runner fights the rider early; high Temper keeps a lid on it.
    if (hasTrait(traits, 'freeRunner') && ownProgress < 0.5) {
      effort += 0.18 * (1 - horse.stats.temper / 100) + 0.06;
      holding = false;
    }

    // Pace Pusher drives the tempo from the front, burning itself as well.
    if (hasTrait(traits, 'pacePusher') && self.rank <= 2 && ownProgress < 0.55) {
      effort += 0.14;
      holding = false;
    }

    // Everyone near the front pays for a hot pace — this is how a duel up front
    // empties the leading group and sets a race up for the closers.
    if (race.pacePressure > 0 && self.fieldPosition < 0.45 && ownProgress < 0.55) {
      effort += race.pacePressure * 0.12 * (1 - self.fieldPosition);
      holding = false;
    }

    // Gate Rusher goes hard out of the gate regardless of style.
    if (hasTrait(traits, 'gateRusher') && ownProgress < 0.08) {
      effort += 0.25;
      holding = false;
    }

    effort += (Math.sin(race.elapsed * 3.1 + self.lane) * sloppiness) / 2;

    // --- The kick ----------------------------------------------------------
    // Fires from kickAt onward, gated only by charges and kickSlotGap while
    // still inside the window — a horse can spend as many kicks as it has
    // banked there, same as a player who held for their moment and taps it
    // out once it opens. Once past momentHi it's mistimed, and capped at
    // MAX_KICKS_OUTSIDE_MOMENT on a slower, real-time cooldown (there's no
    // "window width" left to scale against once the window is over).
    const insideMoment = momentProgress <= momentHi;
    const cooldownOk = insideMoment
      ? momentProgress - lastKickProgress >= kickSlotGap
      : race.elapsed - lastKickElapsed >= KICK_RETRY_COOLDOWN;
    const kick =
      self.kicksRemaining > 0 &&
      momentProgress >= kickAt &&
      cooldownOk &&
      (insideMoment || kicksOutsideMoment < MAX_KICKS_OUTSIDE_MOMENT) &&
      // Turn of Foot has a short kick, so it must be held later.
      (!hasTrait(traits, 'turnOfFoot') || momentProgress >= kickAt + 0.06);
    if (kick) {
      lastKickProgress = momentProgress;
      lastKickElapsed = race.elapsed;
      if (!insideMoment) kicksOutsideMoment++;
      holding = false;
      effort = CRUISE_EFFORT;
    }

    // --- Lane --------------------------------------------------------------
    let targetLane = self.lane;
    if (hasTrait(traits, 'railHugger')) targetLane = 0;
    else if (hasTrait(traits, 'wideRunner')) targetLane = 3;
    else if (self.blocked) targetLane = self.lane + (self.lane === 0 ? 1 : -1);
    else if (insideMoment && self.rank > 2) targetLane = self.lane + 1;

    return {
      effort: clamp(effort, 0, CRUISE_EFFORT),
      holding,
      kick,
      targetLane,
    };
  };
}
