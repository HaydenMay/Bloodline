/**
 * Legacy and Hall of Fame.
 *
 * Two separate scores:
 *   - Horse legacy  — volatile. Rises with strong finishes, dips with bad ones.
 *                     This is what the Hall of Fame judges.
 *   - Stable legacy — prestige of the farm. Points locked in from horses whose
 *                     careers are over, plus whatever the current horse is
 *                     worth right now. Rises and falls with the active horse,
 *                     and is what gates facility upgrades.
 */

export interface LegacyTier {
  level: number;
  name: string;
  minPoints: number;
  description: string;
  icon: string;
  benefits: string[];
}

export interface HallOfFameEntry {
  horseName: string;
  wins: number;
  starts: number;
  earnings: number;
  legacyPoints: number;
  division: string;
  season: number;
  timestamp: number;
}

/** The active horse's own legacy — the roller coaster. */
export interface HorseLegacy {
  /** Current score. Can go down. */
  points: number;
  /** Highest score ever reached. Hall of Fame is judged on this, so a late
      slump never strips a horse of an honour it already earned. */
  peak: number;
  /** Score after each race, oldest first. Drawn as the career arc. */
  history: number[];
  /** Inducted into the Hall of Fame. Once true, stays true. */
  hallOfFame: boolean;
}

/** The farm's standing, accumulated across every horse it has campaigned. */
export interface StableLegacy {
  /** Locked in from horses whose careers have ended. Never decreases. */
  archivedPoints: number;
  /** Horses inducted into the Hall of Fame, newest last. */
  hallOfFame: HallOfFameEntry[];
}

export const LEGACY_TIERS: LegacyTier[] = [
  {
    level: 0,
    name: 'Novice',
    minPoints: 0,
    description: 'An unknown yard',
    icon: '🐴',
    benefits: ['Basic facilities (Levels 1-2)', 'Standard facility upgrades'],
  },
  {
    level: 1,
    name: 'Professional',
    minPoints: 100,
    description: 'A name on the racecard',
    icon: '🌟',
    benefits: [
      'Professional facilities (Levels 1-3)',
      'All standard facilities available',
      'Breeding facility unlocked',
    ],
  },
  {
    level: 2,
    name: 'Elite',
    minPoints: 300,
    description: 'Championship caliber',
    icon: '👑',
    benefits: [
      'Elite facilities (Levels 1-4)',
      'Premium facility: Elite Stables',
      '5% earnings bonus',
    ],
  },
  {
    level: 3,
    name: 'Champion',
    minPoints: 600,
    description: 'A yard that produces winners',
    icon: '🏆',
    benefits: [
      'Championship facilities (All levels 1-5)',
      'Exclusive facility: Champions Quarter',
      '10% earnings bonus',
      'Breeding trait inheritance',
    ],
  },
  {
    level: 4,
    name: 'Legend',
    minPoints: 1000,
    description: 'Immortal racing legacy',
    icon: '⭐',
    benefits: [
      'All facilities maxed potential',
      'Legendary facility: Stud Empire',
      '15% earnings bonus',
      'Special breeding rights',
    ],
  },
];

/** A horse peaking at or above this earns its place in the Hall of Fame. */
export const HALL_OF_FAME_THRESHOLD = 500;

/** Higher divisions swing harder in both directions. */
const DIVISION_MULTIPLIERS: Record<string, number> = {
  maiden: 1.0,
  novice: 1.3,
  open: 1.6,
  stakes: 2.0,
  championship: 2.5,
};

/** Base points by finishing position. 7th and back is a small, survivable dent. */
const FINISH_POINTS: Record<number, number> = {
  1: 15,
  2: 10,
  3: 6,
  4: 2,
  5: 2,
  6: 2,
  7: -3,
};

/**
 * Reaching a new division, by the division reached.
 *
 * Escalating rather than flat: each rung is harder won than the last, and a
 * flat bonus made the step into Championship worth no more than the step out of
 * Maiden. Indexed by the new division level, so 1 (Novice) pays 25 and
 * 4 (Championship) pays 100.
 */
export const PROMOTION_BONUSES = [0, 25, 50, 75, 100];

export function getPromotionBonus(newDivisionLevel: number): number {
  return PROMOTION_BONUSES[Math.max(0, Math.min(4, newDivisionLevel))] ?? 0;
}

/** Dropping a division costs something, but never a promotion's worth. */
export const DEMOTION_PENALTY = -25;

export function getTierFromPoints(points: number): number {
  for (let i = LEGACY_TIERS.length - 1; i >= 0; i--) {
    const tier = LEGACY_TIERS[i];
    if (tier && points >= tier.minPoints) return i;
  }
  return 0;
}

export function getTier(points: number): LegacyTier {
  return LEGACY_TIERS[getTierFromPoints(points)]!;
}

/** Points swing for one race result. Positive for a good day, negative for a bad one. */
export function calculateRaceLegacyChange(
  finishingPosition: number,
  division: string,
): number {
  const base = FINISH_POINTS[Math.min(Math.max(finishingPosition, 1), 7)] ?? -3;
  const multiplier = DIVISION_MULTIPLIERS[division] ?? 1.0;
  return Math.round(base * multiplier);
}

export function createHorseLegacy(seedPoints = 0): HorseLegacy {
  const points = Math.max(0, seedPoints);
  return {
    points,
    peak: points,
    history: [points],
    hallOfFame: points >= HALL_OF_FAME_THRESHOLD,
  };
}

export function createStableLegacy(archivedPoints = 0): StableLegacy {
  return { archivedPoints: Math.max(0, archivedPoints), hallOfFame: [] };
}

/**
 * Fold a race result into a horse's legacy. Mutates and returns the deltas so
 * callers can report the swing to the player.
 */
export function applyRaceToHorseLegacy(
  legacy: HorseLegacy,
  finishingPosition: number,
  division: string,
  options: {
    promoted?: boolean;
    demoted?: boolean;
    /** New division level, for the escalating promotion bonus. */
    newDivisionLevel?: number;
    /**
     * A promotion or demotion qualifier. These are one-off races against a
     * division you do not belong to yet, so a bad finish costs no legacy —
     * failing the test is its own outcome, and docking points on top would
     * punish a horse twice for reaching far enough to be tested.
     */
    qualifier?: boolean;
  } = {},
): { raceDelta: number; bonus: number; total: number; inducted: boolean } {
  const rawDelta = calculateRaceLegacyChange(finishingPosition, division);
  const raceDelta = options.qualifier ? Math.max(0, rawDelta) : rawDelta;

  let bonus = 0;
  if (options.promoted) bonus += getPromotionBonus(options.newDivisionLevel ?? 0);
  if (options.demoted) bonus += DEMOTION_PENALTY;

  // A slump can erase a horse's standing but never push it into the negative.
  legacy.points = Math.max(0, legacy.points + raceDelta + bonus);
  legacy.history.push(legacy.points);

  const wasInducted = legacy.hallOfFame;
  if (legacy.points > legacy.peak) legacy.peak = legacy.points;
  if (legacy.peak >= HALL_OF_FAME_THRESHOLD) legacy.hallOfFame = true;

  return {
    raceDelta,
    bonus,
    total: legacy.points,
    inducted: legacy.hallOfFame && !wasInducted,
  };
}

/** The farm's live standing: everything banked, plus the horse currently running. */
export function getStableLegacyPoints(
  stable: StableLegacy,
  horse: HorseLegacy | undefined,
): number {
  return stable.archivedPoints + (horse?.points ?? 0);
}

/**
 * Seed a legacy score for a horse that already has a record — used by the test
 * setup and when migrating saves written before legacy existed.
 */
export function seedLegacyFromRecord(
  wins: number,
  earnings: number,
  division: string,
): number {
  let points = 0;

  if (wins >= 50) points += 200;
  else if (wins >= 20) points += 100;
  else if (wins >= 10) points += 50;
  else if (wins >= 1) points += 10;

  points += Math.min(150, Math.floor(earnings / 10000));

  const divisionSeed: Record<string, number> = {
    maiden: 0,
    novice: 40,
    open: 100,
    stakes: 200,
    championship: 350,
  };
  points += divisionSeed[division] ?? 0;

  return points;
}

/* ---------------------------------------------------------------------------
   What a career is worth at retirement
   ------------------------------------------------------------------------ */

/**
 * Retiring within this share of the horse's peak counts as retiring on top.
 */
export const SOUND_RETIREMENT_THRESHOLD = 0.9;

/** What retiring on top adds, on top of the legacy the horse still holds. */
export const SOUND_RETIREMENT_BONUS = 0.2;

export type RetirementReason = 'sound' | 'faded' | 'injured';

export interface RetirementValue {
  /** Prestige banked to the yard, and the horse's worth at stud. */
  banked: number;
  /** Before the bonus. */
  base: number;
  bonus: number;
  reason: RetirementReason;
}

/**
 * What a horse is worth when it stops racing.
 *
 * §8 wants chasing one more purse to be "a real gamble that costs future value".
 * That only works if the yard banks what the horse is worth **now** rather than
 * what it was worth at its best — banking the peak made running a horse into
 * the ground free, which is the opposite of a gamble.
 *
 * Three outcomes:
 *   - **sound**   retired at or near its peak. Banks its legacy plus a bonus.
 *                 This is §8's retiring-on-top reward, named for the timing it
 *                 actually measures rather than the Championship division.
 *   - **faded**   run on past its best. Banks only what is left, which is the
 *                 cost of the gamble.
 *   - **injured** §6 promises a career-ending injury keeps "full breeding
 *                 value", so it banks the peak regardless of where the horse
 *                 had slipped to. The worst luck must not also be the worst
 *                 outcome.
 *
 * Hall of Fame is deliberately *not* judged here — it stays on the peak, and
 * once earned it cannot be lost.
 */
export function getRetirementValue(
  legacy: HorseLegacy,
  endedByInjury = false,
): RetirementValue {
  if (endedByInjury) {
    return { banked: legacy.peak, base: legacy.peak, bonus: 0, reason: 'injured' };
  }

  const heldOn = legacy.peak > 0 ? legacy.points / legacy.peak : 1;

  if (heldOn >= SOUND_RETIREMENT_THRESHOLD) {
    const bonus = Math.round(legacy.points * SOUND_RETIREMENT_BONUS);
    return { banked: legacy.points + bonus, base: legacy.points, bonus, reason: 'sound' };
  }

  return { banked: legacy.points, base: legacy.points, bonus: 0, reason: 'faded' };
}
