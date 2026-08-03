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
  lane: number;
  rank: number;
  fieldPosition: number;

  effort: number;
  kicksRemaining: number;
  /** Progress (0-1) toward the next charge; converts to kicksRemaining at 1. */
  chargeProgress: number;
  kickRemaining: number;
  kickStrength: number;
  /** 1 = kicked inside the window, lower = mistimed. */
  kickWindowFit: number;
  /** Charge-regen multiplier this tick — surfaced on screen as the regen indicator. */
  regenMult: number;

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
  /** Charges per second at the neutral position/hold multiplier (Stamina-scaled). */
  chargeRegenRate: number;

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
 * A race that can be advanced one tick at a time.
 *
 * The harness wants to run thousands of races instantly; the renderer wants to
 * watch one unfold at 30 ticks a second. Same engine, two consumers — so the
 * race is exposed as a steppable object and `simulateRace` is just a loop over
 * it. Neither knows the other exists.
 */
export interface LiveRace {
  /** Advance one tick. Returns false once every horse has finished. */
  step(): boolean;
  /** Read-only snapshot for drawing. */
  snapshot(): RaceSnapshot;
  /** Only valid once step() has returned false. */
  outcome(): RaceOutcome;
  readonly totalYards: number;
  readonly config: RaceConfig;
}

export interface RaceSnapshot {
  elapsed: number;
  progress: number;
  leaderDistance: number;
  runners: RunnerSnapshot[];
  /** Events since the previous snapshot, for call-outs and sound. */
  fresh: RaceEvent[];
}

export interface RunnerSnapshot {
  id: string;
  name: string;
  distance: number;
  speed: number;
  lane: number;
  rank: number;
  effort: number;
  kicking: boolean;
  /** Kicks not yet fired, out of CHARGE_CAPACITY. */
  kicksRemaining: number;
  /** Progress (0-1) toward the next charge, for a partial-fill indicator. */
  chargeProgress: number;
  /** Charge-regen multiplier right now — 1 is baseline; drafting/holding raise it. */
  regenMult: number;
  blocked: boolean;
  drafting: boolean;
  offColour: boolean;
  finished: boolean;
  finishTime: number | null;
  coat: string;
}

export function createRace(entrants: RaceEntrant[], config: RaceConfig): LiveRace {
  const rng = createRng(config.seed);
  const totalYards = config.furlongs * K.YARDS_PER_FURLONG;
  const band = bandFor(config.furlongs);
  const fieldSize = entrants.length;
  const events: RaceEvent[] = [];

  // THE GATE DRAW — see the note in the original implementation below.
  const draw = rng.shuffle(entrants.map((_, i) => i));
  const runners: Runner[] = entrants.map((entrant, i) =>
    createRunner(entrant, draw[i]!, rng, config, band, fieldSize),
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

  let tick = 0;
  let elapsed = 0;
  let finished = 0;
  let reported = 0;
  const maxTicks = K.TICK_HZ * 400;

  const step = (): boolean => {
    if (finished >= fieldSize || tick >= maxTicks) return false;

    elapsed = tick * K.DT;
    tick++;

    updateRanks(runners, fieldSize);
    const leaderDistance = Math.max(...runners.map((r) => r.distance));
    const progress = clamp(leaderDistance / totalYards, 0, 1);

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
        const overshoot = r.distance - totalYards;
        r.finishTime = elapsed - (r.speed > 0 ? overshoot / r.speed : 0);
        finished++;
        events.push({ at: r.finishTime, kind: 'finish', horseId: r.horse.id });
      }
    }

    return finished < fieldSize;
  };

  return {
    step,
    totalYards,
    config,
    snapshot(): RaceSnapshot {
      const fresh = events.slice(reported);
      reported = events.length;
      return {
        elapsed,
        progress: clamp(Math.max(...runners.map((r) => r.distance)) / totalYards, 0, 1),
        leaderDistance: Math.max(...runners.map((r) => r.distance)),
        fresh,
        runners: runners.map((r) => ({
          id: r.horse.id,
          name: r.horse.name,
          distance: r.distance,
          speed: r.speed,
          lane: r.lane,
          rank: r.rank,
          effort: r.effort,
          kicking: r.kickRemaining > 0,
          kicksRemaining: r.kicksRemaining,
          chargeProgress: r.chargeProgress,
          regenMult: r.regenMult,
          blocked: r.blockedFor > 0,
          drafting: r.drafting,
          offColour: r.offColour,
          finished: r.finishTime !== null,
          finishTime: r.finishTime,
          coat: r.horse.coat,
        })),
      };
    },
    outcome: () => buildOutcome(runners, events, elapsed, totalYards),
  };
}

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

  // THE GATE DRAW.
  //
  // Lanes and starting order must be drawn, not inherited from array order.
  // Without this the first entrant always begins on the rail at the head of the
  // field and never has to establish position — worth around +9 percentage
  // points of win rate for free, in every race and every test.
  const draw = rng.shuffle(entrants.map((_, i) => i));

  const runners: Runner[] = entrants.map((entrant, i) =>
    createRunner(entrant, draw[i]!, rng, config, band, fieldSize),
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

  // --- Aptitude: a direct top-speed penalty, not a resource cost -------------
  // A sprinter over a route runs SLOWER, not out of fuel — there is no fuel
  // left to run out of.
  const aptitude = horse.aptitudes[band];
  maxSpeed *= 1 - (1 - aptitude / 100) * K.APTITUDE_SPEED_PENALTY;

  // --- Kick-charge regen rate -------------------------------------------------
  // Stamina scales this CONTINUOUSLY — no capacity breakpoint, so every point
  // trained always pays off, immediately. Position and holding (engine.ts,
  // stepRunner) scale it further tick to tick; this is just the horse's own
  // baseline going into that.
  let chargeRegenRate = K.BASE_CHARGE_REGEN * (1 + ((s.stamina - 50) / 100) * K.STAMINA_CHARGE_REGEN_INFLUENCE);
  if (hasTrait(traits, 'ironLungs')) chargeRegenRate *= 1.1;
  if (hasTrait(traits, 'quickRecovery')) chargeRegenRate *= 1.2;

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
    // A few inches of scatter off the gate, so ties in the opening tick break
    // randomly rather than by array order.
    distance: rng.range(0, 0.4),
    speed: 0,
    lane: index % K.LANE_COUNT,
    rank: index + 1,
    fieldPosition: index / Math.max(1, fieldSize - 1),
    effort: 0,
    // Every horse starts the race with a full bank — the resource is tempo
    // across the trip, not a scarcity you arrive with.
    kicksRemaining: K.CHARGE_CAPACITY,
    chargeProgress: 0,
    kickRemaining: 0,
    kickStrength: 0,
    kickWindowFit: 1,
    regenMult: 1,
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
    chargeRegenRate,
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
    lane: r.lane,
    fieldPosition: r.fieldPosition,
    rank: r.rank,
    blocked: r.blockedFor > 0,
    drafting: r.drafting,
    kicksRemaining: r.kicksRemaining,
    offColour: r.offColour,
  };

  const input: ControlInput = r.controller(view, race);
  const profile = K.STYLE_PROFILES[r.horse.style];
  r.effort = clamp(input.effort, 0, 1);
  // The horse's OWN progress toward the finish, not race.progress (the
  // LEADER's distance over the total) — a horse running behind the pace
  // hasn't covered as much of ITS OWN race as the leader has of theirs, so
  // its own timing (kick window, positional fade below) has to be judged
  // against its own clock, not the leader's.
  const ownProgress = clamp(r.distance / totalYards, 0, 1);
  // But floored so it can't lag the leader's clock by more than
  // MAX_MOMENT_LAG — see the note on that constant. Matches ai.ts's own
  // momentProgress exactly, so windowFit here agrees with what ai.ts used to
  // decide the kick was worth firing in the first place.
  const momentProgress = Math.max(ownProgress, race.progress - K.MAX_MOMENT_LAG);

  // How far up the field, and how CLEAR that spot is — used both by the kick
  // (complacency discount, right below) and by charge regen further down.
  // A CLEAR lead refills fine and (new) kicks weaker; a CONTESTED one refills
  // worse and kicks at full strength — the front-runner's whole trade.
  const forwardness = 1 - r.fieldPosition; // 1 at the front, 0 at the back
  const nearest = all.reduce((best, o) => {
    if (o === r || o.finishTime !== null) return best;
    const gap = Math.abs(o.distance - r.distance);
    return gap < best ? gap : best;
  }, Number.POSITIVE_INFINITY);
  const contest = clamp(1 - nearest / K.CLEAR_LEAD_GAP, 0, 1);

  // Same idea, but measured against the BACK of the field rather than the
  // nearest neighbor — a front pack that's mutually boxing itself in never
  // reads as "clear" by the nearest-rival measure above even while it
  // collectively pulls hundreds of yards clear of a back-marker (ROADMAP.md:
  // traced directly — a `late` horse fell 150-200 yards behind before its
  // own window even opened, while every horse ahead of it stayed "contested"
  // by nearest-rival terms the whole time). Used only by kick complacency,
  // not regen — being boxed in by a neighbor and being clear of the whole
  // field are different things.
  const furthestBehindGap = all.reduce((worst, o) => {
    if (o === r || o.finishTime !== null) return worst;
    const gap = r.distance - o.distance;
    return gap > worst ? gap : worst;
  }, 0);
  // Smooth ramp, not a threshold — see CLEAR_FIELD_SCALE for why.
  const fieldClearness = 1 - Math.exp(-furthestBehindGap / K.CLEAR_FIELD_SCALE);

  // Actual rank-based complacency: only the leader gets penalized for kicking
  // when clear. Horses chasing get minimal penalty even if clear of followers.
  const horsesAhead = all.reduce((count, o) => {
    if (o === r || o.finishTime !== null) return count;
    return o.distance > r.distance ? count + 1 : count;
  }, 0);
  const isLeading = horsesAhead === 0;
  const rankFactor = isLeading ? 1.0 : 0.15; // Leader: full penalty; chaser: minimal

  // --- The kick -----------------------------------------------------------
  // The ONLY thing that ever pushes a horse above its top speed (constants.ts,
  // "Effort: HOLD / CRUISE / KICK"). Strength scales with GRIT x BURST x
  // JOCKEY SKILL — a fixed measure of the horse and rider, not of how many
  // charges happen to be banked right now. The bank only gates whether a
  // kick can fire at all.
  if (input.kick && r.kicksRemaining > 0) {
    r.kicksRemaining--;
    const gritFactor = 1 + ((r.horse.stats.grit - 50) / 100) * K.KICK_GRIT_INFLUENCE;
    const burstFactor = 1 + ((r.horse.stats.burst - 50) / 100) * K.KICK_BURST_INFLUENCE;
    const jockeyFactor = 1 + ((r.horse.jockeySkill - 50) / 100) * K.KICK_JOCKEY_INFLUENCE;

    // TIMING IS THE SKILL. Kick anywhere inside the horse's Moment window and
    // it lands at full force — enough to take a race. Kick outside it and you
    // spend the same charge for a fraction of the surge: enough to hold your
    // position, never enough to steal the lead.
    const [momentLo, momentHi] = K.MOMENT_WINDOWS[r.horse.moment];
    const off =
      momentProgress < momentLo ? momentLo - momentProgress : Math.max(0, momentProgress - momentHi);
    const windowFit = clamp(1 - off / K.KICK_WINDOW_FALLOFF, K.KICK_MIN_FIT, 1);
    r.kickWindowFit = windowFit;

    const styleFactor = 1 + K.KICK_STYLE_BONUS[r.horse.style];
    // Narrower windows (`early`, `late`) need a stronger kick to make up for
    // less real time and fewer regen opportunities inside them — see
    // KICK_MOMENT_BONUS.
    const momentFactor = 1 + K.KICK_MOMENT_BONUS[r.horse.moment];
    // COMEBACK: the leader who's clear of the WHOLE FIELD means less urgency —
    // kicking again to extend a lead already coasting on clear air buys less
    // than kicking under real pressure or from off the pace. Chasers get minimal
    // penalty even if clear of followers behind them. See KICK_COMPLACENCY_PENALTY.
    const complacency = rankFactor * fieldClearness;
    const complacencyFactor = 1 - K.KICK_COMPLACENCY_PENALTY * complacency;
    r.kickStrength =
      K.KICK_MAX_BONUS *
      gritFactor *
      burstFactor *
      jockeyFactor *
      windowFit *
      styleFactor *
      momentFactor *
      complacencyFactor;
    // Duration scales with the SAME windowFit as strength — a mistimed kick
    // is shorter, not just weaker. Without this, spamming every charge the
    // instant it's available could cover most of a race at reduced strength
    // and out-earn one strong kick held for its ~13s window on raw uptime.
    //
    // Also scaled by momentFactor, same as strength above — repeat kicks
    // fired close together (a narrow window) mostly just refresh this timer
    // rather than stacking, so a narrow window's real TOTAL boosted time
    // ends up close to its own window width regardless of how many charges
    // get spent inside it. A strength bonus alone doesn't fix that: it makes
    // the boost faster, not longer. Traced directly — `late`'s kicks closed
    // real ground once they started, just not over enough total TIME to
    // finish the job (ROADMAP.md).
    r.kickRemaining =
      K.KICK_BASE_DURATION *
      (K.KICK_MISTIMED_DURATION_FLOOR + (1 - K.KICK_MISTIMED_DURATION_FLOOR) * windowFit) *
      momentFactor;

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

  // --- Position: changes the CHARGE REGEN rate, never spends on its own -----
  //
  // Charges only ever go up here — the only way to spend one is the kick,
  // above. Position's whole job is to say how fast you regen — leading and
  // being out of your style's slot regen slower, never negative, per
  // RECOVERY_FLOOR. A front-runner does not escape the lead's regen penalty —
  // its style merely lets it recharge better than another style would in the
  // same spot, in exchange for never having ground to make up.
  //
  // forwardness/nearest/contest computed above, before the kick block —
  // reused there for the complacency discount on kick strength.
  const relief = K.FRONT_COST_RELIEF[r.horse.style];

  // Two separate slowdowns, deliberately decoupled.
  //
  // The BASELINE slowdown from being up front is discounted by running style —
  // that is what lets a front-runner hold a lead without its reserve
  // stagnating. The CONTEST slowdown from being pressed is not: being hounded
  // hurts everyone the same. One number doing both jobs would make efficient
  // front-runners immune to being contested too, quietly disabling the whole
  // upset mechanism.
  const leadCost = Math.pow(forwardness, 1.5) * K.FRONT_COST_PENALTY * relief;
  // Sharper exponent: being pressed should punish the horses actually
  // fighting for the lead, not everyone stuck in mid-field traffic. Discounted
  // by PRESS_COST_RELIEF so a front-runner isn't double-taxed on top of
  // leadCost above for the one thing its style exists to do.
  const pressRelief = K.PRESS_COST_RELIEF[r.horse.style];
  const pressCost = Math.pow(forwardness, 3) * K.CONTESTED_LEAD_COST * contest * pressRelief;
  const frontPenalty = 1 + leadCost + pressCost;
  const backRecovery = 1 + K.BACK_RECOVERY_BONUS * r.fieldPosition;

  const rawMisfit = Math.abs(r.fieldPosition - profile.preferred);
  let misfit = clamp((rawMisfit - profile.tolerance) / (1 - profile.tolerance), 0, 1);
  if (hasTrait(r.traits, 'tractable')) misfit *= 0.45;

  // Positional preference only matters while a race is still being SET UP, and
  // ramps in rather than snapping on at the gate.
  //
  // ai.ts prices reaching your slot as a bounded spike in EFFORT during the
  // opening scramble (ESTABLISH_GAIN, up to CRUISE_EFFORT) — fading this in
  // across the same window (ESTABLISH_UNTIL) means the drift itself is what's
  // priced during the scramble, not the scramble and the drift together. Once
  // everyone is committed in the stretch it fades OUT again — otherwise a
  // closer is punished for executing its own strategy, since making its run
  // means leaving the back of the field by definition. Own progress, not the
  // leader's, for the same reason the kick window above uses it.
  const positional = clamp(
    Math.min(
      ownProgress / K.ESTABLISH_UNTIL,
      (K.POSITION_FADE_END - ownProgress) / (K.POSITION_FADE_END - K.POSITION_FADE_START),
    ),
    0,
    1,
  );
  misfit *= positional;

  // Two-sided: a perfect fit earns a genuine regen BONUS, a bad fit a genuine
  // PENALTY — floored, never negative. Being in position must pay off, not
  // merely avoid a fine.
  const fit = (1 - misfit) * positional;

  // Never below RECOVERY_FLOOR: leading, contested, and badly out of position
  // all compound here, but nothing in this stack can push the regen rate to
  // zero or negative.
  let recoveryMult = clamp(
    (backRecovery * (1 + K.POSITION_RECOVERY_BONUS * fit - K.OUT_POSITION_RECOVERY_PENALTY * misfit)) /
      frontPenalty,
    K.RECOVERY_FLOOR,
    4,
  );

  if (hasTrait(r.traits, 'railHugger')) recoveryMult *= r.lane === 0 ? 1.06 : 0.95;
  if (hasTrait(r.traits, 'herdAnimal')) recoveryMult *= r.drafting ? 1.15 : 0.92;
  if (hasTrait(r.traits, 'loner')) recoveryMult *= r.drafting ? 0.9 : 1.12;
  if (hasTrait(r.traits, 'needsRoom')) recoveryMult *= r.blockedFor > 0 ? 0.83 : 1.04;
  if (r.drafting) recoveryMult *= 1 + K.DRAFT_RECOVERY_BONUS;
  recoveryMult = Math.max(K.RECOVERY_FLOOR, recoveryMult);

  // --- Charge regen: the only way charges move, other than the kick --------
  //
  // Holding (ControlInput.holding, ai.ts) is a deliberate choice to ride
  // below top speed for a large regen payoff on top of the position
  // multiplier above — the mirror of a kick. Charges never go down here;
  // spending is the kick's job alone.
  const kicking = r.kickRemaining > 0;
  // "Very reactive to good riding" — Thirsty amplifies the payoff for
  // holding without changing the baseline, so a well-ridden pull banks
  // charges much faster and a horse never rested gains nothing extra.
  const holdBonus = input.holding ? K.HOLD_REGEN_BONUS * (hasTrait(r.traits, 'thirsty') ? 1.6 : 1) : 1;
  let regenMult = recoveryMult * holdBonus;

  // "Burns extra energy through the first furlong" — Gate Rusher's explosive
  // break now reads as slower regen in that window rather than a drain.
  if (hasTrait(r.traits, 'gateRusher') && ownProgress < 0.125) regenMult *= 0.7;
  // "Keyed up and slower to settle, delaying energy recovery early."
  if (hasTrait(r.traits, 'alert') && ownProgress < 0.2) regenMult *= 0.85;
  // "Extremely cheap at moderate effort, punishing at maximum."
  if (hasTrait(r.traits, 'cruiser')) regenMult *= r.effort > 0.85 ? 0.7 : 1.3;

  r.regenMult = regenMult;

  if (r.kicksRemaining < K.CHARGE_CAPACITY) {
    r.chargeProgress += r.chargeRegenRate * regenMult * K.DT;
    if (r.chargeProgress >= 1) {
      r.chargeProgress -= 1;
      r.kicksRemaining++;
    }
  } else {
    r.chargeProgress = 0;
  }

  // --- The performance band -------------------------------------------------
  // Consistency decides how tightly the horse delivers its true ability,
  // re-rolled periodically so races have texture rather than smooth curves.
  r.variationTimer -= K.DT;
  if (r.variationTimer <= 0) {
    r.variationTimer = rng.range(K.VARIATION_INTERVAL_MIN, K.VARIATION_INTERVAL_MAX);
    r.variation = 1 + rng.range(-r.bandDown, r.bandUp);
  }

  // --- Speed ----------------------------------------------------------------
  // Style says where a horse belongs; Moment says when it shines — entirely
  // through the kick now (KICK_MAX_BONUS etc. above), not a passive curve.
  // Top speed is just maxSpeed x the performance band; a kick is the ONLY
  // thing that ever pushes a horse above it (constants.ts, "Effort: HOLD /
  // CRUISE / KICK").
  let speedCap = r.maxSpeed * r.variation;

  if (kicking) {
    speedCap *= 1 + r.kickStrength;
    r.kickRemaining -= K.DT;
  }

  // Heart: surges when in touch with the lead late.
  if (hasTrait(r.traits, 'heart') && ownProgress > 0.8 && r.rank <= 3) speedCap *= 1.02;

  // Consistency: green moments, only while the race is being run.
  if (r.greenRemaining <= 0 && ownProgress > 0.1 && ownProgress < 0.9) {
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
      kicksLeft: r.kicksRemaining,
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
