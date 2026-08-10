import type { Horse } from './types.js';
import type { Division } from '../data/index.js';

/**
 * Division point calculation based on race finishing position.
 *
 * - 1st Place (Win): +3 points
 * - 2nd-3rd Place (Top 3): +1 point
 * - 4th-6th Place (Mid-field): 0 points (no change)
 * - 7th-8th Place (Outer): -1 point
 */
export function calculateDivisionPoints(finishingPosition: number): number {
  if (finishingPosition === 1) return 3;
  if (finishingPosition === 2 || finishingPosition === 3) return 1;
  if (finishingPosition >= 4 && finishingPosition <= 6) return 0;
  if (finishingPosition >= 7 && finishingPosition <= 8) return -1;
  return 0;
}

export interface DivisionProgressionResult {
  promoted: boolean;
  demoted: boolean;
  pointsEarned: number;
  newDivisionLevel: number;
}

/**
 * Updates horse division points after a race and checks for promotion/demotion.
 *
 * Promotion (reaching +5 points):
 * - Trigger promotion race with horses from NEXT division
 * - If finish 1st-4th in promotion: PROMOTE, reset to 0
 * - If finish 5th-8th in promotion: STAY, reset to 2
 *
 * Demotion (reaching -3 points):
 * - Trigger demotion warning and race with horses from DIVISION BELOW
 * - If finish 1st-4th in demotion: STAY, reset to 0
 * - If finish 5th-8th in demotion: DEMOTE, reset to 0
 *
 * Edge cases:
 * - Cannot promote above Championship (division 4)
 * - Cannot demote below Maiden (division 0)
 */
export function updateDivisionProgression(
  horse: Horse,
  finishingPosition: number,
): DivisionProgressionResult {
  const pointsEarned = calculateDivisionPoints(finishingPosition);
  horse.divisionPoints += pointsEarned;

  let promoted = false;
  let demoted = false;

  // Check for promotion threshold (+5 points)
  if (horse.divisionPoints >= 5) {
    // Can only promote if not already at Championship
    if (horse.divisionLevel < 4) {
      // Trigger promotion race - but for now just track that promotion is ready
      // The UI will handle showing the promotion race
      // If player finishes 1st-4th, promotion happens
      // If player finishes 5th-8th, reset to 2 points
      // These checks happen in a subsequent promotion race
    } else {
      // At Championship - cap points at 5, don't go higher
      horse.divisionPoints = 5;
    }
  }

  // Check for demotion threshold (-3 points)
  if (horse.divisionPoints <= -3) {
    // Can only demote if not already at Maiden
    if (horse.divisionLevel > 0) {
      // Trigger demotion warning and race
      // Similar to promotion, handled by UI
    } else {
      // At Maiden - cap points at -3, don't go lower
      horse.divisionPoints = -3;
    }
  }

  return {
    promoted,
    demoted,
    pointsEarned,
    newDivisionLevel: horse.divisionLevel,
  };
}

/**
 * Finalizes promotion after player finishes promotion race.
 * Call this when a promotion race concludes.
 */
export function finalizePromotion(horse: Horse, finishingPosition: number): void {
  // 1st-4th: Promote
  if (finishingPosition >= 1 && finishingPosition <= 4) {
    if (horse.divisionLevel < 4) {
      horse.divisionLevel += 1;
      horse.divisionPoints = 0;
    }
  }
  // 5th-8th: Stay, reset to 2
  else if (finishingPosition >= 5 && finishingPosition <= 8) {
    horse.divisionPoints = 2;
  }
}

/**
 * Finalizes demotion after player finishes demotion race.
 * Call this when a demotion race concludes.
 */
export function finalizeDemotion(horse: Horse, finishingPosition: number): void {
  // 1st-4th: Stay in division, reset to 0
  if (finishingPosition >= 1 && finishingPosition <= 4) {
    horse.divisionPoints = 0;
  }
  // 5th-8th: Demote
  else if (finishingPosition >= 5 && finishingPosition <= 8) {
    if (horse.divisionLevel > 0) {
      horse.divisionLevel -= 1;
    }
    horse.divisionPoints = 0;
  }
}

/**
 * Update AI horse division points after they finish a race.
 * This is called for all AI horses in the field, not just the player.
 */
export function updateAIDivisionProgression(
  horse: Horse,
  finishingPosition: number,
): void {
  const pointsEarned = calculateDivisionPoints(finishingPosition);
  horse.divisionPoints += pointsEarned;

  // Check for AI promotion
  if (horse.divisionPoints >= 5 && horse.divisionLevel < 4) {
    horse.divisionLevel += 1;
    horse.divisionPoints = 0;
  }

  // Check for AI demotion
  if (horse.divisionPoints <= -3 && horse.divisionLevel > 0) {
    horse.divisionLevel -= 1;
    horse.divisionPoints = 0;
  }

  // Cap at boundaries
  if (horse.divisionLevel >= 4) {
    horse.divisionPoints = Math.min(horse.divisionPoints, 5);
  }
  if (horse.divisionLevel <= 0) {
    horse.divisionPoints = Math.max(horse.divisionPoints, -3);
  }
}

const DIVISIONS_BY_LEVEL = ['maiden', 'novice', 'open', 'stakes', 'championship'] as const;

function getLevelFromDivision(division: Division): number {
  return DIVISIONS_BY_LEVEL.indexOf(division as any);
}

function getDivisionFromLevel(level: number): Division {
  return DIVISIONS_BY_LEVEL[Math.max(0, Math.min(4, level))] as Division;
}

/**
 * Populates the opponent field for a promotion race.
 * Player is trying to advance to the NEXT division.
 *
 * Field composition (in order of priority):
 * 1. Other horses from current division at +5 points (promotion candidates)
 * 2. Horses from next division at -3 points (at risk of demotion)
 * 3. Any remaining horses from next division
 * 4. Other horses from current division as fallback
 */
export function populatePromotionRaceField(
  playerDivision: Division,
  worldHorses: Horse[],
  fieldSize: number = 8,
): Horse[] {
  const currentLevel = getLevelFromDivision(playerDivision);
  const nextLevel = Math.min(4, currentLevel + 1);
  const currentDiv = getDivisionFromLevel(currentLevel);
  const nextDiv = getDivisionFromLevel(nextLevel);

  const field: Horse[] = [];

  // 1. Add horses from current division at +5 points (other promotion candidates)
  const promotionCandidates = worldHorses.filter(
    (h) => h.division === currentDiv && h.divisionPoints >= 5,
  );
  field.push(...promotionCandidates.slice(0, fieldSize - field.length));

  // 2. Add horses from next division at -3 points (demotion risk)
  if (field.length < fieldSize) {
    const demotionRisk = worldHorses.filter(
      (h) => h.division === nextDiv && h.divisionPoints <= -3,
    );
    field.push(...demotionRisk.slice(0, fieldSize - field.length));
  }

  // 3. Add any remaining horses from next division
  if (field.length < fieldSize) {
    const otherNext = worldHorses.filter(
      (h) =>
        h.division === nextDiv &&
        h.divisionPoints > -3 &&
        !field.some((f) => f.id === h.id),
    );
    field.push(...otherNext.slice(0, fieldSize - field.length));
  }

  // 4. Add other horses from current division as fallback
  if (field.length < fieldSize) {
    const fallback = worldHorses.filter(
      (h) =>
        h.division === currentDiv &&
        h.divisionPoints < 5 &&
        !field.some((f) => f.id === h.id),
    );
    field.push(...fallback.slice(0, fieldSize - field.length));
  }

  return field.slice(0, fieldSize);
}

/**
 * Populates the opponent field for a demotion race.
 * Player is trying to avoid demotion to the PREVIOUS division.
 *
 * Field composition (in order of priority):
 * 1. Other horses from current division at -3 points (also at demotion risk)
 * 2. Horses from previous division at +5 points (promotion candidates from lower tier)
 * 3. Other horses from current division (non-risky horses)
 * 4. Any horses from previous division as fallback
 */
export function populateDemotionRaceField(
  playerDivision: Division,
  worldHorses: Horse[],
  fieldSize: number = 8,
): Horse[] {
  const currentLevel = getLevelFromDivision(playerDivision);
  const prevLevel = Math.max(0, currentLevel - 1);
  const currentDiv = getDivisionFromLevel(currentLevel);
  const prevDiv = getDivisionFromLevel(prevLevel);

  const field: Horse[] = [];

  // 1. Add horses from current division at -3 points (other demotion risk)
  const demotionRisk = worldHorses.filter(
    (h) => h.division === currentDiv && h.divisionPoints <= -3,
  );
  field.push(...demotionRisk.slice(0, fieldSize - field.length));

  // 2. Add horses from previous division at +5 points (hungry promotion candidates)
  if (field.length < fieldSize) {
    const promotionHungry = worldHorses.filter(
      (h) => h.division === prevDiv && h.divisionPoints >= 5,
    );
    field.push(...promotionHungry.slice(0, fieldSize - field.length));
  }

  // 3. Add other horses from current division (non-risky stable-mates)
  if (field.length < fieldSize) {
    const stablemates = worldHorses.filter(
      (h) =>
        h.division === currentDiv &&
        h.divisionPoints > -3 &&
        !field.some((f) => f.id === h.id),
    );
    field.push(...stablemates.slice(0, fieldSize - field.length));
  }

  // 4. Add any other horses from previous division
  if (field.length < fieldSize) {
    const fallback = worldHorses.filter(
      (h) =>
        h.division === prevDiv &&
        !field.some((f) => f.id === h.id),
    );
    field.push(...fallback.slice(0, fieldSize - field.length));
  }

  return field.slice(0, fieldSize);
}
