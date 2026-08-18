import type { Horse, Stats } from './types.js';

/**
 * How a horse changes with age and training.
 *
 * DESIGN.md §2 gives every horse hidden potentials that training must not
 * exceed, and §8 gives it an arc — steep growth at 2-3, a peak at 4, decline at
 * 5. Neither was implemented: potentials were generated and read by nothing,
 * training was unbounded, and age never advanced at all, so a horse was
 * identical at its first start and its twentieth.
 */

export type StatKey = keyof Stats;

export const STAT_KEYS: StatKey[] = [
  'speed',
  'stamina',
  'burst',
  'grit',
  'temper',
  'consistency',
];

/**
 * Mid-pack's own edge: bigger training gains, nothing else.
 *
 * Front-runner, stalker and closer each earn something ON RACE DAY — a
 * front-runner's effort-cost relief while genuinely clear, a stalker's draft
 * bonus, a closer's late push (`race/engine.ts`, `race/constants.ts`).
 * Mid-pack is the generalist and has no equivalent: no easy lead, no draft
 * edge, no late lift. Its identity is that a player who trains it hard gets
 * more back for the work than they would with any other style — "winning via
 * stats, not bonuses," in the words that asked for it.
 *
 * A fresh mid-pack horse is therefore identical to any other style at birth.
 * That is deliberate, not a gap: the whole point is that there is nothing to
 * see until a player actually invests in it.
 */
export const MIDPACK_TRAINING_BONUS = 0.15;

/**
 * Mid-pack's SECOND edge, and the one that actually lasts.
 *
 * Measured before this existed: a horse reaches within 3 points of its
 * ceiling in about 40 weeks of training and sits dead on it by 80 — well
 * inside a single ~18-20 start career. Training-gain speed alone is
 * therefore worth something for the first third of a career and **nothing at
 * all** for the rest, once every horse of every style has converged on
 * whatever ceiling it happened to roll. A generalist whose only edge
 * evaporates is not winning on stats, it is winning on nothing.
 *
 * A higher potential ceiling is what survives that convergence — it is where
 * the horse ends up once training is done, not how fast it gets there. Small
 * on purpose, same reasoning as the gender weight in `sim/breeding.ts`: a
 * lever this size measured down once already, after an earlier attempt made
 * it bigger than the thing it was meant to support.
 */
export const MIDPACK_GENEROSITY = 1.04;

/** Racing ages. A horse debuts at 2 and is retired by the end of 5. */
export const DEBUT_AGE = 2;
export const PEAK_AGE = 4;
export const FINAL_AGE = 5;

/**
 * Training multiplier by age. Young horses improve fastest; a five-year-old is
 * holding on rather than building.
 */
export function getAgeTrainingFactor(age: number): number {
  if (age <= 2) return 1.25;
  if (age === 3) return 1.1;
  if (age === 4) return 0.85;
  return 0.5;
}

/**
 * How much of a raw gain survives as the stat approaches its ceiling.
 *
 * §5 asks for "sharply diminishing returns" near a cap — an unstated signal
 * that a stat is finished. The last few points cost many sessions, and nothing
 * ever crosses the ceiling.
 */
export function getCapFactor(current: number, potential: number): number {
  const headroom = potential - current;
  if (headroom <= 0) return 0;
  if (headroom >= 15) return 1;
  // 15 points out: full value. On the ceiling: nothing.
  return Math.max(0.1, headroom / 15);
}

/**
 * Applies a training gain to one stat, honouring both the ceiling and the
 * diminishing returns before it. Returns the change actually applied.
 *
 * Losses pass through untouched: a session's downside is not softened by being
 * near a cap, and may take a horse below one.
 */
export function applyTrainedStat(
  horse: Horse,
  key: StatKey,
  rawChange: number,
): number {
  const current = horse.stats[key];
  const ceiling = horse.potential?.[key] ?? 100;

  if (rawChange <= 0) {
    const next = Math.max(0, current + rawChange);
    horse.stats[key] = next;
    return next - current;
  }

  const scaled = rawChange * getCapFactor(current, ceiling);
  // A gain that rounds to nothing still nudges by a point while there is
  // headroom, so training never feels entirely wasted.
  const applied = scaled > 0 && Math.round(scaled) === 0 ? 1 : Math.round(scaled);
  const next = Math.min(ceiling, current + applied);
  horse.stats[key] = next;
  return next - current;
}

/** True when every stat is within a point of its ceiling. */
export function isFullyDeveloped(horse: Horse): boolean {
  return STAT_KEYS.every((key) => (horse.potential?.[key] ?? 100) - horse.stats[key] <= 1);
}

/* ---------------------------------------------------------------------------
   The decline arc
   ------------------------------------------------------------------------ */

/** Where a horse sits on its arc, for the UI and the trainer's advice. */
export type CareerStage = 'developing' | 'peak' | 'declining';

export function getCareerStage(age: number): CareerStage {
  if (age < PEAK_AGE) return 'developing';
  if (age === PEAK_AGE) return 'peak';
  return 'declining';
}

/**
 * Stat erosion applied when a horse ages into decline.
 *
 * Deliberately gradual. §8 wants retiring to be a judgement call, and a cliff
 * would make it obvious instead — the horse should get quietly worse while
 * still being capable of winning, so "one more season" is a real gamble.
 */
export function applyAgeing(horse: Horse, newAge: number): Partial<Stats> {
  if (newAge <= PEAK_AGE) return {};

  const changes: Partial<Stats> = {};
  // Speed and burst go first — the sharp end of a horse dulls before its
  // stamina and grit do.
  const erosion: Partial<Record<StatKey, number>> = {
    speed: 4,
    burst: 5,
    stamina: 2,
    grit: 1,
    temper: 0,
    consistency: 0,
  };

  for (const key of STAT_KEYS) {
    const loss = erosion[key] ?? 0;
    if (loss === 0) continue;
    const before = horse.stats[key];
    horse.stats[key] = Math.max(0, before - loss);
    // Potential erodes with the stat, so decline cannot be trained back off.
    if (horse.potential) {
      horse.potential[key] = Math.max(horse.stats[key], horse.potential[key] - loss);
    }
    changes[key] = horse.stats[key] - before;
  }

  return changes;
}

/**
 * Races per season, used to decide when a birthday falls.
 *
 * §8 wants 18-20 starts across ages 2-5 — roughly five runs a year.
 */
export const RACES_PER_SEASON = 5;

export interface AgeingResult {
  aged: boolean;
  newAge: number;
  stage: CareerStage;
  changes: Partial<Stats>;
}

/**
 * Advances the horse a season if it has run enough races, and applies whatever
 * that costs it. Returns what happened so the UI can report a birthday.
 */
export function advanceSeasonIfDue(horse: Horse, racesCompleted: number): AgeingResult {
  const seasonsElapsed = Math.floor(racesCompleted / RACES_PER_SEASON);
  const targetAge = Math.min(FINAL_AGE, DEBUT_AGE + seasonsElapsed);

  if (targetAge <= horse.age) {
    return { aged: false, newAge: horse.age, stage: getCareerStage(horse.age), changes: {} };
  }

  horse.age = targetAge;
  const changes = applyAgeing(horse, targetAge);
  return { aged: true, newAge: targetAge, stage: getCareerStage(targetAge), changes };
}

/** Human-readable summary of what a birthday cost, for the notice. */
export function describeStatChanges(changes: Partial<Stats>): string {
  const parts = STAT_KEYS.filter((key) => (changes[key] ?? 0) !== 0).map(
    (key) => `${key} ${changes[key]}`,
  );
  return parts.length ? parts.join(', ') : '';
}

/**
 * What the trainer says about retiring, or null when there is nothing to say.
 *
 * §8 makes retirement the player's call "with the trainer hinting once decline
 * sets in", and pairs it with a legacy score that erodes if you run a declining
 * horse into losses. The advice therefore sharpens as the case strengthens —
 * quiet at the peak, insistent once a horse is visibly past it and its legacy
 * is slipping away from what it once was.
 *
 * **Tone: the trainer is a partner, not a mourner.** Every line opens with "we
 * should think about retiring while…", because the mechanic it is pointing at
 * is a reward, not a failure — stopping near the peak banks a bonus and feeds
 * the next generation. An earlier draft ("the legs are going", "nothing left to
 * prove") read as an obituary for a horse the player was still winning with,
 * which is the wrong feeling for the good ending of a career.
 */
export function getRetirementAdvice(
  horse: Horse,
  racesCompleted: number,
  legacyNow: number,
  legacyPeak: number,
): string | null {
  const stage = getCareerStage(horse.age);
  // How much of its best the horse has given back.
  const slipped = legacyPeak > 0 ? (legacyPeak - legacyNow) / legacyPeak : 0;

  if (horse.age >= FINAL_AGE && racesCompleted >= 16) {
    return 'We should think about retiring while it is still near its best — that is what carries into the next generation.';
  }
  if (stage === 'declining' && slipped >= 0.25) {
    return 'We should think about retiring while there is still plenty to bank. It has come back a way from its peak.';
  }
  if (stage === 'declining') {
    return 'We should think about retiring while it is still winning — though there is a good race left in this one if we pick it right.';
  }
  if (racesCompleted >= 18) {
    return 'We should think about retiring while it is on top. That is a full career behind it, and a fine one.';
  }
  // Nothing to say while the horse is holding its form — advice the player
  // cannot act on is nagging, not counsel.
  return null;
}
