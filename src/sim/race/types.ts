import type { Horse } from '../types.js';

export type Going = 'firm' | 'good' | 'soft' | 'heavy';

export interface RaceConfig {
  /**
   * Race distance in METRES. The whole simulation and the render layer both
   * work in metres and seconds — there is no conversion boundary anywhere,
   * because a conversion boundary is a permanent source of bugs.
   */
  metres: number;
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
  /** Behind the winner, in lengths. */
  margin: number;
  /** Charge dots left at the wire — banked but unspent. */
  kicksLeft: number;
  sectionals: number[];
  /** Always false in v1: there is no blocking (REBUILD.md §9). */
  hadTrouble: boolean;
  fumbledStart: boolean;
  offColour: boolean;
}

export interface RaceOutcome {
  results: RaceResult[];
  events: RaceEvent[];
  /**
   * Late sectional over early sectional. Above 1 means the race SLOWED — the
   * leaders went off too fast and emptied, which is the collapse an upset comes
   * out of. `recap.ts`'s `paceOf()` reads it this way; do not change the sense.
   */
  paceRating: number;
  duration: number;
}

/** What the player's input can say. Everything else is the shared base ride. */
export interface PlayerInput {
  /** Hold to take a pull — settle below the pace curve, bank tank faster. */
  takingBack: boolean;
  /** Set by a tap; consumed the next tick the rider reads it. */
  kickPending: boolean;
}

/** Race-wide state a rider can see. */
export interface RaceView {
  /** The LEADER's progress, 0-1. Riders use their OWN progress for timing. */
  progress: number;
  elapsed: number;
  totalMetres: number;
  fieldSize: number;
  leaderDistance: number;
}
