import type { Horse } from './types.js';
import {
  getConditionRetention,
  getMoraleMultiplier,
  getWeeklyConditionRecovery,
  getWeeklyMoraleRecovery,
} from '../data/facilities.js';

/**
 * Condition and morale between races.
 *
 * DESIGN.md 8 has condition "managed through training and rest" and morale
 * "sustained by wins AND placings", but nothing moved either — both were fixed
 * at creation and fed to the race engine unchanged for a whole career. Making
 * them move is also what gives the Barn, Medical Wing, Feed Store and Paddock
 * something to act on.
 */

/** A hard race takes this much out of a horse before the Barn softens it. */
const RACE_CONDITION_COST = 12;

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

/** Morale swing by finishing position, before the Feed Store scales a gain. */
function moraleChangeFor(finishingPosition: number, fieldSize: number): number {
  if (finishingPosition === 1) return 12;
  if (finishingPosition === 2) return 7;
  if (finishingPosition === 3) return 4;
  // Mid-pack is a shrug; being tailed off is what dents a horse's confidence.
  if (finishingPosition <= Math.ceil(fieldSize / 2)) return 0;
  return -5;
}

export interface UpkeepChange {
  condition: number;
  morale: number;
}

/**
 * Applies the cost of a race and the week's recovery in one step, and returns
 * the net change so the UI can report it. Mutates the horse.
 */
export function applyRaceUpkeep(
  horse: Horse,
  finishingPosition: number,
  fieldSize: number,
  facilities: Record<string, number>,
): UpkeepChange {
  const conditionBefore = horse.condition;
  const moraleBefore = horse.morale;

  // The race takes its toll, less whatever the Barn absorbs.
  const cost = RACE_CONDITION_COST * (1 - getConditionRetention(facilities));
  // The Medical Wing and Paddock work on the horse over the following week.
  const recovery = getWeeklyConditionRecovery(facilities);
  horse.condition = clamp(horse.condition - cost + recovery);

  const swing = moraleChangeFor(finishingPosition, fieldSize);
  // Premium feed makes a good result count for more; it cannot soften a bad one.
  const scaled = swing > 0 ? swing * getMoraleMultiplier(facilities) : swing;
  horse.morale = clamp(horse.morale + scaled + getWeeklyMoraleRecovery(facilities));

  return {
    condition: Math.round(horse.condition - conditionBefore),
    morale: Math.round(horse.morale - moraleBefore),
  };
}

/** Rest without a race — a training week, or a week skipped entirely. */
export function applyRestWeek(horse: Horse, facilities: Record<string, number>): UpkeepChange {
  const conditionBefore = horse.condition;
  const moraleBefore = horse.morale;

  horse.condition = clamp(horse.condition + getWeeklyConditionRecovery(facilities));
  horse.morale = clamp(horse.morale + getWeeklyMoraleRecovery(facilities));

  return {
    condition: Math.round(horse.condition - conditionBefore),
    morale: Math.round(horse.morale - moraleBefore),
  };
}
