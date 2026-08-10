import { createRng, type Rng } from '../rng.js';
import type { Horse } from '../types.js';
import type {
  PlayerInput,
  RaceConfig,
  RaceEntrant,
  RaceEvent,
  RaceOutcome,
  RaceResult,
} from './types.js';
import { paceFactor } from './pace.js';
import { distanceFactor } from './aptitude.js';
import {
  type TankModifiers,
  conditionReadout,
  drainPerSecond,
  fatigueFactor,
  recoverPerSecond,
} from './tank.js';
import {
  type ChargeState,
  inMomentWindow,
  kickWindowBonus,
  regenCharges,
  spendCharge,
  startingCharges,
} from './charges.js';
import {
  type KickPlanned,
  type RideDecision,
  type RiderState,
  baseRide,
  nextPendingKick,
  nextUnfiredKick,
  planKicks,
  playerRide,
} from './rider.js';
import {
  BASE_ACCEL,
  BASE_SPEED,
  BURST_ACCEL_SPAN,
  CONDITION_MAX_FACTOR,
  CONDITION_MIN_FACTOR,
  DECEL_MULT,
  DRAFT_LANE_TOLERANCE,
  DRAFT_RANGE_METRES,
  EASY_LEAD_CLEAR_METRES,
  FORM_BASE_SPREAD,
  FORM_TEMPER_AMPLIFY,
  FUMBLE_BASE,
  FUMBLE_DURATION,
  GOING_MAX_FACTOR,
  GOING_MIN_FACTOR,
  GREEN_BASE,
  GREEN_DURATION,
  HOLD_DELTA,
  HOLD_FLOOR,
  KICK_BURST_WEIGHT,
  KICK_DECAY,
  KICK_DURATION,
  KICK_GRIT_WEIGHT,
  KICK_JOCKEY_WEIGHT,
  KICK_COOLDOWN,
  KICK_COOLDOWN_IN_WINDOW,
  KICK_MAX_BONUS,
  KICK_RAMP,
  KICK_READY_FRACTION,
  LANE_COUNT,
  METRES_PER_LENGTH,
  MORALE_MAX_FACTOR,
  MORALE_MIN_FACTOR,
  OFF_COLOUR_BASE,
  OFF_COLOUR_PENALTY,
  CONTACT_LENGTHS,
  CONTACT_MAX_LIFT,
  CONTACT_RAMP_LENGTHS,
  PACE_MAX,
  PACE_MIN,
  PRESS_FROM,
  PRESS_RANGE_METRES,
  PRESS_RANK_LIMIT,
  SPEED_STAT_SPAN,
  TANK_START,
  TICK_HZ,
  TRAIT_ALERT_FUMBLE,
  TRAIT_CRUISER_EXPONENT_RELIEF,
  FRONT_RUNNER_EXPONENT_RELIEF,
  TRAIT_GATE_RUSHER_EARLY,
  TRAIT_GATE_RUSHER_PAYBACK,
  TRAIT_IRON_LUNGS_RECOVER,
  TRAIT_QUICK_RECOVERY_DRAFT,
  TRAIT_THIRSTY_RECOVER,
} from './constants.js';

/**
 * The race simulation.
 *
 * ONE SPEED PIPELINE, FIVE FACTORS, ONE OWNER EACH (REBUILD.md R1). Speed is
 * written in exactly one place — marked below in `stepRunner` — and it is the
 * product of:
 *
 *     cruise x preRace x pace x kick x fatigue
 *
 * Nothing else in this codebase may write to speed. No positional bonus, no
 * catch-up multiplier, no phase profile, no moment lift. The previous three
 * attempts all failed the same way: seven systems could move the same number,
 * so no measurement could ever attribute a change to a cause.
 *
 * The kick is the only factor allowed above 1.0, and it is hard-clamped and
 * non-stacking (R2). Overlapping kicks take the maximum, never the sum.
 */

const dt = 1 / TICK_HZ;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// Snapshot types — the shape ui/raceScreen.ts reads
// ---------------------------------------------------------------------------

export interface RunnerSnapshot {
  id: string;
  name: string;
  distance: number;
  speed: number;
  lane: number;
  rank: number;
  /** The current pace factor, remapped to 0-1 for the render rig's `drive`. */
  effort: number;
  kicking: boolean;
  kicksRemaining: number;
  chargeProgress: number;
  /** recover / drain this tick. Drives the 1-3 arrow regen indicator. */
  regenMult: number;
  /**
   * How well the horse is going, 1 (full of running) to 0 (cooked).
   *
   * The tank itself stays hidden — no stamina bar — but its EFFECT must not be,
   * or a horse can be showing a full bank of charges while being completely out
   * of petrol and the player has no way to know.
   */
  condition: number;
  /** Inside its own Moment window, where its kick is worth most. */
  inWindow: boolean;
  /**
   * 0 while a kick is ready, rising to 1 as the cooldown expires.
   *
   * A horse cannot lunge twice in the same stride, but if the HUD does not SAY
   * so then a tap that does nothing just reads as a broken button. The owner,
   * playing it: "after I use a kick charge I can't use another for a period of
   * time and I don't know why that is."
   */
  kickReady: number;
  /** Always false in v1 — there is no blocking (REBUILD.md §9). */
  blocked: boolean;
  drafting: boolean;
  offColour: boolean;
  finished: boolean;
  finishTime: number | null;
  coat: string;
}

export interface RaceSnapshot {
  elapsed: number;
  /** The LEADER's progress through the race. */
  progress: number;
  leaderDistance: number;
  runners: RunnerSnapshot[];
  fresh: RaceEvent[];
}

export interface LiveRace {
  step(): boolean;
  snapshot(): RaceSnapshot;
  outcome(): RaceOutcome;
  readonly totalMetres: number;
  readonly config: RaceConfig;
  /** Routes player input to one runner. Everything else rides itself. */
  setPlayer(horseId: string, input: PlayerInput): void;
  /**
   * The frozen pre-race factor for a runner. Exposed so the harness can assert
   * I2 against `cruise * preRace * CEILING` — the real invariant — rather than
   * against `cruise` alone, which double-counts a well-suited horse's own
   * legitimate pre-race edge as if it were a runaway kick.
   */
  preRaceFor(horseId: string): number;
}

// ---------------------------------------------------------------------------
// Per-runner state
// ---------------------------------------------------------------------------

interface Runner {
  horse: Horse;

  // Frozen at the gate ------------------------------------------------------
  /** m/s ceiling from the Speed stat alone. */
  cruise: number;
  /** m/s². */
  accel: number;
  /** condition x morale x form x going x distance x delivery. Never moves. */
  preRace: number;
  lane: number;
  tankMods: TankModifiers;
  plan: KickPlanned;
  fumbledStart: boolean;
  offColour: boolean;
  /** Own-progress points at which a green moment costs ground. */
  greenAt: number[];
  gateRusher: boolean;

  // Live --------------------------------------------------------------------
  distance: number;
  speed: number;
  tank: number;
  /** The player's bank. Wholly separate from `tank` — a kick never costs tank. */
  charges: ChargeState;
  /** Elapsed seconds when the live kick fired, or -1. */
  kickAt: number;
  kickStrength: number;
  kicksFired: number;
  fired: boolean[];
  drafting: boolean;
  /** Rivals contesting this horse's position. Costs tank, never speed. */
  press: number;
  /** 0-1: how clear of the field this horse is while leading it. */
  easyLead: number;
  holding: boolean;
  regenMult: number;
  paceNow: number;
  rank: number;
  finished: boolean;
  finishTime: number | null;
  /** Elapsed time at each quarter of the race. */
  sectionals: number[];
  nextSectional: number;
  greenUntil: number;
  nextGreen: number;
}

// ---------------------------------------------------------------------------
// Gate: everything computed once, before the race moves
// ---------------------------------------------------------------------------

function cruiseFor(horse: Horse): number {
  const baseSpeed = BASE_SPEED * (1 - SPEED_STAT_SPAN / 2 + SPEED_STAT_SPAN * (horse.stats.speed / 100));
  // Stamina gates speed: can't unlock full speed without stamina (0.85x to 1.0x range)
  const staminaGate = 0.85 + 0.15 * (horse.stats.stamina / 100);
  return baseSpeed * staminaGate;
}

function accelFor(horse: Horse): number {
  return BASE_ACCEL * (1 - BURST_ACCEL_SPAN / 2 + BURST_ACCEL_SPAN * (horse.stats.burst / 100));
}

function lerp(lo: number, hi: number, t: number): number {
  return lo + (hi - lo) * clamp01(t);
}

/** Going suitability. Conditions traits live here and nowhere else. */
function goingFor(horse: Horse, config: RaceConfig): number {
  const soft = config.going === 'soft' || config.going === 'heavy';
  const firm = config.going === 'firm';
  const severity = config.going === 'heavy' ? 1 : config.going === 'soft' ? 0.55 : firm ? 0.35 : 0;

  let suits = 0;
  if (horse.traits.includes('allWeather')) suits = 1;
  else if (soft && horse.traits.includes('mudder')) suits = 1;
  else if (firm && horse.traits.includes('firmSpecialist')) suits = 1;
  else if (soft && horse.traits.includes('firmSpecialist')) suits = -1;
  else if (firm && horse.traits.includes('mudder')) suits = -1;

  if (suits > 0) return GOING_MAX_FACTOR;
  return lerp(GOING_MAX_FACTOR, GOING_MIN_FACTOR, severity * (suits < 0 ? 1.5 : 1));
}

function tankModsFor(horse: Horse): TankModifiers {
  let recoverMult = 1;
  if (horse.traits.includes('ironLungs')) recoverMult *= TRAIT_IRON_LUNGS_RECOVER;
  if (horse.traits.includes('thirsty')) recoverMult *= TRAIT_THIRSTY_RECOVER;
  let exponentRelief = 0;
  if (horse.traits.includes('cruiser')) exponentRelief += TRAIT_CRUISER_EXPONENT_RELIEF;
  if (horse.style === 'frontRunner') exponentRelief += FRONT_RUNNER_EXPONENT_RELIEF;
  return {
    recoverMult,
    draftMult: horse.traits.includes('quickRecovery') ? TRAIT_QUICK_RECOVERY_DRAFT : 1,
    exponentRelief,
  };
}

function makeRunner(
  horse: Horse,
  lane: number,
  config: RaceConfig,
  rng: Rng,
  raceSeconds: number,
): Runner {
  const consistency = horse.stats.consistency / 100;

  // ---- Pre-race, computed ONCE and then frozen (REBUILD.md §10) ------------
  // Six things that used to poke at speed mid-race collapse into one number
  // that never moves again. The single biggest simplification in the rebuild.
  const condition = lerp(CONDITION_MIN_FACTOR, CONDITION_MAX_FACTOR, horse.condition / 100);
  const morale = lerp(MORALE_MIN_FACTOR, MORALE_MAX_FACTOR, horse.morale / 100);

  // Daily form: low Temper swings bigger in BOTH directions (DESIGN.md §2).
  const amplitude = FORM_BASE_SPREAD + FORM_TEMPER_AMPLIFY * (1 - horse.stats.temper / 100);
  const form = 1 + rng.normal(0, amplitude);

  const going = goingFor(horse, config);
  const distance = distanceFactor(horse.preferredDistance, config.metres);

  const fumbleChance =
    FUMBLE_BASE * (1 - consistency) * (horse.traits.includes('alert') ? TRAIT_ALERT_FUMBLE : 1);
  const fumbledStart = rng.chance(fumbleChance);
  const offColour = rng.chance(OFF_COLOUR_BASE * (1 - consistency));
  const delivery = offColour ? OFF_COLOUR_PENALTY : 1;

  const greenAt: number[] = [];
  for (let i = 0; i < 2; i++) {
    if (rng.chance(GREEN_BASE * (1 - consistency))) greenAt.push(rng.range(0.1, 0.9));
  }
  greenAt.sort((a, b) => a - b);

  const plan = planKicks(horse, rng, raceSeconds);

  return {
    horse,
    cruise: cruiseFor(horse),
    accel: accelFor(horse),
    preRace: condition * morale * form * going * distance * delivery,
    lane,
    tankMods: tankModsFor(horse),
    plan,
    fumbledStart,
    offColour,
    greenAt,
    gateRusher: horse.traits.includes('gateRusher'),

    distance: 0,
    speed: 0,
    tank: TANK_START,
    charges: startingCharges(),
    kickAt: -1,
    kickStrength: 0,
    kicksFired: 0,
    fired: plan.points.map(() => false),
    drafting: false,
    press: 0,
    easyLead: 0,
    holding: false,
    regenMult: 1,
    paceNow: PACE_MIN,
    rank: 1,
    finished: false,
    finishTime: null,
    sectionals: [],
    nextSectional: 0.25,
    greenUntil: -1,
    nextGreen: 0,
  };
}

// ---------------------------------------------------------------------------
// The kick (REBUILD.md §8)
// ---------------------------------------------------------------------------

function kickStrengthFor(horse: Horse): number {
  return clamp01(
    KICK_GRIT_WEIGHT * (horse.stats.grit / 100) +
      KICK_BURST_WEIGHT * (horse.stats.burst / 100) +
      KICK_JOCKEY_WEIGHT * (horse.jockeySkill / 100),
  );
}

/** Ramp in, hold, decay out. Zero outside the kick's own window. */
export function kickShape(elapsed: number): number {
  if (elapsed < 0 || elapsed > KICK_DURATION) return 0;
  if (elapsed < KICK_RAMP) return elapsed / KICK_RAMP;
  const decayFrom = KICK_DURATION - KICK_DECAY;
  if (elapsed > decayFrom) return 1 - (elapsed - decayFrom) / KICK_DECAY;
  return 1;
}

/**
 * The kick factor, hard-clamped.
 *
 * R2: ten stacked bonuses and one bonus produce the identical ceiling. The
 * 2x-launch bug came from four multiplicative modifiers with no clamp
 * compounding on a closer running from behind, where the catch-up term grew
 * with the deficit — a positive feedback loop. There is no catch-up term here
 * at all (R3), and this Math.min is what keeps the rest honest.
 */
function kickFactorFor(runner: Runner, elapsed: number): number {
  if (runner.kickAt < 0) return 1;
  const shaped = kickShape(elapsed - runner.kickAt);
  if (shaped <= 0) return 1;
  return 1 + Math.min(KICK_MAX_BONUS, KICK_MAX_BONUS * runner.kickStrength * shaped);
}

// ---------------------------------------------------------------------------
// The race
// ---------------------------------------------------------------------------

export function createRace(entrants: RaceEntrant[], config: RaceConfig): LiveRace {
  const rng = createRng(config.seed);
  const totalMetres = config.metres;

  // Rough, but all the rider needs: it only sets how far apart planned kicks
  // must sit to clear the cooldown.
  const raceSeconds = totalMetres / BASE_SPEED;

  // Shuffle lanes so player doesn't always start in lane 0
  const lanes = Array.from({ length: entrants.length }, (_, i) => i % LANE_COUNT);
  rng.shuffle(lanes);

  const runners: Runner[] = entrants.map((e, i) =>
    makeRunner(e.horse, lanes[i]!, config, rng, raceSeconds),
  );

  let elapsed = 0;
  let fresh: RaceEvent[] = [];
  const events: RaceEvent[] = [];
  const playerInputs = new Map<string, PlayerInput>();

  /** Guard against a pathological field never reaching the wire. */
  const maxElapsed = (totalMetres / (BASE_SPEED * 0.5)) * 3;

  const record = (kind: string, horseId: string, detail?: string): void => {
    const ev: RaceEvent = detail === undefined
      ? { at: elapsed, kind, horseId }
      : { at: elapsed, kind, horseId, detail };
    events.push(ev);
    fresh.push(ev);
  };

  /**
   * Pack interaction, read from positions BEFORE anyone moves this tick.
   *
   * Both effects are TANK-side. Neither touches speed (R1). Together they are
   * the only way one runner affects another in v1 — there is no blocking.
   */
  const updatePack = (): void => {
    for (const r of runners) {
      if (r.finished) {
        r.drafting = false;
        r.press = 0;
        r.easyLead = 0;
        continue;
      }

      // Drafting: someone close ahead, in a neighbouring lane, gives shelter.
      r.drafting = runners.some(
        (o) =>
          o !== r &&
          !o.finished &&
          o.distance > r.distance &&
          o.distance - r.distance <= DRAFT_RANGE_METRES &&
          Math.abs(o.lane - r.lane) <= DRAFT_LANE_TOLERANCE,
      );

      // Press: up front with company. This is what makes a duel mutually
      // destructive — every horse in the contested group pays, so three
      // front-runners refusing to yield empty each other out and the race comes
      // back from behind, exactly as DESIGN.md §4 describes.
      const settled = r.distance / totalMetres >= PRESS_FROM;
      r.press =
        settled && r.rank <= PRESS_RANK_LIMIT
          ? runners.filter(
              (o) =>
                o !== r &&
                !o.finished &&
                Math.abs(o.distance - r.distance) <= PRESS_RANGE_METRES,
            ).length
          : 0;

      // Daylight. Being in front is physically hard (RANK_SHELTER says so);
      // being in front UNCHALLENGED is tactically easy, and this is that.
      // Graded by how clear the horse actually is, so it rewards a front-runner
      // for doing its job rather than switching on only in rare quiet races.
      if (settled && r.rank === 1) {
        let nearest = Infinity;
        for (const o of runners) {
          if (o === r || o.finished) continue;
          nearest = Math.min(nearest, r.distance - o.distance);
        }
        r.easyLead = clamp01(nearest / EASY_LEAD_CLEAR_METRES);
      } else {
        r.easyLead = 0;
      }
    }
  };

  const stepRunner = (r: Runner, leaderDistance: number): void => {
    if (r.finished) return;

    const ownProgress = clamp01(r.distance / totalMetres);

    // ---- 1. Ask the rider -------------------------------------------------
    const charges = r.charges.count;
    // Measured against last tick's target, which is all a rider could know.
    const atSpeed = r.speed >= r.cruise * r.preRace * r.paceNow * KICK_READY_FRACTION;
    const state: RiderState = { ownProgress, tank: r.tank, charges, fired: r.fired, atSpeed };

    const base = baseRide(state, r.plan);
    const input = playerInputs.get(r.horse.id);
    const playerTapped = Boolean(input?.kickPending) && atSpeed;
    const decision: RideDecision = input ? playerRide(base, input, atSpeed) : base;

    // A horse cannot lunge twice in the same stride. While a kick is live,
    // further fire requests are IGNORED — no charge spent, no timer refreshed.
    //
    // This is a cooldown, not a cap: a horse may fire as many kicks across a
    // race as its tank affords, which is the owner's rule ("if a player wants
    // to use their kicks, let them"). What it removes is a purely
    // self-destructive action. REBUILD.md §8.3 originally specified that
    // re-firing refreshed the timer AND cost a charge, and measurement showed
    // why that is wrong: it let a held tap drain the whole tank in a couple of
    // seconds, and every active ride persona finished 0 for 150, beaten 18-36
    // lengths, against a hands-off autopilot winning a fair 12.7%. Paying full
    // price to refresh a kick already running is never the better play, so it
    // was never a real choice — only a trap for anyone who touched the screen.
    const inWindow = inMomentWindow(r.horse.moment, ownProgress);
    const cooldown = inWindow ? KICK_COOLDOWN_IN_WINDOW : KICK_COOLDOWN;
    const kickLive = r.kickAt >= 0 && elapsed - r.kickAt < cooldown;

    if (decision.fireKick && charges >= 1 && atSpeed && !kickLive && spendCharge(r.charges)) {
      r.kickAt = elapsed;
      // A kick produced at the horse's own moment is worth more, on a smooth
      // curve rather than a cliff — and how much more depends on the SHAPE of
      // that horse's window. A late horse's window is narrow and fierce, an
      // early horse's broad and mild, and the two are worth the same over a
      // race. Outside it entirely a kick still works, just poorly.
      r.kickStrength = kickStrengthFor(r.horse) * kickWindowBonus(r.horse.moment, ownProgress, r.horse.style);
      r.kicksFired += 1;

      // A player tap brings the next planned kick FORWARD; the AI's own
      // schedule consumes the one it is actually calling for. Either way the
      // charge comes out of the same plan, so touching the screen changes WHEN
      // a horse spends, not how much it has to spend.
      const planned = playerTapped ? nextUnfiredKick(state) : nextPendingKick(state, r.plan);
      if (planned >= 0) r.fired[planned] = true;
      record('kick', r.horse.id);
      // Clear the kick input only after successfully firing a kick.
      if (input) input.kickPending = false;
    }

    r.holding = decision.gear === 'HOLD';

    // ---- 2. Pace ----------------------------------------------------------
    let pace = paceFactor(r.horse.style, r.horse.moment, ownProgress);

    // Keeping in touch. A patient ride is not a passive one: a horse letting
    // the field walk away is not being ridden patiently, it is coasting.
    //
    // Read carefully — this is NOT the catch-up mechanic R3 forbids. It adds to
    // the horse's own pace curve and is then clamped by the same PACE_MAX every
    // horse shares, so it can never produce speed a leader could not also reach.
    // And because drain reads the resulting pace, chasing is charged for at the
    // full superlinear rate: a horse that had to close arrives with less tank
    // than one that did not. The old bug scaled kick STRENGTH by the deficit
    // with no ceiling, which compounded; this cannot.
    const behindLengths = (leaderDistance - r.distance) / METRES_PER_LENGTH;
    if (behindLengths > CONTACT_LENGTHS) {
      const urgency = clamp01(
        (behindLengths - CONTACT_LENGTHS) / (CONTACT_RAMP_LENGTHS - CONTACT_LENGTHS),
      );
      pace += CONTACT_MAX_LIFT * urgency;
    }
    pace = Math.min(PACE_MAX, pace);

    if (r.holding) pace = Math.max(HOLD_FLOOR, pace + HOLD_DELTA);

    if (r.gateRusher) {
      if (ownProgress < 0.15) pace += TRAIT_GATE_RUSHER_EARLY;
      else if (ownProgress < 0.4) pace += TRAIT_GATE_RUSHER_PAYBACK;
    }

    // A fumbled start and a green moment cost ground the same way: the horse is
    // briefly not running its own race.
    if (r.fumbledStart && elapsed < FUMBLE_DURATION) pace = PACE_MIN;
    if (r.nextGreen < r.greenAt.length && ownProgress >= r.greenAt[r.nextGreen]!) {
      r.greenUntil = elapsed + GREEN_DURATION;
      r.nextGreen += 1;
      record('green', r.horse.id);
    }
    if (elapsed < r.greenUntil) pace = PACE_MIN;

    r.paceNow = pace;

    // ---- 3. Kick and fatigue ---------------------------------------------
    const kick = kickFactorFor(r, elapsed);
    const fatigue = fatigueFactor(r.tank);

    // ---- 4. THE ONLY PLACE SPEED IS WRITTEN (REBUILD.md R1) ---------------
    const target = r.cruise * r.preRace * pace * kick * fatigue;

    if (r.speed < target) r.speed = Math.min(target, r.speed + r.accel * dt);
    else r.speed = Math.max(target, r.speed - r.accel * DECEL_MULT * dt);

    // ---- 5. Move ----------------------------------------------------------
    r.distance += r.speed * dt;

    // ---- 6. Tank ----------------------------------------------------------
    const drain = drainPerSecond(pace, r.speed, totalMetres, r.tankMods, r.press);
    const recover = recoverPerSecond(
      r.horse.stats.stamina,
      r.speed,
      totalMetres,
      r.drafting,
      r.tankMods,
      r.rank,
      runners.length,
      r.easyLead,
    );
    r.regenMult = drain > 0 ? recover / drain : 1;
    r.tank = clamp01(r.tank + (recover - drain) * dt);

    // ---- 6b. Charges — the player's bank, on its own clock ----------------
    // Settled covers every way a horse is having an easier time of it, so
    // taking a pull is a real tactical move and not just lost ground.
    regenCharges(r.charges, dt, r.holding || r.drafting || r.easyLead > 0.5);

    // ---- 7. Sectionals and the wire --------------------------------------
    const progress = r.distance / totalMetres;
    while (r.nextSectional <= 1.0001 && progress >= r.nextSectional) {
      r.sectionals.push(elapsed);
      r.nextSectional += 0.25;
    }

    if (r.distance >= totalMetres) {
      r.finished = true;
      // Sub-tick precision. A whole tick is ~0.7 m at racing speed, nearly a
      // third of a length — enough to invent or erase a photo finish.
      const overshoot = r.distance - totalMetres;
      r.finishTime = elapsed + dt - (r.speed > 0 ? overshoot / r.speed : 0);
      record('finish', r.horse.id);
    }
  };

  const rankAll = (): void => {
    const order = [...runners].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });
    order.forEach((r, i) => (r.rank = i + 1));
  };

  const step = (): boolean => {
    fresh = [];
    if (runners.every((r) => r.finished) || elapsed > maxElapsed) return false;

    updatePack();
    // Read once, before anyone moves, so every runner is measured against the
    // same leader rather than against a target that shifts mid-tick.
    const leaderDistance = Math.max(...runners.map((r) => r.distance));
    for (const r of runners) stepRunner(r, leaderDistance);
    elapsed += dt;
    rankAll();

    return !runners.every((r) => r.finished) && elapsed <= maxElapsed;
  };

  const snapshotRunner = (r: Runner): RunnerSnapshot => ({
    id: r.horse.id,
    name: r.horse.name,
    distance: r.distance,
    speed: r.speed,
    lane: r.lane,
    rank: r.rank,
    // Remap the pace band onto 0-1 so the render rig's `drive` reads sensibly.
    effort: clamp01((r.paceNow - HOLD_FLOOR) / (1 - HOLD_FLOOR)),
    kicking: r.kickAt >= 0 && elapsed - r.kickAt <= KICK_DURATION,
    kickReady: (() => {
      const ownProgress = clamp01(r.distance / totalMetres);
      const inWindow = inMomentWindow(r.horse.moment, ownProgress);
      const cooldown = inWindow ? KICK_COOLDOWN_IN_WINDOW : KICK_COOLDOWN;
      return r.kickAt < 0 ? 1 : Math.min(1, (elapsed - r.kickAt) / cooldown);
    })(),
    kicksRemaining: r.charges.count,
    chargeProgress: r.charges.progress,
    regenMult: r.regenMult,
    condition: conditionReadout(r.tank),
    inWindow: inMomentWindow(r.horse.moment, clamp01(r.distance / totalMetres)),
    blocked: false,
    drafting: r.drafting,
    offColour: r.offColour,
    finished: r.finished,
    finishTime: r.finishTime,
    coat: r.horse.coat,
  });

  const snapshot = (): RaceSnapshot => {
    const leaderDistance = Math.max(...runners.map((r) => r.distance));
    return {
      elapsed,
      progress: clamp01(leaderDistance / totalMetres),
      leaderDistance,
      runners: runners.map(snapshotRunner),
      fresh,
    };
  };

  const outcome = (): RaceOutcome => {
    const order = [...runners].sort(
      (a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) || b.distance - a.distance,
    );
    const winnerTime = order[0]?.finishTime ?? elapsed;

    const results: RaceResult[] = order.map((r, i) => {
      const time = r.finishTime ?? elapsed;
      const avgSpeed = time > 0 ? totalMetres / time : BASE_SPEED;
      const marginMetres = Math.max(0, (time - winnerTime) * avgSpeed);
      return {
        horseId: r.horse.id,
        name: r.horse.name,
        finishPosition: i + 1,
        time,
        margin: marginMetres / METRES_PER_LENGTH,
        kicksLeft: r.charges.count,
        sectionals: r.sectionals,
        hadTrouble: false,
        fumbledStart: r.fumbledStart,
        offColour: r.offColour,
      };
    });

    // paceRating: the last quarter over the first. Above 1 means the race
    // SLOWED — leaders went off too fast and emptied, which is the collapse an
    // upset comes out of. recap.ts's paceOf() reads it this way.
    const splits = runners
      .map((r) => r.sectionals)
      .filter((s) => s.length >= 4)
      .map((s) => ({ first: s[0]!, last: s[3]! - s[2]! }));
    const paceRating =
      splits.length > 0
        ? splits.reduce((sum, s) => sum + (s.first > 0 ? s.last / s.first : 1), 0) / splits.length
        : 1;

    return { results, events, paceRating, duration: elapsed };
  };

  return {
    step,
    snapshot,
    outcome,
    totalMetres,
    config,
    setPlayer(horseId, input) {
      playerInputs.set(horseId, input);
    },
    preRaceFor(horseId) {
      return runners.find((r) => r.horse.id === horseId)?.preRace ?? 1;
    },
  };
}

/** Headless: run a race to completion and return only the result. */
export function simulateRace(entrants: RaceEntrant[], config: RaceConfig): RaceOutcome {
  const race = createRace(entrants, config);
  while (race.step()) {
    /* run to the wire */
  }
  return race.outcome();
}

/** Exposed for the harness's speed-ceiling invariant (REBUILD.md I2). */
export { cruiseFor };
