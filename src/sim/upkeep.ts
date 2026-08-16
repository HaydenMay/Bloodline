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
 * DESIGN.md §8 has condition "managed through training and rest" and morale
 * "sustained by wins AND placings", but nothing moved either — both were fixed
 * at creation and fed to the race engine unchanged for a whole career. Making
 * them move is also what gives the Barn, Medical Wing, Feed Store and Paddock
 * something to act on.
 *
 * Recovery **regresses toward a ceiling** rather than adding a flat amount.
 * A flat add has only two outcomes: smaller than the race cost and the horse
 * spirals to zero, or larger and it pins at 100 forever. Both were tried and
 * both are wrong — the first made a career unfinishable for a new yard, the
 * second made condition a non-decision the moment one facility was built.
 *
 * Regression instead settles at an equilibrium the yard determines:
 *
 *     equilibrium = ceiling - raceCost / rate
 *
 * A bare yard settles around the mid-30s — raceable, clearly suboptimal, and
 * never zero. A maxed yard settles in the low 80s — strong, but still short of
 * perfect, so peaking a horse for the right race stays a real skill.
 */

/** What one race takes out of a horse, before the Barn absorbs its share. */
const RACE_CONDITION_COST = 9;

/** Condition a bare yard can rest a horse back toward. */
const BASE_CONDITION_CEILING = 70;
/** Each Medical Wing level lifts that ceiling. */
const CONDITION_CEILING_PER_LEVEL = 6;

/** Share of the gap to the ceiling recovered each week in a bare yard. */
const BASE_RECOVERY_RATE = 0.25;

/** Morale a horse drifts toward when results are unremarkable. */
const BASE_MORALE_CEILING = 55;
const MORALE_RECOVERY_RATE = 0.2;

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

/** Morale swing by finishing position, before the Feed Store scales a gain. */
function moraleChangeFor(finishingPosition: number, fieldSize: number): number {
  if (finishingPosition === 1) return 12;
  if (finishingPosition === 2) return 7;
  if (finishingPosition === 3) return 4;
  // Anything in the front two thirds is a shrug; only being genuinely tailed
  // off dents a horse. The old threshold was ceil(fieldSize / 2), which made
  // 5th of 8 — an ordinary mid-pack run — cost the same as finishing last.
  if (finishingPosition <= Math.ceil((fieldSize * 2) / 3)) return 0;
  return -4;
}

/** The condition a yard can rest a horse back up to. */
export function getConditionCeiling(facilities: Record<string, number>): number {
  return Math.min(
    100,
    BASE_CONDITION_CEILING + getWeeklyConditionRecovery(facilities) * (CONDITION_CEILING_PER_LEVEL / 3),
  );
}

/** How much of the gap to that ceiling is closed each week. */
function getRecoveryRate(facilities: Record<string, number>): number {
  // getWeeklyConditionRecovery is 3 per Medical level, so this reaches 0.5 at
  // a maxed wing.
  return BASE_RECOVERY_RATE + (getWeeklyConditionRecovery(facilities) / 3) * 0.05;
}

/**
 * Where condition settles under repeated racing — useful for tuning and UI.
 *
 * Solves the post-recovery fixed point, which is the value a player actually
 * sees between races: c = (c - cost) + (ceiling - (c - cost)) * rate.
 */
export function getConditionEquilibrium(facilities: Record<string, number>): number {
  const cost = RACE_CONDITION_COST * (1 - getConditionRetention(facilities));
  const rate = getRecoveryRate(facilities);
  return clamp(getConditionCeiling(facilities) - (cost * (1 - rate)) / rate);
}

export interface UpkeepChange {
  condition: number;
  morale: number;
}

/**
 * Applies the cost of a race and the following week's recovery, and returns the
 * net change so the UI can report it. Mutates the horse.
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
  const spent = clamp(horse.condition - cost);
  horse.condition = restToward(spent, getConditionCeiling(facilities), getRecoveryRate(facilities));

  const swing = moraleChangeFor(finishingPosition, fieldSize);
  // Premium feed makes a good result count for more; it cannot soften a bad one.
  const scaled = swing > 0 ? swing * getMoraleMultiplier(facilities) : swing;
  horse.morale = restToward(
    clamp(horse.morale + scaled),
    moraleCeiling(facilities),
    MORALE_RECOVERY_RATE,
  );

  return {
    condition: Math.round(horse.condition - conditionBefore),
    morale: Math.round(horse.morale - moraleBefore),
  };
}

/** Rest without a race — a training week, or a week skipped entirely. */
export function applyRestWeek(horse: Horse, facilities: Record<string, number>): UpkeepChange {
  const conditionBefore = horse.condition;
  const moraleBefore = horse.morale;

  horse.condition = restToward(
    horse.condition,
    getConditionCeiling(facilities),
    getRecoveryRate(facilities),
  );
  horse.morale = restToward(horse.morale, moraleCeiling(facilities), MORALE_RECOVERY_RATE);

  return {
    condition: Math.round(horse.condition - conditionBefore),
    morale: Math.round(horse.morale - moraleBefore),
  };
}

function moraleCeiling(facilities: Record<string, number>): number {
  return Math.min(100, BASE_MORALE_CEILING + getWeeklyMoraleRecovery(facilities) * 3);
}

/**
 * Moves a value a share of the way toward a ceiling. Only ever recovers — a
 * horse already above the ceiling holds what its results earned it rather than
 * being dragged back down by the yard being modest.
 */
function restToward(current: number, ceiling: number, rate: number): number {
  if (current >= ceiling) return clamp(current);
  return clamp(current + (ceiling - current) * rate);
}

/* ---------------------------------------------------------------------------
   Form
   ------------------------------------------------------------------------ */

/**
 * The visible form state DESIGN.md §5 asks for.
 *
 * Condition is a 0-100 number the player should rarely have to read. Form is
 * the reading of it — the thing a trainer would actually say — and it is what
 * makes peaking a horse for the right race legible rather than arithmetic.
 */
export type FormState = 'peak' | 'inForm' | 'steady' | 'offForm' | 'jaded';

export interface FormDescriptor {
  state: FormState;
  label: string;
  /** One line on what it means for race day. */
  note: string;
}

const FORM_BANDS: Array<{ min: number; descriptor: FormDescriptor }> = [
  { min: 90, descriptor: { state: 'peak', label: 'Peak', note: 'Could not be better in itself.' } },
  { min: 72, descriptor: { state: 'inForm', label: 'In Form', note: 'Working well and ready to run.' } },
  { min: 50, descriptor: { state: 'steady', label: 'Steady', note: 'Fit enough, without sparkling.' } },
  { min: 28, descriptor: { state: 'offForm', label: 'Off Form', note: 'Below its best — a let-up would help.' } },
  { min: 0, descriptor: { state: 'jaded', label: 'Jaded', note: 'Thoroughly over-raced. Needs a break.' } },
];

export function getForm(condition: number): FormDescriptor {
  for (const band of FORM_BANDS) {
    if (condition >= band.min) return band.descriptor;
  }
  return FORM_BANDS[FORM_BANDS.length - 1]!.descriptor;
}

/** Morale read the same way, since the two are shown side by side. */
export function getSpirit(morale: number): string {
  if (morale >= 80) return 'Buzzing';
  if (morale >= 60) return 'Happy';
  if (morale >= 40) return 'Settled';
  if (morale >= 20) return 'Sulking';
  return 'Miserable';
}
