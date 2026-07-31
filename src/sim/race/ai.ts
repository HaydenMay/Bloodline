import type { Horse } from '../types.js';
import type { ControlInput, Controller, RaceView, RunnerView } from './types.js';
import { hasTrait } from '../../data/traits.js';
import {
  ESTABLISH_GAIN,
  ESTABLISH_UNTIL,
  HOLD_EFFORT,
  MAX_EFFORT,
  MIN_EFFORT,
  POSITION_CORRECTION_GAIN,
  STYLE_PROFILES,
} from './constants.js';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The jockey AI.
 *
 * Rides the horse's running style: hold the position the style wants, spend as
 * little energy as possible getting there, and launch the run at the right
 * moment. Skill varies between jockeys, so some ride their style well and
 * others blunder — which is where beatable mistakes come from (DESIGN.md §4).
 *
 * The player's own races use the same shape of decision, with `effort` coming
 * from the DRIVE control instead.
 */
export function createAiController(horse: Horse): Controller {
  const profile = STYLE_PROFILES[horse.style];
  const traits = horse.traits;

  // Jockey skill perturbs both where they aim and when they commit, so a poor
  // jockey is genuinely exploitable rather than just slightly slower.
  const skill = horse.jockeySkill / 100;
  const sloppiness = (1 - skill) * 0.14;

  const preferred = clamp(profile.preferred + (hasTrait(traits, 'tractable') ? 0 : 0), 0, 1);
  const kickAt = profile.kickAt + (1 - skill) * 0.05;

  return (self: RunnerView, race: RaceView): ControlInput => {
    const inStretch = race.progress >= kickAt;

    // --- Effort: ESTABLISH -> HOLD -> COMMIT ---------------------------------
    //
    // Every horse races the same three beats; position and timing only change
    // the parameters. The critical one is HOLD: outside its window a horse
    // conserves and banks, so it arrives with something to spend. Without a
    // hold phase the AI only knows spend-and-hope, which is no skill gap at all
    // — and it is exactly why front-runners were empty by the 20% mark.
    const drift = self.fieldPosition - preferred;
    let effort: number;

    if (race.progress < ESTABLISH_UNTIL && Math.abs(drift) > profile.tolerance) {
      // ESTABLISH — a bounded, one-off cost to reach your slot. Expensive for a
      // front-runner, nearly free for a closer that is already where it wants
      // to be. Fades out so it never becomes an ongoing drain.
      const urgency = 1 - race.progress / ESTABLISH_UNTIL;
      if (drift > 0) {
        // Behind your slot — go and get it, while it is still cheap to do so.
        effort = HOLD_EFFORT + drift * ESTABLISH_GAIN * urgency;
      } else {
        // Ahead of your slot — actively drop back and let the horses who want
        // this ground come through. Without this the field never shuffles, the
        // front-runner never reaches the front, and a stalker inherits a free
        // lead it never paid for.
        effort = HOLD_EFFORT * (1 - Math.min(0.4, -drift * 0.7) * urgency);
      }
    } else {
      // HOLD — the minimum needed to keep your slot. In the right place this
      // nets POSITIVE energy, so the horse banks for its window.
      effort = HOLD_EFFORT + drift * POSITION_CORRECTION_GAIN * (drift > 0 ? 1 : 0.5);
    }

    // Free Runner fights the rider early; high Temper keeps a lid on it.
    if (hasTrait(traits, 'freeRunner') && race.progress < 0.5) {
      effort += 0.18 * (1 - horse.stats.temper / 100) + 0.06;
    }

    // Pace Pusher drives the tempo from the front, burning itself as well.
    if (hasTrait(traits, 'pacePusher') && self.rank <= 2 && race.progress < 0.55) {
      effort += 0.14;
    }

    // Everyone near the front pays for a hot pace — this is how a duel up front
    // empties the leading group and sets a race up for the closers.
    if (race.pacePressure > 0 && self.fieldPosition < 0.45 && race.progress < 0.55) {
      effort += race.pacePressure * 0.12 * (1 - self.fieldPosition);
    }

    // Gate Rusher goes hard out of the gate regardless of style.
    if (hasTrait(traits, 'gateRusher') && race.progress < 0.08) {
      effort += 0.25;
    }

    // Don't burn the tank before the real running starts. A better jockey
    // judges this more accurately.
    if (!inStretch) {
      const reserve = 32 + (1 - skill) * 12;
      if (self.energy < reserve) {
        effort -= (reserve - self.energy) / reserve;
      }
      effort = Math.min(effort, 0.86);
    } else {
      // Down the stretch: everything left.
      const commitment = 0.82 + (race.progress - kickAt) / Math.max(0.01, 1 - kickAt);
      effort = Math.max(effort, commitment);
    }

    effort += (Math.sin(race.elapsed * 3.1 + self.lane) * sloppiness) / 2;

    // --- The kick ----------------------------------------------------------
    // Fire once, at the style's moment. Strength is decided by the engine from
    // banked energy and Grit — a horse that burned everything gets very little.
    const kick =
      !self.kickUsed &&
      race.progress >= kickAt &&
      // Turn of Foot has a short kick, so it must be held later.
      (!hasTrait(traits, 'turnOfFoot') || race.progress >= kickAt + 0.06);

    // --- Lane --------------------------------------------------------------
    let targetLane = self.lane;
    if (hasTrait(traits, 'railHugger')) targetLane = 0;
    else if (hasTrait(traits, 'wideRunner')) targetLane = 3;
    else if (self.blocked) targetLane = self.lane + (self.lane === 0 ? 1 : -1);
    else if (inStretch && self.rank > 2) targetLane = self.lane + 1;

    return {
      effort: clamp(effort, MIN_EFFORT, MAX_EFFORT),
      kick,
      targetLane,
    };
  };
}
