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
  /** Which point scale these figures are on. Absent means the original one. */
  scale?: number;
}

/** The farm's standing, accumulated across every horse it has campaigned. */
export interface StableLegacy {
  /** Locked in from horses whose careers have ended. Never decreases. */
  archivedPoints: number;
  /** Horses inducted into the Hall of Fame, newest last. */
  hallOfFame: HallOfFameEntry[];
  /** Which point scale these figures are on. Absent means the original one. */
  scale?: number;
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
    minPoints: 400,
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
    minPoints: 1500,
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
    minPoints: 3500,
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
    minPoints: 7500,
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

/**
 * A horse peaking at or above this earns its place in the Hall of Fame.
 *
 * Deliberately out of reach of a first-generation horse. Modelling careers
 * against the multiplier curve below puts a typical gen-1 horse near 370, a
 * strong one near 640, and even one that steals a Championship berth at 918 —
 * short of the bar. Clearing it takes a horse that arrives already good, which
 * means breeding and a built-up yard rather than one lucky run.
 */
export const HALL_OF_FAME_THRESHOLD = 1000;

/**
 * Divisions, lowest to highest. The index is the exponent on the curve below.
 */
export const DIVISION_ORDER = ['maiden', 'novice', 'open', 'stakes', 'championship'] as const;

/**
 * How much harder each division swings, per rung.
 *
 * Exponential rather than linear. A flat-ish ladder let a horse that never left
 * Stakes out-score one that won Championships, because volume beat class — the
 * grinder simply had more races. Compounding class per rung puts the champion
 * back on top while still leaving room for the rare horse that dominated a
 * lower division without ever winning a title.
 */
export const DIVISION_MULTIPLIER_BASE = 1.6;

const DIVISION_MULTIPLIERS: Record<string, number> = Object.fromEntries(
  DIVISION_ORDER.map((division, level) => [
    division,
    Math.round(DIVISION_MULTIPLIER_BASE ** level * 100) / 100,
  ]),
);

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
    scale: LEGACY_SCALE,
  };
}

export function createStableLegacy(archivedPoints = 0): StableLegacy {
  return {
    archivedPoints: Math.max(0, archivedPoints),
    hallOfFame: [],
    scale: LEGACY_SCALE,
  };
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

  if (wins >= 50) points += 300;
  else if (wins >= 20) points += 150;
  else if (wins >= 10) points += 75;
  else if (wins >= 1) points += 15;

  points += Math.min(225, Math.floor(earnings / 6666));

  const divisionSeed: Record<string, number> = {
    maiden: 0,
    novice: 60,
    open: 150,
    stakes: 300,
    championship: 525,
  };
  points += divisionSeed[division] ?? 0;

  return points;
}

/* ---------------------------------------------------------------------------
   Rescaling saves written before the exponential curve
   ------------------------------------------------------------------------ */

/**
 * How much larger the same career scores on the current curve.
 *
 * Modelling six career shapes on both the old flat-ish ladder and the current
 * exponential one put the ratio between 1.26 and 1.76, averaging 1.53. A single
 * constant cannot be exact — a Maiden horse's points did not change at all,
 * while a Championship horse's more than doubled — but the alternative is a
 * player logging in to find their yard demoted, which is worse than approximate.
 * Rounding down to 1.5 keeps the error on the generous side of a tier boundary
 * for the mid-table careers that most saves actually hold.
 */
export const LEGACY_RESCALE = 1.5;

/**
 * The scale the numbers above are on. 1 was the original flat-ish ladder; 2 is
 * the exponential curve. Stamped on every legacy record so a save can be lifted
 * exactly once, however many times it is loaded.
 */
export const LEGACY_SCALE = 2;

const rescale = (points: number): number => Math.round(points * LEGACY_RESCALE);

/** Lift a horse's legacy onto the current scale. Mutates. Safe to call twice. */
export function rescaleHorseLegacy(legacy: HorseLegacy): HorseLegacy {
  if ((legacy.scale ?? 1) >= LEGACY_SCALE) return legacy;

  legacy.points = rescale(legacy.points);
  legacy.peak = rescale(legacy.peak);
  legacy.history = legacy.history.map(rescale);
  legacy.scale = LEGACY_SCALE;
  // An honour already awarded is never taken back, so this only ever adds.
  if (legacy.peak >= HALL_OF_FAME_THRESHOLD) legacy.hallOfFame = true;
  return legacy;
}

/** Lift a yard's banked prestige onto the current scale. Mutates. Safe to call twice. */
export function rescaleStableLegacy(legacy: StableLegacy): StableLegacy {
  if ((legacy.scale ?? 1) >= LEGACY_SCALE) return legacy;

  legacy.archivedPoints = rescale(legacy.archivedPoints);
  for (const entry of legacy.hallOfFame) {
    entry.legacyPoints = rescale(entry.legacyPoints);
  }
  legacy.scale = LEGACY_SCALE;
  return legacy;
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
