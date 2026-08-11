import type { Division, Moment, RunningStyle } from '../data/index.js';
import type { TraitId } from '../data/traits.js';

/**
 * The six stats (DESIGN.md §2). All 0-100.
 *
 * Speed / stamina / burst are the racing engine.
 * Grit / temper / consistency do most of their work outside the race itself.
 */
export interface Stats {
  /** Top-end velocity ceiling. */
  speed: number;
  /** How quickly kick charges regenerate between efforts. */
  stamina: number;
  /** Acceleration — gate break, and how fast a drive takes effect. */
  burst: number;
  /** Kick strength, and fighting through traffic. Drives Resolve. */
  grit: number;
  /** Reaction to external pressure, trainability, and the AMPLITUDE of form swings. */
  temper: number;
  /** Delivering true ability on the day. Owns in-race variance. */
  consistency: number;
}

export type StatKey = keyof Stats;

export const STAT_KEYS: readonly StatKey[] = [
  'speed',
  'stamina',
  'burst',
  'grit',
  'temper',
  'consistency',
] as const;

/** Letter grades, shown in UI; tap reveals the number (DESIGN.md §3). */
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export function toGrade(value: number): Grade {
  if (value >= 90) return 'S';
  if (value >= 75) return 'A';
  if (value >= 58) return 'B';
  if (value >= 40) return 'C';
  return 'D';
}

/**
 * The distances a horse actually wants, in metres.
 *
 * Replaces the three-band aptitude grid (REBUILD.md §7). A range reads plainly
 * to the player — "Preferred Length 600-800 m" — where a letter grade per band
 * needed explaining, and it is continuous, so there is no cliff at a boundary
 * that a horse is arbitrarily on the wrong side of.
 *
 * The WIDTH is a real quality, and a trade rather than a tier: a narrow range
 * is a specialist that peaks higher and falls off hard, a wide one handles
 * anything without ever being sharp. See `distanceFactor` in race/aptitude.ts.
 */
export interface DistancePreference {
  /** Metres. Lower bound of the sweet spot. */
  min: number;
  /** Metres. Upper bound of the sweet spot. */
  max: number;
}

export type Gender = 'stallion' | 'mare';

export interface Horse {
  id: string;
  name: string;
  gender: Gender;
  /** Racing age in years. Horses run 2-5 (DESIGN.md §8). */
  age: number;

  stats: Stats;
  /** Hidden ceilings. Training cannot exceed these. */
  potential: Stats;

  /** WHERE it sits in the pack. */
  style: RunningStyle;
  /** WHEN it spends. Style and Moment together pick a pace curve (REBUILD.md §6). */
  moment: Moment;
  /** The distances it wants, in metres. */
  preferredDistance: DistancePreference;
  traits: TraitId[];

  /** 0-100. Scales race performance; managed through training and rest. */
  condition: number;
  /** 0-100. Sustained by wins AND placings. */
  morale: number;

  division: Division;
  /** Division level (0=Maiden, 1=Novice, 2=Open, 3=Stakes, 4=Championship) */
  divisionLevel: number;
  /** Points accumulated toward promotion/demotion in current division */
  divisionPoints: number;
  /** Won championship division race (triggers victory scene once) */
  isChampion?: boolean;
  /** Base stats for AI horses. For player, use regular stats field. */
  baseStats?: Stats;

  /** Career starts. Consistency climbs with these, not only training. */
  starts: number;
  wins: number;
  places: number;
  shows: number;

  /** Colour genetics live here from Phase 5; visual only. */
  coat: string;
  /** 0-100 jockey skill for AI horses; the player's jockey is stable-wide. */
  jockeySkill: number;
}
