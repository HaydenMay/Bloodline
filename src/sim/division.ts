import type { Horse, Division } from './types.js';

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
