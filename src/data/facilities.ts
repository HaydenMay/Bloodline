/**
 * Stable facilities that players can upgrade with cash.
 * Each facility has 5 levels with increasing costs and benefits.
 */

export interface Facility {
  id: string;
  name: string;
  description: string;
  baseIcon: string;
  /** What one more level buys, written per-level so the card never lies. */
  benefit: string;
  /** The effect at a given level, shown on the card. Level 0 reads as unbuilt. */
  effectAt: (level: number) => string;
  baseCost: number;
}

export interface FacilityUpgradeCost {
  level: number;
  cost: number;
  description: string;
}

export const FACILITIES: Record<string, Facility> = {
  barn: {
    id: 'barn',
    name: 'Barn',
    description: 'Horse housing and comfort',
    baseIcon: '🏠',
    benefit: '+2% condition retention',
    effectAt: (l) => (l === 0 ? 'Not built' : `Absorbs ${l * 6}% of race-day condition loss`),
    baseCost: 5000,
  },
  training: {
    id: 'training',
    name: 'Training Grounds',
    description: 'Training facilities and equipment',
    baseIcon: '🏋️',
    benefit: '+1 stat point per training; maxed removes every session\'s downside',
    effectAt: (l) =>
      l === 0
        ? 'Not built'
        : l === 5
          ? `+${l * 10}% stat gain, and no downside from any session`
          : `+${l * 10}% stat gain from every session`,
    baseCost: 7500,
  },
  medical: {
    id: 'medical',
    name: 'Medical Wing',
    description: 'Veterinary care and recovery',
    baseIcon: '⚕️',
    benefit: '+5% injury recovery speed',
    effectAt: (l) => (l === 0 ? 'Not built' : `+${l * 3} condition recovered each week`),
    baseCost: 10000,
  },
  feed: {
    id: 'feed',
    name: 'Feed Storage',
    description: 'Premium feed and supplements',
    baseIcon: '🌾',
    benefit: '+3% morale gain',
    effectAt: (l) => (l === 0 ? 'Not built' : `+${l * 8}% morale from a good result`),
    baseCost: 6000,
  },
  stud: {
    id: 'stud',
    name: 'Stud Farm',
    description: 'Breeding preparation',
    baseIcon: '🐴',
    benefit: '+10% breeding potential',
    effectAt: (l) => (l === 0 ? 'Not built' : `+${l * 10}% breeding potential`),
    baseCost: 15000,
  },
  admin: {
    id: 'admin',
    name: 'Administration',
    description: 'Record keeping and logistics',
    baseIcon: '📋',
    benefit: '+5% prize money',
    effectAt: (l) => (l === 0 ? 'Not built' : `+${l * 5}% prize money`),
    baseCost: 8000,
  },
  paddock: {
    id: 'paddock',
    name: 'Paddock',
    description: 'Grazing and exercise space',
    baseIcon: '🌳',
    benefit: '+2 morale per week',
    effectAt: (l) => (l === 0 ? 'Not built' : `+${l * 2} morale each week`),
    baseCost: 5500,
  },
};

export function getUpgradeCost(baseCost: number, targetLevel: number): number {
  // Steep enough that a single good horse cannot buy the whole yard: each level
  // roughly doubles, so level 5 costs about 16x the first.
  const multiplier = Math.pow(2, targetLevel - 1);
  return Math.round(baseCost * multiplier);
}

/**
 * The highest facility level a stable of a given prestige tier may build.
 *
 * Cash alone should not buy the whole yard off one good horse: prestige is the
 * ceiling, money is the pace. A Novice yard can reach level 2 however rich it
 * gets, and only a Champion yard can max anything out.
 */
export const TIER_LEVEL_CAP = [2, 3, 4, 5, 5];

export function getLevelCapForTier(tier: number): number {
  const clamped = Math.max(0, Math.min(TIER_LEVEL_CAP.length - 1, tier));
  return TIER_LEVEL_CAP[clamped]!;
}

export interface FacilityUpgradeCheck {
  atMax: boolean;
  /** Blocked by the prestige ceiling rather than the facility's own maximum. */
  tierLocked: boolean;
  nextLevel: number;
  cost: number;
  canAfford: boolean;
  canUpgrade: boolean;
}

export function checkFacilityUpgrade(
  facility: Facility,
  currentLevel: number,
  cash: number,
  tier: number,
): FacilityUpgradeCheck {
  const nextLevel = currentLevel + 1;
  const atMax = currentLevel >= 5;
  const cap = getLevelCapForTier(tier);
  const tierLocked = !atMax && nextLevel > cap;
  const cost = atMax ? 0 : getUpgradeCost(facility.baseCost, nextLevel);
  const canAfford = cash >= cost;

  return {
    atMax,
    tierLocked,
    nextLevel,
    cost,
    canAfford,
    canUpgrade: !atMax && !tierLocked && canAfford,
  };
}

/**
 * Total spent to take a facility from nothing to `level`, for the UI.
 */
export function getTotalInvested(baseCost: number, level: number): number {
  let total = 0;
  for (let l = 1; l <= level; l++) total += getUpgradeCost(baseCost, l);
  return total;
}

/* ---------------------------------------------------------------------------
   Facility effects
   ---------------------------------------------------------------------------
   Each facility returns a plain multiplier or flat bonus that the relevant
   system applies. Keeping them here means the numbers the cards advertise and
   the numbers the game uses are the same numbers.
   ------------------------------------------------------------------------ */

const lvl = (facilities: Record<string, number>, id: string): number =>
  Math.max(0, Math.min(5, facilities[id] ?? 0));

/** Training Grounds: multiplies the stat gain from every session. */
export function getTrainingMultiplier(facilities: Record<string, number>): number {
  return 1 + lvl(facilities, 'training') * 0.1;
}

/**
 * Training Grounds: whether a trade-off session's downside is removed.
 *
 * A hard cliff at level 5, not a ramp. A gradual version was tried first —
 * relief scaling linearly with level — and it read as broken rather than
 * generous: `applyTrainedStat` rounds a scaled downside to the nearest whole
 * point, and every downside in the roster is -1 or -2, so 80% relief (level
 * 4) turned a -1 into -0.2, which rounds to zero, and a -2 into -0.4, also
 * zero. Every session was already losing its cost two levels before the
 * facility was actually maxed, just inconsistently — a -1 vanished at level
 * 3, a -2 not until level 4 — which read as random rather than deserved.
 * Found in play: "the downsides are only 1 or 2 points, 80% of 1 is 0, so I'm
 * getting zeros all over the place. It should only be for the fully upgraded
 * training area."
 *
 * A full Training Grounds trains with no downside at all — the answer to
 * "facilities cost a lot for very little" (ongoing-decisions.md) stands
 * regardless: the top level removes a whole category of risk, not a few
 * percent. It is just an unlock now, earned in full at level 5, rather than
 * a curve that was never actually smooth.
 */
export function getDownsideRelief(facilities: Record<string, number>): number {
  return lvl(facilities, 'training') >= 5 ? 1 : 0;
}

/** Administration: multiplies prize money. */
export function getPrizeMultiplier(facilities: Record<string, number>): number {
  return 1 + lvl(facilities, 'admin') * 0.05;
}

/** Barn: how much of a race's condition loss is absorbed. */
export function getConditionRetention(facilities: Record<string, number>): number {
  return lvl(facilities, 'barn') * 0.06;
}

/** Medical Wing: condition recovered each week. */
export function getWeeklyConditionRecovery(facilities: Record<string, number>): number {
  return lvl(facilities, 'medical') * 3;
}

/** Feed Storage: multiplies morale gained from a good result. */
export function getMoraleMultiplier(facilities: Record<string, number>): number {
  return 1 + lvl(facilities, 'feed') * 0.08;
}

/** Paddock: morale restored each week regardless of results. */
export function getWeeklyMoraleRecovery(facilities: Record<string, number>): number {
  return lvl(facilities, 'paddock') * 2;
}

/** Stud Farm: breeding potential, banked for Phase 5. */
export function getBreedingBonus(facilities: Record<string, number>): number {
  return lvl(facilities, 'stud') * 0.1;
}

export function getFacilityDescription(facilityId: string, level: number): string {
  const facility = FACILITIES[facilityId];
  if (!facility) return '';
  return `${facility.name} - Level ${level}/5`;
}
