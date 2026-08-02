import type { Division, DistanceBand, RunningStyle } from '../data/index.js';
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

/** Aptitude per distance band, 0-100. Expressed to the player as a grade. */
export type Aptitudes = Record<DistanceBand, number>;

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

  style: RunningStyle;
  aptitudes: Aptitudes;
  traits: TraitId[];

  /** 0-100. Scales race performance; managed through training and rest. */
  condition: number;
  /** 0-100. Sustained by wins AND placings. */
  morale: number;

  division: Division;
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
