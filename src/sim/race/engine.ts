import { createRng, type Rng } from '../rng.js';
import { hasTrait, type TraitId } from '../../data/traits.js';
import type { Horse } from '../types.js';
import { createAiController } from './ai.js';
import * as K from './constants.js';
import {
  bandFor,
  type ControlInput,
  type Controller,
  type Going,
  type RaceConfig,
  type RaceEntrant,
  type RaceEvent,
  type RaceOutcome,
  type RaceResult,
  type RaceView,
  type RunnerView,
} from './types.js';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** A horse is about 8 feet; margins are reported in lengths. */
const YARDS_PER_LENGTH = 2.7;

interface Runner {
  horse: Horse;
  controller: Controller;
  traits: readonly TraitId[];

  distance: number;
  speed: number;
  energy: number;
  lane: number;
  rank: number;
  fieldPosition: number;

  effort: number;
  kickUsed: boolean;
  kickRemaining: number;
  kickStrength: number;

  blockedFor: number;
  troubleTime: number;
  wasBlocked: boolean;
  hadTrouble: boolean;
  drafting: boolean;

  fumbleRemaining: number;
  fumbledStart: boolean;
  greenRemaining: number;

  /** Continuous performance band — re-rolled on a timer. See constants. */
  variation: number;
  variationTimer: number;
  bandDown: number;
  bandUp: number;

  /** Rolled once per race. Amplitude comes from Temper, not the mean. */
  dailyForm: number;
  offColour: boolean;

  maxSpeed: number;
  accel: number;
  drainRate: number;
  recoveryRate: number;
  fadeRelief: number;

  finishTime: number | null;
  sectionals: number[];
  nextSectional: number;
}

const goingBias = (going: Going): number => {
  switch (going) {
    case 'firm':
      return 1;
    case 'good':
      return 0.5;
    case 'soft':
      return -0.5;
    case 'heavy':
      return -1;
  }
};

/**
 * Runs a complete race, deterministically, from a seed.
 *
 * Pure logic — no DOM, no rendering, no timers. The same seed and the same
 * inputs always produce the same race, which is what lets the balance harness
 * run this ten thousand times and mean something (DESIGN.md §14).
 */
export function simulateRace(entrants: RaceEntrant[], config: RaceConfig): RaceOutcome {
  const rng = createRng(config.seed);
  const totalYards = config.furlongs * K.YARDS_PER_FURLONG;
  const band = bandFor(config.furlongs);
  const fieldSize = entrants.length;
  const events: RaceEvent[] = [];

  const runners: Runner[] = entrants.map((entrant, i) =>
    createRunner(entrant, i, rng, config, band, fieldSize),
  );

  for (const r of runners) {
    if (r.fumbledStart) {
      events.push({ at: 0, kind: 'fumbledStart', horseId: r.horse.id, detail: 'Broke slowly' });
    }
    if (r.offColour) {
      events.push({ at: 0, kind: 'phase', horseId: r.horse.id, detail: 'Below its best today' });
    }
  }
  events.push({ at: 0, kind: 'start', horseId: '', detail: 'They are away' });

  let elapsed = 0;
  let finished = 0;
  const maxTicks = K.TICK_HZ * 400; // hard stop; a real race never approaches this

  for (let tick = 0; tick < maxTicks && finished < fieldSize; tick++) {
    elapsed = tick * K.DT;

    updateRanks(runners, fieldSize);

    const leaderDistance = Math.max(...runners.map((r) => r.distance));
    const progress = clamp(leaderDistance / totalYards, 0, 1);


    // Pace Pusher reaches beyond its own horse: while one is on the lead, the
    // whole front of the field is dragged into a faster tempo.
    const pacePressure = runners.some(
      (r) => r.finishTime === null && r.rank <= 2 && hasTrait(r.traits, 'pacePusher'),
    )
      ? 1
      : 0;

    const race: RaceView = {
      progress,
      elapsed,
      totalYards,
      fieldSize,
      leaderDistance,
      pacePressure,
    };

    for (const r of runners) {
      if (r.finishTime !== null) continue;
      stepRunner(r, runners, race, rng, events, elapsed, totalYards);

      if (r.distance >= totalYards) {
        // Interpolate across the tick so photo finishes are honest.
        const overshoot = r.distance - totalYards;
        r.finishTime = elapsed - (r.speed > 0 ? overshoot / r.speed : 0);
        finished++;
        events.push({ at: r.finishTime, kind: 'finish', horseId: r.horse.id });
      }
    }
  }

  return buildOutcome(runners, events, elapsed, totalYards);
}

// ---------------------------------------------------------------------------

function createRunner(
  entrant: RaceEntrant,
  index: number,
  rng: Rng,
  config: RaceConfig,
  band: ReturnType<typeof bandFor>,
  fieldSize: number,
): Runner {
  const horse = entrant.horse;
  const s = horse.stats;
  const traits = horse.traits;

  // --- Daily form: Temper sets the AMPLITUDE, never the mean ---------------
  let spread = K.FORM_BASE_SPREAD + (1 - s.temper / 100) * K.FORM_TEMPER_AMPLIFY;
  if (hasTrait(traits, 'hotHeaded')) spread *= 1.6;
  const dailyForm = 1 + rng.normal(0, spread);

  // --- Top-end speed --------------------------------------------------------
  const conditionFactor = 1 + ((horse.condition - 70) / 100) * K.CONDITION_INFLUENCE;
  let maxSpeed =
    K.BASE_SPEED * (1 + ((s.speed - 50) / 100) * K.SPEED_STAT_INFLUENCE) * dailyForm * conditionFactor;

  // --- Going: a trade, never a free pass -----------------------------------
  const bias = goingBias(config.going);
  if (!hasTrait(traits, 'allWeather')) {
    if (hasTrait(traits, 'mudder')) maxSpeed *= 1 + -bias * 0.022;
    else if (hasTrait(traits, 'firmSpecialist')) maxSpeed *= 1 + bias * 0.022;
    else maxSpeed *= 1 - Math.max(0, -bias) * 0.012;
  }

  // --- Crowd traits ---------------------------------------------------------
  if (hasTrait(traits, 'bigGame')) maxSpeed *= 1 + (config.hype - 0.5) * 0.03;
  if (hasTrait(traits, 'stageFright')) maxSpeed *= 1 - (config.hype - 0.5) * 0.03;
  if (hasTrait(traits, 'crowdFeeder')) maxSpeed *= 1 + (fieldSize - 8) * 0.004;

  // --- Energy ---------------------------------------------------------------
  // Poor distance aptitude costs ENERGY rather than raw speed: a sprinter over
  // a route doesn't run slower, it runs out. Keeps everything in one currency.
  const aptitude = horse.aptitudes[band];
  const aptitudeDrain = 1 + (1 - aptitude / 100) * K.APTITUDE_DRAIN_PENALTY;

  let drainRate = (K.BASE_DRAIN / (1 + ((s.stamina - 50) / 100) * K.STAMINA_DRAIN_INFLUENCE)) * aptitudeDrain;
  if (hasTrait(traits, 'ironLungs')) drainRate *= 0.9;
  if (hasTrait(traits, 'thirsty')) drainRate *= 1.22;

  let recoveryRate = K.BASE_RECOVERY;
  if (hasTrait(traits, 'quickRecovery')) recoveryRate *= 1.2;
  if (hasTrait(traits, 'thirsty')) recoveryRate *= 1.35;

  // --- Acceleration ---------------------------------------------------------
  let accel = K.BASE_ACCEL * (1 + ((s.burst - 50) / 100) * K.BURST_ACCEL_INFLUENCE);
  if (hasTrait(traits, 'coiled')) accel *= 1.15;

  // --- Consistency: the fumbled start --------------------------------------
  const fumbleChance = hasTrait(traits, 'alert')
    ? 0
    : K.FUMBLE_BASE_CHANCE * (1 - s.consistency / 100);
  const fumbled = rng.chance(fumbleChance) && !hasTrait(traits, 'fastGate');

  return {
    horse,
    controller: entrant.controller ?? createAiController(horse),
    traits,
    distance: 0,
    speed: 0,
    energy: K.MAX_ENERGY,
    lane: index % K.LANE_COUNT,
    rank: index + 1,
    fieldPosition: index / Math.max(1, fieldSize - 1),
    effort: 0,
    kickUsed: false,
    kickRemaining: 0,
    kickStrength: 0,
    blockedFor: 0,
    troubleTime: 0,
    wasBlocked: false,
    hadTrouble: false,
    drafting: false,
    fumbleRemaining: fumbled ? K.FUMBLE_DURATION : 0,
    fumbledStart: fumbled,
    greenRemaining: 0,
    variation: 1,
    variationTimer: 0,
    // Asymmetric: a horse underperforms more easily than it exceeds itself.
    bandDown: K.BAND_DOWN * (1 - s.consistency / 100),
    bandUp: K.BAND_UP * (1 - s.consistency / 100),
    dailyForm,
    offColour: dailyForm < 0.985,
    maxSpeed,
    accel,
    drainRate,
    recoveryRate,
    fadeRelief: (s.grit / 100) * K.GRIT_FADE_RELIEF,
    finishTime: null,
    sectionals: [],
    nextSectional: K.YARDS_PER_FURLONG,
  };
}

function updateRanks(runners: Runner[], fieldSize: number): void {
  const order = [...runners].sort((a, b) => b.distance - a.distance);
  order.forEach((r, i) => {
    r.rank = i + 1;
    r.fieldPosition = fieldSize > 1 ? i / (fieldSize - 1) : 0;
  });
}

function stepRunner(
  r: Runner,
  all: Runner[],
  race: RaceView,
  rng: Rng,
  events: RaceEvent[],
  elapsed: number,
  totalYards: number,
): void {
  const view: RunnerView = {
    id: r.horse.id,
    name: r.horse.name,
    distance: r.distance,
    speed: r.speed,
    energy: r.energy,
    lane: r.lane,
    fieldPosition: r.fieldPosition,
    rank: r.rank,
    blocked: r.blockedFor > 0,
    drafting: r.drafting,
    kickUsed: r.kickUsed,
    offColour: r.offColour,
  };

  const input: ControlInput = r.controller(view, race);
  r.effort = clamp(input.effort, 0, 1);

  // --- The kick -----------------------------------------------------------
  // Strength scales with BANKED ENERGY x GRIT. A front-runner who spent
  // everything gets a feeble kick; a well-paced leader can still defend.
  if (input.kick && !r.kickUsed) {
    r.kickUsed = true;
    const reserve = r.energy / K.MAX_ENERGY;
    const gritFactor = 1 + ((r.horse.stats.grit - 50) / 100) * K.KICK_GRIT_INFLUENCE;
    r.kickStrength = K.KICK_MAX_BONUS * reserve * gritFactor;
    r.kickRemaining = K.KICK_BASE_DURATION;

    if (hasTrait(r.traits, 'turnOfFoot')) {
      r.kickStrength *= 1.55;
      r.kickRemaining *= 0.5;
    }
    if (hasTrait(r.traits, 'relentless')) {
      r.kickStrength *= 0.7;
      r.kickRemaining *= 1.9;
    }
    if (hasTrait(r.traits, 'grinder')) {
      r.kickStrength *= 0.35;
      r.kickRemaining *= 2.4;
    }
    events.push({ at: elapsed, kind: 'kick', horseId: r.horse.id });
  }

  // --- Lane changes; the jockey's job, not the player's --------------------
  if (input.targetLane !== r.lane) {
    const target = clamp(Math.round(input.targetLane), 0, K.LANE_COUNT - 1);
    const occupied = all.some(
      (o) => o !== r && o.lane === target && Math.abs(o.distance - r.distance) < K.BLOCK_GAP,
    );
    const skill = r.horse.jockeySkill / 100;
    if (!occupied && rng.chance(0.35 + skill * 0.5)) r.lane = target;
  }

  // --- Traffic --------------------------------------------------------------
  const ahead = all.find(
    (o) =>
      o !== r &&
      o.lane === r.lane &&
      o.distance > r.distance &&
      o.distance - r.distance < K.BLOCK_GAP,
  );

  const wantsMore = ahead ? r.speed >= ahead.speed - 0.15 : false;
  if (ahead && wantsMore) {
    if (r.blockedFor === 0) events.push({ at: elapsed, kind: 'blocked', horseId: r.horse.id });
    r.blockedFor += K.DT;
    r.troubleTime += K.DT;
    // Only a sustained shut-off counts as "trouble" — brushing a rival for a
    // few frames is just racing, and flagging it made 90% of runners look
    // unlucky in every single race.
    if (r.troubleTime >= K.TROUBLE_THRESHOLD) r.hadTrouble = true;
    r.wasBlocked = true;

    // Temper governs how rattled it gets, Grit whether it fights through, and
    // jockey skill how quickly a way out is found.
    let escape =
      K.BASE_ESCAPE_RATE *
      (1 + (r.horse.jockeySkill / 100 - 0.5) * K.JOCKEY_ESCAPE_INFLUENCE) *
      (1 + (r.horse.stats.temper / 100 - 0.5) * K.TEMPER_ESCAPE_INFLUENCE) *
      (1 + (r.horse.stats.grit / 100 - 0.5) * K.GRIT_ESCAPE_INFLUENCE);
    if (hasTrait(r.traits, 'bulldozer')) escape *= 1.6;
    if (hasTrait(r.traits, 'highlyStrung')) escape *= 0.65;
    if (hasTrait(r.traits, 'needsRoom')) escape *= 0.8;

    if (rng.chance(escape * K.DT)) {
      r.blockedFor = 0;
      events.push({ at: elapsed, kind: 'freed', horseId: r.horse.id });
    }
  } else if (r.blockedFor > 0) {
    r.blockedFor = 0;
    events.push({ at: elapsed, kind: 'freed', horseId: r.horse.id });
  }

  // --- Drafting: recovery, not free speed ----------------------------------
  r.drafting =
    !!all.find(
      (o) =>
        o !== r &&
        o.distance > r.distance &&
        o.distance - r.distance < K.DRAFT_GAP &&
        Math.abs(o.lane - r.lane) <= 1,
    ) && r.blockedFor === 0;

  // --- Position: the load-bearing asymmetry --------------------------------
  // Leading is intrinsically expensive (no slipstream, you set the tempo) and
  // sitting at the back is intrinsically cheap. A front-runner does not escape
  // that cost — it just carries it better, in exchange for having no ground to
  // make up. Without this, every style is equally efficient in its own slot and
  // the whole trade collapses.
  const profile = K.STYLE_PROFILES[r.horse.style];
  const relief = K.FRONT_COST_RELIEF[r.horse.style];

  const forwardness = 1 - r.fieldPosition; // 1 at the front, 0 at the back

  // How hard is this horse being pressed? A CLEAR lead is cheap — the leader
  // dictates a soft tempo and saves. A CONTESTED lead is ruinous. This is the
  // front-runner's entire win condition, and it is what gives Pace Pusher
  // something to punish: contest the lead and you burn the leader down.
  const nearest = all.reduce((best, o) => {
    if (o === r || o.finishTime !== null) return best;
    const gap = Math.abs(o.distance - r.distance);
    return gap < best ? gap : best;
  }, Number.POSITIVE_INFINITY);
  const contest = clamp(1 - nearest / K.CLEAR_LEAD_GAP, 0, 1);
  const contestFactor = K.CLEAR_LEAD_RELIEF + (1 - K.CLEAR_LEAD_RELIEF) * contest;

  const frontCost = 1 + K.FRONT_COST_PENALTY * Math.pow(forwardness, 1.5) * relief * contestFactor;
  const backRecovery = 1 + K.BACK_RECOVERY_BONUS * r.fieldPosition;

  const rawMisfit = Math.abs(r.fieldPosition - profile.preferred);
  let misfit = clamp((rawMisfit - profile.tolerance) / (1 - profile.tolerance), 0, 1);
  if (hasTrait(r.traits, 'tractable')) misfit *= 0.45;

  let costMult = frontCost * (1 + K.POSITION_COST_PENALTY * misfit);
  let recoveryMult = backRecovery * (1 + K.POSITION_RECOVERY_BONUS * (1 - misfit));

  if (hasTrait(r.traits, 'railHugger')) costMult *= r.lane === 0 ? 0.94 : 1.05;
  if (hasTrait(r.traits, 'herdAnimal')) recoveryMult *= r.drafting ? 1.15 : 0.92;
  if (hasTrait(r.traits, 'loner')) recoveryMult *= r.drafting ? 0.9 : 1.12;
  if (hasTrait(r.traits, 'needsRoom')) costMult *= r.blockedFor > 0 ? 1.2 : 0.96;
  if (hasTrait(r.traits, 'gateRusher') && race.progress < 0.125) costMult *= 1.3;
  if (hasTrait(r.traits, 'alert') && race.progress < 0.2) costMult *= 1.1;
  if (hasTrait(r.traits, 'cruiser')) costMult *= r.effort > 0.85 ? 1.3 : 0.8;
  if (r.drafting) recoveryMult *= 1 + K.DRAFT_RECOVERY_BONUS;

  // --- Energy: drain when driving, recover when settled --------------------
  const kicking = r.kickRemaining > 0;
  const drain = r.drainRate * r.effort * r.effort * costMult * (kicking ? K.KICK_DRAIN_MULTIPLIER : 1);
  // Recovery is QUADRATIC in slack, not linear. A horse galloping at 90% of
  // race speed is not resting — with a linear curve it recovered faster than it
  // drained, which let a leader cruise the whole way on full energy and made
  // the entire style trade meaningless.
  const slack = 1 - r.effort;
  const recovery = r.recoveryRate * slack * slack * recoveryMult;
  r.energy = clamp(r.energy + (recovery - drain) * K.DT, 0, K.MAX_ENERGY);

  // --- The performance band -------------------------------------------------
  // Consistency decides how tightly the horse delivers its true ability,
  // re-rolled periodically so races have texture rather than smooth curves.
  r.variationTimer -= K.DT;
  if (r.variationTimer <= 0) {
    r.variationTimer = rng.range(K.VARIATION_INTERVAL_MIN, K.VARIATION_INTERVAL_MAX);
    r.variation = 1 + rng.range(-r.bandDown, r.bandUp);
  }

  // --- Speed ----------------------------------------------------------------
  let speedCap = r.maxSpeed * r.variation;

  // The fade: below the threshold the ceiling collapses, softened by Grit.
  if (r.energy < K.FADE_THRESHOLD) {
    const depth = 1 - r.energy / K.FADE_THRESHOLD;
    const floor = K.FADE_FLOOR + r.fadeRelief;
    speedCap *= 1 - depth * (1 - floor);
  }

  if (kicking) {
    speedCap *= 1 + r.kickStrength;
    r.kickRemaining -= K.DT;
  }

  // Heart: surges when in touch with the lead late.
  if (hasTrait(r.traits, 'heart') && race.progress > 0.8 && r.rank <= 3) speedCap *= 1.02;

  // Consistency: green moments, only while the race is being run.
  if (r.greenRemaining <= 0 && race.progress > 0.1 && race.progress < 0.9) {
    const rate = K.GREEN_MOMENT_RATE * (1 - r.horse.stats.consistency / 100);
    if (rng.chance(rate * K.DT)) {
      r.greenRemaining = K.GREEN_MOMENT_DURATION;
      r.hadTrouble = true;
      events.push({ at: elapsed, kind: 'greenMoment', horseId: r.horse.id });
    }
  }
  if (r.greenRemaining > 0) {
    speedCap *= K.GREEN_MOMENT_PENALTY;
    r.greenRemaining -= K.DT;
  }

  if (r.fumbleRemaining > 0) {
    speedCap *= K.FUMBLE_SPEED_PENALTY;
    r.fumbleRemaining -= K.DT;
  }

  if (r.blockedFor > 0 && ahead) {
    speedCap = Math.min(speedCap, ahead.speed * K.BLOCKED_SPEED_FACTOR);
  }

  const effortSpeed = K.MIN_EFFORT_SPEED + (1 - K.MIN_EFFORT_SPEED) * r.effort;
  const target = speedCap * effortSpeed;

  const responsiveness = hasTrait(r.traits, 'highlyStrung') ? 1.25 : 1;
  const delta = target - r.speed;
  const step = r.accel * responsiveness * K.DT;
  r.speed += clamp(delta, -step * 2.2, step);

  r.distance += r.speed * K.DT;

  // Sectionals, for the post-race analysis.
  while (r.distance >= r.nextSectional && r.nextSectional <= totalYards) {
    r.sectionals.push(elapsed);
    r.nextSectional += K.YARDS_PER_FURLONG;
  }
}

function buildOutcome(
  runners: Runner[],
  events: RaceEvent[],
  elapsed: number,
  totalYards: number,
): RaceOutcome {
  const ordered = [...runners].sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    return b.distance - a.distance;
  });

  const winnerTime = ordered[0]?.finishTime ?? elapsed;

  const results: RaceResult[] = ordered.map((r, i) => {
    const time = r.finishTime ?? elapsed;
    const behind =
      r.finishTime !== null
        ? (r.finishTime - winnerTime) * Math.max(r.speed, 1)
        : totalYards - r.distance;
    return {
      horseId: r.horse.id,
      name: r.horse.name,
      finishPosition: i + 1,
      time,
      margin: Math.max(0, behind / YARDS_PER_LENGTH),
      energyLeft: r.energy,
      sectionals: r.sectionals,
      hadTrouble: r.hadTrouble,
      fumbledStart: r.fumbledStart,
      offColour: r.offColour,
    };
  });

  // Pace rating: seconds-per-furlong late, divided by seconds-per-furlong
  // early. Above 1 means the race SLOWED — a fast early tempo that emptied the
  // leaders, which is the setup a closer needs.
  //
  // The first furlong is excluded deliberately: from a standing start it is
  // always the slowest, and including it swamped the signal entirely.
  const winner = ordered[0];
  let paceRating = 1;
  if (winner && winner.sectionals.length >= 4 && winner.finishTime !== null) {
    const s = winner.sectionals;
    const mid = Math.floor(s.length / 2);
    const earlyFurlongs = mid - 1;
    const lateFurlongs = s.length - mid;
    if (earlyFurlongs > 0 && lateFurlongs > 0) {
      const early = (s[mid]! - s[0]!) / earlyFurlongs;
      const late = (winner.finishTime - s[mid]!) / lateFurlongs;
      if (early > 0) paceRating = late / early;
    }
  }

  return { results, events, paceRating, duration: winnerTime };
}

export type { RaceConfig, RaceEntrant, RaceOutcome, RaceResult };
