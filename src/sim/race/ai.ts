import type { Horse } from '../types.js';
import type { ControlInput, Controller, RaceView, RunnerView } from './types.js';
import { hasTrait } from '../../data/traits.js';
import {
  ESTABLISH_GAIN,
  ESTABLISH_UNTIL,
  HOLD_EFFORT,
  MAX_EFFORT,
  MIN_EFFORT,
  MOMENT_COMMIT_DURATION,
  MOMENT_RAMP_LEAD,
  MOMENT_WINDOWS,
  POSITION_CORRECTION_GAIN,
  STYLE_PROFILES,
  UNIVERSAL_FINAL_STRETCH,
} from './constants.js';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The jockey AI.
 *
 * Rides the horse's running style: reach the position the style wants, hold
 * it, and launch the run at the right moment. Skill varies between jockeys,
 * so some ride their style well and others blunder — which is where beatable
 * mistakes come from (DESIGN.md §4).
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
  // Moment's window governs the KICK (MOMENT_WINDOWS, engine.ts) — the AI's
  // own commit timing only needs the window's START, since a poor jockey is
  // a little slower to start committing once it opens.
  const [momentLo] = MOMENT_WINDOWS[horse.moment];
  const kickAt = momentLo + (1 - skill) * 0.05;
  // A fixed TOTAL duration at max effort, the SAME for every Moment — not
  // "however wide this Moment's window happens to be". See
  // MOMENT_COMMIT_DURATION for why: that was the actual balance-breaking bug,
  // not window placement or ramp timing (both tried and rejected first).
  // Clamped at 0 for an `early` horse whose kickAt sits inside the ramp-lead
  // itself — there's no room before the start of the race. Without topping up
  // the hold AFTER kickAt to compensate, that horse would get a shorter total
  // duration than every other Moment, not an equal one.
  const commitStart = Math.max(0, kickAt - MOMENT_RAMP_LEAD);
  const actualRampLead = kickAt - commitStart;
  const commitEnd = kickAt + Math.max(0.01, MOMENT_COMMIT_DURATION - actualRampLead);

  // Fire the kick exactly once. `race.progress >= kickAt` stays true on every
  // tick after it first crosses — without this guard the AI would ask the
  // engine to kick every tick it holds true, burning every charge in a
  // fraction of a second instead of spending one at the right moment.
  let hasKicked = false;

  return (self: RunnerView, race: RaceView): ControlInput => {
    // Committing HOLDS for this fixed duration around the horse's own kick,
    // then EASES BACK to the normal hold effort until the (narrow) universal
    // final stretch, where every style commits together regardless of its
    // own Moment.
    const committing =
      (race.progress >= commitStart && race.progress <= commitEnd) || race.progress >= UNIVERSAL_FINAL_STRETCH;

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
    } else if (Math.abs(drift) <= profile.tolerance) {
      // HOLD, established — you're in your slot. Cruise at the flat baseline;
      // do NOT keep throttling proportional to raw drift, or a style whose
      // preferred position sits far from the middle (e.g. closer at 0.85)
      // would be perpetually suppressed just for being where it wants to be.
      effort = HOLD_EFFORT;
    } else {
      // HOLD, drifted — only correct for the part that's actually outside
      // your comfort band, not the whole raw drift.
      const excess = drift > 0 ? drift - profile.tolerance : drift + profile.tolerance;
      effort = HOLD_EFFORT + excess * POSITION_CORRECTION_GAIN * (drift > 0 ? 1 : 0.5);
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

    // Outside a committing window, hold something back — a jockey riding
    // flat out the whole way has nothing left to spend on the kick when it
    // matters, and no style should get to run at max effort for most of the
    // race just because its Moment happens to fall early.
    if (!committing) {
      effort = Math.min(effort, 0.86);
    } else {
      // Committing: everything left. Full effort reached by kickAt (so a
      // kick is spent at genuine max effort), held for the rest of the fixed
      // commit duration, then eased back off once committing goes false again.
      const commitment = 0.82 + (race.progress - commitStart) / Math.max(0.01, kickAt - commitStart);
      effort = Math.max(effort, commitment);
    }

    effort += (Math.sin(race.elapsed * 3.1 + self.lane) * sloppiness) / 2;

    // --- The kick ----------------------------------------------------------
    // Fire once, at the style's moment. Strength is Grit x jockey skill; the
    // AI spends exactly one of its shared charges here regardless of how many
    // it or the player's own horse happen to have banked.
    const kick =
      !hasKicked &&
      self.kicksRemaining > 0 &&
      race.progress >= kickAt &&
      // Turn of Foot has a short kick, so it must be held later.
      (!hasTrait(traits, 'turnOfFoot') || race.progress >= kickAt + 0.06);
    if (kick) hasKicked = true;

    // --- Lane --------------------------------------------------------------
    let targetLane = self.lane;
    if (hasTrait(traits, 'railHugger')) targetLane = 0;
    else if (hasTrait(traits, 'wideRunner')) targetLane = 3;
    else if (self.blocked) targetLane = self.lane + (self.lane === 0 ? 1 : -1);
    else if (committing && self.rank > 2) targetLane = self.lane + 1;

    return {
      effort: clamp(effort, MIN_EFFORT, MAX_EFFORT),
      kick,
      targetLane,
    };
  };
}
