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

/** Reaching a new division is worth far more than any single result. */
export const PROMOTION_BONUS = 75;
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
  options: { promoted?: boolean; demoted?: boolean } = {},
): { raceDelta: number; bonus: number; total: number; inducted: boolean } {
  const raceDelta = calculateRaceLegacyChange(finishingPosition, division);
  let bonus = 0;
  if (options.promoted) bonus += PROMOTION_BONUS;
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
