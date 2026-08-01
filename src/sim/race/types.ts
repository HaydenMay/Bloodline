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
  /** 0-1. The DRIVE control — hold to urge, release to settle. */
  effort: number;
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
  energy: number;
  lane: number;
  /** 0 = leading, 1 = last. */
  fieldPosition: number;
  /** 1-based place in the field right now. */
  rank: number;
  blocked: boolean;
  drafting: boolean;
  kickUsed: boolean;
  /** True while running below true ability — surfaced on screen, never silent. */
  offColour: boolean;
}

/**
 * Why a runner's energy is moving the way it is.
 *
 * The energy economy is four multipliers deep — front cost, contest, positional
 * fit, drafting — and a bar alone cannot say which of them is currently doing
 * the work. Reporting the dominant one turns "the bar went up" into "the bar
 * went up BECAUSE I dropped into the slipstream", which is the difference
 * between a mystery and a lesson.
 *
 * The simulation picks the factor because which one dominates is a fact about
 * the model; the wording on screen belongs to the UI.
 */
export type EnergyFactor =
  /** Being hounded for the lead. The expensive one, and nobody is spared it. */
  | 'pressed'
  /** Paying the baseline cost of racing up front, discounted by style. */
  | 'onTheLead'
  /** Racing somewhere the style does not want to be. */
  | 'outOfPosition'
  /** In the style's slot, drawing the discount and the recovery bonus. */
  | 'inPosition'
  /** Sitting in a rival's slipstream. */
  | 'drafting'
  /** Spending the reserve, on purpose. */
  | 'kicking'
  /** Nothing dominant — the drift is just effort against recovery. */
  | 'neutral';

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
  energyLeft: number;
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
