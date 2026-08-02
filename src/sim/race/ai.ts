import type { Horse } from '../types.js';
import type { ControlInput, Controller, RaceView, RunnerView } from './types.js';
import { hasTrait } from '../../data/traits.js';
import {
  ESTABLISH_GAIN,
  ESTABLISH_UNTIL,
  MAX_EFFORT,
  MAX_KICKS_PER_MOMENT,
  MIN_EFFORT,
  MOMENT_COMMIT_DURATION,
  MOMENT_RAMP_LEAD,
  MOMENT_WINDOWS,
  NON_COMMIT_EFFORT_CAP,
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
  const [momentLo, momentHi] = MOMENT_WINDOWS[horse.moment];
  const kickAt = momentLo + (1 - skill) * 0.05;
  // Evenly spaced slots for up to MAX_KICKS_PER_MOMENT full-strength kicks,
  // fit entirely inside [kickAt, momentHi] — the SAME count for every Moment
  // regardless of how wide its window happens to be.
  const kickSlotGap = Math.max(0.01, (momentHi - kickAt) / MAX_KICKS_PER_MOMENT);
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

  // A horse may fire more than one kick if it has banked the charges for it —
  // it shouldn't be handcuffed to a single shot when it has ground left to
  // spend. But it must never fire outside its own Moment window: past
  // `momentHi` every kick is mistimed (weak, per windowFit in engine.ts) and
  // only burns the bank for near-zero gain — previously this ran unchecked
  // all the way to the finish, since `race.progress >= kickAt` never becomes
  // false again, and a horse could empty its entire charge bank on kicks that
  // did almost nothing.
  let kicksFiredInMoment = 0;
  let lastKickProgress = -Infinity;

  return (self: RunnerView, race: RaceView): ControlInput => {
    // The horse's OWN progress toward the finish, not race.progress (which
    // tracks the LEADER's distance over the total). Moment timing has to be
    // keyed to this: a horse running behind the pace hasn't covered as much
    // of ITS OWN race as the leader has of theirs, so comparing its kick
    // window and commit timing against the leader's progress raced its own
    // clock ahead of where it should be the moment any gap opened — a
    // self-reinforcing spiral that produced a massive Moment win-rate skew
    // despite near-identical finish distances (ROADMAP.md). See the matching
    // fix in engine.ts's phase-bonus block for the other half of this.
    const ownProgress = clamp(self.distance / race.totalYards, 0, 1);

    // Committing HOLDS for this fixed duration around the horse's own kick,
    // then EASES BACK to the normal hold effort until the (narrow) universal
    // final stretch, where every style commits together regardless of its
    // own Moment.
    const committing =
      (ownProgress >= commitStart && ownProgress <= commitEnd) || ownProgress >= UNIVERSAL_FINAL_STRETCH;

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
        effort = profile.cruiseEffort + drift * ESTABLISH_GAIN * urgency;
      } else {
        // Ahead of your slot — actively drop back and let the horses who want
        // this ground come through. Without this the field never shuffles, the
        // front-runner never reaches the front, and a stalker inherits a free
        // lead it never paid for.
        effort = profile.cruiseEffort * (1 - Math.min(0.4, -drift * 0.7) * urgency);
      }
    } else if (Math.abs(drift) <= profile.tolerance) {
      // HOLD, established — you're in your slot. Cruise at the style's own
      // baseline; do NOT keep throttling proportional to raw drift, or a
      // style whose preferred position sits far from the middle (e.g. closer
      // at 0.85) would be perpetually suppressed just for being where it
      // wants to be.
      effort = profile.cruiseEffort;
    } else {
      // HOLD, drifted — only correct for the part that's actually outside
      // your comfort band, not the whole raw drift.
      const excess = drift > 0 ? drift - profile.tolerance : drift + profile.tolerance;
      effort = profile.cruiseEffort + excess * POSITION_CORRECTION_GAIN * (drift > 0 ? 1 : 0.5);
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
      effort = Math.min(effort, NON_COMMIT_EFFORT_CAP);
    } else {
      // Committing: everything left. Full effort reached by kickAt (so a
      // kick is spent at genuine max effort), held for the rest of the fixed
      // commit duration, then eased back off once committing goes false again.
      const commitment = 0.82 + (ownProgress - commitStart) / Math.max(0.01, kickAt - commitStart);
      effort = Math.max(effort, commitment);
    }

    effort += (Math.sin(race.elapsed * 3.1 + self.lane) * sloppiness) / 2;

    // --- The kick ----------------------------------------------------------
    // Up to MAX_KICKS_PER_MOMENT, all inside [kickAt, momentHi] so every one
    // lands at full strength. Strength itself is Grit x jockey skill x style
    // (KICK_STYLE_BONUS); the AI spends one charge per kick regardless of how
    // many it or the player's own horse happen to have banked.
    const kick =
      self.kicksRemaining > 0 &&
      ownProgress >= kickAt &&
      ownProgress <= momentHi &&
      kicksFiredInMoment < MAX_KICKS_PER_MOMENT &&
      ownProgress - lastKickProgress >= kickSlotGap &&
      // Turn of Foot has a short kick, so it must be held later.
      (!hasTrait(traits, 'turnOfFoot') || ownProgress >= kickAt + 0.06);
    if (kick) {
      lastKickProgress = ownProgress;
      kicksFiredInMoment++;
    }

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
