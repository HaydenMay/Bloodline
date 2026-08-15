import type { Horse } from '../sim/types.js';

/**
 * Betting on your own horse.
 *
 * Odds come from how your horse rates against the field it is actually facing,
 * so backing a short-priced favourite returns little and a genuine outsider
 * pays. The stake is taken up front and is gone whatever happens — which is the
 * point: it makes a race you were going to run anyway carry a cost.
 */

export type BetType = 'win' | 'place';

export interface BetOption {
  type: BetType;
  label: string;
  description: string;
  /** Multiplier applied to the stake, including the stake itself. */
  odds: number;
}

export interface PlacedBet {
  type: BetType;
  stake: number;
  odds: number;
}

export interface BetSettlement {
  won: boolean;
  stake: number;
  /** Total returned, stake included. Zero when the bet loses. */
  payout: number;
  /** Payout minus stake — what actually changed hands. */
  net: number;
}

/** A rough rating for comparing a horse against a field. */
function rate(horse: Horse): number {
  const s = horse.stats;
  const core = (s.speed + s.stamina + s.burst + s.grit) / 4;
  const reliability = (s.temper + s.consistency) / 2;
  // Condition and morale matter on the day, so the market prices them in.
  const form = (horse.condition / 100) * 0.7 + (horse.morale / 100) * 0.3;
  return (core * 0.75 + reliability * 0.25) * (0.7 + form * 0.5);
}

/**
 * The player's implied chance of winning, from their rating share of the field.
 * Clamped so no price is ever a certainty or a hopeless case.
 */
export function winProbability(player: Horse, field: Horse[]): number {
  const runners = field.length > 0 ? field : [player];
  const ratings = runners.map(rate);
  const total = ratings.reduce((a, b) => a + b, 0);
  if (total <= 0) return 1 / runners.length;
  const share = rate(player) / total;
  return Math.max(0.03, Math.min(0.85, share));
}

/** The bookmaker's margin — why betting every race is a slow way to lose. */
const OVERROUND = 0.88;

export function getBetOptions(player: Horse, field: Horse[]): BetOption[] {
  const win = winProbability(player, field);
  const runners = Math.max(field.length, 2);
  // Placing pays on the first three in a field big enough to warrant it.
  const placesPaid = runners >= 8 ? 3 : 2;
  // A rough lift on the win chance, capped short of certainty.
  const place = Math.min(0.9, win * placesPaid * 0.75 + 0.05);

  return [
    {
      type: 'win',
      label: 'Win',
      description: 'Pays only if your horse wins.',
      odds: Math.max(1.1, Math.round((OVERROUND / win) * 10) / 10),
    },
    {
      type: 'place',
      label: 'Place',
      description: `Pays if your horse finishes in the first ${placesPaid}.`,
      odds: Math.max(1.05, Math.round((OVERROUND / place) * 10) / 10),
    },
  ];
}

/** Stake sizes offered, filtered to what the yard can actually cover. */
export function getStakeOptions(cash: number): number[] {
  return [500, 1000, 2500, 5000, 10000].filter((stake) => stake <= cash);
}

export function settleBet(
  bet: PlacedBet,
  finishingPosition: number,
  fieldSize: number,
): BetSettlement {
  const placesPaid = fieldSize >= 8 ? 3 : 2;
  const won =
    bet.type === 'win' ? finishingPosition === 1 : finishingPosition <= placesPaid;

  const payout = won ? Math.round(bet.stake * bet.odds) : 0;
  return { won, stake: bet.stake, payout, net: payout - bet.stake };
}
