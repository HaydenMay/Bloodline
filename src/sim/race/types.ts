import type { Horse } from '../types.js';
import type { DistanceBand } from '../../data/index.js';

export type Going = 'firm' | 'good' | 'soft' | 'heavy';

export interface RaceConfig {
  /** Race distance in furlongs. */
  furlongs: number;
  going: Going;
  /** 0-1, drives crowd size and Big Game / Stage Fright. */
  hype: number;
  seed: string;
}

/** Which effort the controller wants this tick. Player input or AI. */
export interface ControlInput {
  /**
   * 0-1, mostly a fixed CRUISE value (top speed). Only drops below that
   * while `holding` (see below) — there is no continuous position-correction
   * dial anymore, so this is close to binary in practice: cruise or hold.
   */
  effort: number;
  /**
   * Deliberately pulling back below top speed in exchange for a large
   * charge-regen bonus (engine.ts) — the mirror of a kick: a kick spends a
   * charge for a burst above top speed, holding banks a charge faster for a
   * genuine cost in ground covered right now. A horse fighting to hold its
   * pack position can't afford this; a horse that's comfortable, or banking
   * for a Moment still well off, can.
   */
  holding: boolean;
  /** Fire the kick this tick, if it has not already been used. */
  kick: boolean;
  /** Preferred lane, 0 = rail. The jockey resolves whether it can be reached. */
  targetLane: number;
}

export type Controller = (state: RunnerView, race: RaceView) => ControlInput;

/** Read-only snapshot of a runner, handed to controllers and the renderer. */
export interface RunnerView {
  id: string;
  name: string;
  /** Yards travelled. */
  distance: number;
  speed: number;
  lane: number;
  /** 0 = leading, 1 = last. */
  fieldPosition: number;
  /** 1-based place in the field right now. */
  rank: number;
  blocked: boolean;
  drafting: boolean;
  /** Kicks not yet fired. Regenerates over the race — see CHARGE_CAPACITY. */
  kicksRemaining: number;
  /** True while running below true ability — surfaced on screen, never silent. */
  offColour: boolean;
}

export interface RaceView {
  /** 0-1 through the race. */
  progress: number;
  elapsed: number;
  totalYards: number;
  fieldSize: number;
  /** Leader's yards travelled. */
  leaderDistance: number;
  /**
   * 0-1. Raised while a Pace Pusher is on the lead — the trait that reaches
   * beyond its own horse and manufactures the fast-pace collapse that upsets
   * come from (TRAITS.md, "traits with reach").
   */
  pacePressure: number;
}

export type RaceEventKind =
  | 'start'
  | 'fumbledStart'
  | 'greenMoment'
  | 'blocked'
  | 'freed'
  | 'kick'
  | 'fade'
  | 'phase'
  | 'finish';

export interface RaceEvent {
  at: number;
  kind: RaceEventKind;
  horseId: string;
  detail?: string;
}

export interface RaceResult {
  horseId: string;
  name: string;
  finishPosition: number;
  /** Seconds. */
  time: number;
  /** Lengths behind the winner. */
  margin: number;
  /** Kick charges still banked, unspent, at the wire. */
  kicksLeft: number;
  /** Sectional times per furlong, for the post-race analysis. */
  sectionals: number[];
  hadTrouble: boolean;
  fumbledStart: boolean;
  offColour: boolean;
}

export interface RaceOutcome {
  results: RaceResult[];
  events: RaceEvent[];
  /** How fast the first half was run, relative to an even pace. >1 = fast. */
  paceRating: number;
  duration: number;
}

export interface RaceEntrant {
  horse: Horse;
  controller?: Controller;
}

/** Which aptitude band a distance falls into. */
export function bandFor(furlongs: number): DistanceBand {
  if (furlongs <= 7) return 'sprint';
  if (furlongs <= 9) return 'mile';
  return 'route';
}
