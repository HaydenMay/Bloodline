import type { Horse } from './types.js';
import type { Rng } from './rng.js';
import { getCareerStage } from './growth.js';

/**
 * Injuries.
 *
 * DESIGN.md §6: setbacks, rarely career-ending. Most cost a few weeks; a true
 * career-ender is rare and heavily reduced by the Medical Wing. When one does
 * occur it forces retirement but grants **full breeding value plus a Legacy
 * marker** — "you didn't lose the horse, you lost the racing career and gained
 * a legacy". That inversion is the point: the worst moment in a run becomes the
 * strongest hook into the next one.
 *
 * §6 was marked complete in both the design doc and the Phase 3 delivered-list.
 * It had never been written — the word "injury" appeared only in a trait
 * description and a facility label.
 */

export type InjurySeverity = 'niggle' | 'strain' | 'serious' | 'careerEnding';

export interface Injury {
  severity: InjurySeverity;
  name: string;
  /** Races the horse must sit out. Zero for a career-ender — it never runs again. */
  weeksOut: number;
  /** Condition lost immediately. */
  conditionCost: number;
  description: string;
}

const INJURY_TYPES: Record<InjurySeverity, Omit<Injury, 'severity'>> = {
  niggle: {
    name: 'Minor Niggle',
    weeksOut: 1,
    conditionCost: 10,
    description: 'Sore after its exertions. A week easy and it will be fine.',
  },
  strain: {
    name: 'Muscle Strain',
    weeksOut: 2,
    conditionCost: 20,
    description: 'A pulled muscle. Two weeks off, then back to work.',
  },
  serious: {
    name: 'Tendon Injury',
    weeksOut: 4,
    conditionCost: 35,
    description: 'A tendon has gone. A long lay-off, but it will race again.',
  },
  careerEnding: {
    name: 'Career-Ending Injury',
    weeksOut: 0,
    conditionCost: 0,
    description: 'This one ends its racing days. It walks away sound enough for stud.',
  },
};

/** Base chance of any injury per race, before modifiers. */
const BASE_INJURY_CHANCE = 0.07;

/**
 * How much the Medical Wing reduces injury risk. §6 says a career-ender is
 * "heavily reduced by your Veterinary Wing", so the wing cuts the rate and
 * shifts severity downward.
 */
function medicalProtection(facilities: Record<string, number>): number {
  const level = Math.max(0, Math.min(5, facilities.medical ?? 0));
  return level * 0.12; // up to 60% fewer injuries at a maxed wing
}

/**
 * Risk rises as a horse tires and as it ages past its peak. A fresh
 * four-year-old is far safer than a jaded five-year-old.
 */
export function getInjuryChance(
  horse: Horse,
  facilities: Record<string, number>,
): number {
  let chance = BASE_INJURY_CHANCE;

  // A tired horse breaks down. This is the main reason to manage condition.
  if (horse.condition < 30) chance *= 2.2;
  else if (horse.condition < 50) chance *= 1.5;
  else if (horse.condition > 85) chance *= 0.7;

  // §8: injury risk climbs in decline.
  if (getCareerStage(horse.age) === 'declining') chance *= 1.6;

  // The Iron Horse trait is explicitly "very low injury risk".
  if (horse.traits?.includes('ironHorse')) chance *= 0.4;

  return Math.max(0, chance * (1 - medicalProtection(facilities)));
}

/**
 * Rolls for an injury after a race. Returns null when the horse comes home
 * sound, which is the overwhelmingly common case.
 */
export function rollForInjury(
  horse: Horse,
  facilities: Record<string, number>,
  rng: Rng,
): Injury | null {
  if (!rng.chance(getInjuryChance(horse, facilities))) return null;

  // Severity, given that something has gone wrong. Career-enders are a small
  // slice of an already small number, and the wing shrinks them further.
  const roll = rng.next();
  const enderCutoff = 0.04 * (1 - medicalProtection(facilities));

  let severity: InjurySeverity;
  if (roll < enderCutoff) severity = 'careerEnding';
  else if (roll < 0.2) severity = 'serious';
  else if (roll < 0.55) severity = 'strain';
  else severity = 'niggle';

  return { severity, ...INJURY_TYPES[severity] };
}

/** Applies an injury's immediate cost. Mutates the horse. */
export function applyInjury(horse: Horse, injury: Injury): void {
  horse.condition = Math.max(0, horse.condition - injury.conditionCost);
  // Being hurt is dispiriting, but §7's anti-spiral rule means it is a dent
  // rather than a collapse.
  horse.morale = Math.max(0, horse.morale - injury.weeksOut * 3);
}

export function isCareerEnding(injury: Injury | null): boolean {
  return injury?.severity === 'careerEnding';
}
