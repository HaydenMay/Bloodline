/**
 * Race simulation engine.
 *
 * CURRENTLY STUBBED — simulation logic removed for redesign.
 * Functions exist to prevent import breaks but do not simulate races.
 */

import type { RaceEntrant, RaceOutcome, RaceConfig } from './types.js';

export interface RaceSnapshot {
  elapsed: number;
  progress: number;
  leaderDistance: number;
  runners: RunnerSnapshot[];
  fresh: unknown[];
}

export interface RunnerSnapshot {
  id: string;
  name: string;
  distance: number;
  speed: number;
  lane: number;
  rank: number;
  effort: number;
  kicking: boolean;
  kicksRemaining: number;
  chargeProgress: number;
  regenMult: number;
  blocked: boolean;
  drafting: boolean;
  offColour: boolean;
  finished: boolean;
  finishTime: number | null;
  coat: string;
}

export interface LiveRace {
  step(): boolean;
  snapshot(): RaceSnapshot;
  outcome(): RaceOutcome;
  readonly totalYards: number;
  readonly config: RaceConfig;
}

export function createRace(_entrants: RaceEntrant[], _config: RaceConfig): LiveRace {
  throw new Error('Race simulation not implemented — under redesign');
}

export function simulateRace(_entrants: RaceEntrant[], _config: RaceConfig): RaceOutcome {
  throw new Error('Race simulation not implemented — under redesign');
}
