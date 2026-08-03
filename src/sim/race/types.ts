import type { Horse } from '../types.js';
import type { DistanceBand } from '../../data/index.js';

export type Going = 'firm' | 'good' | 'soft' | 'heavy';

export interface RaceConfig {
  furlongs: number;
  going: Going;
  hype: number;
  seed: string;
}

export interface RaceEntrant {
  horse: Horse;
  controller?: unknown;
}

export interface RaceEvent {
  at: number;
  kind: string;
  horseId: string;
  detail?: string;
}

export interface RaceResult {
  horseId: string;
  name: string;
  finishPosition: number;
  time: number;
  margin: number;
  kicksLeft: number;
  sectionals: number[];
  hadTrouble: boolean;
  fumbledStart: boolean;
  offColour: boolean;
}

export interface RaceOutcome {
  results: RaceResult[];
  events: RaceEvent[];
  paceRating: number;
  duration: number;
}

// Stubs for UI layer — simulation not yet rebuilt
export interface ControlInput {
  effort: number;
  holding: boolean;
  kick: boolean;
  targetLane: number;
}

export interface RunnerView {
  id: string;
  name: string;
  distance: number;
  speed: number;
  lane: number;
  fieldPosition: number;
  rank: number;
  blocked: boolean;
  drafting: boolean;
  kicksRemaining: number;
  offColour: boolean;
}

export interface RaceView {
  progress: number;
  elapsed: number;
  totalYards: number;
  fieldSize: number;
  leaderDistance: number;
  pacePressure: number;
}

/** Which aptitude band a distance falls into. */
export function bandFor(furlongs: number): DistanceBand {
  if (furlongs <= 7) return 'sprint';
  if (furlongs <= 9) return 'mile';
  return 'route';
}
