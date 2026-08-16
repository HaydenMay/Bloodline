/**
 * Race purses.
 *
 * One source of truth for what a race is worth, because the number the player
 * is shown before the race and the number paid out after it used to be worked
 * out in different places — the race intro advertised a hardcoded $1,000 on
 * every race in the game, whatever the division was actually paying.
 */

/** What a division's races are worth before difficulty is taken into account. */
export const BASE_PURSES: Record<string, number> = {
  maiden: 5_000,
  novice: 10_000,
  open: 20_000,
  stakes: 50_000,
  championship: 100_000,
};

/**
 * How much difficulty is worth, at the extremes of the calendar's rating.
 *
 * Difficulty picks a stronger field, so it has to pay for itself: the easy race
 * on the card is the safe cheque and the hard one is the gamble. The spread is
 * roughly 1.7x from the softest race to the toughest, which is enough to make
 * the choice matter without making the easy races pointless to enter.
 */
export const MIN_DIFFICULTY_MULTIPLIER = 0.6;
export const MAX_DIFFICULTY_MULTIPLIER = 1.4;

/**
 * The total purse for a race.
 *
 * `difficulty` is the calendar's 0–1 rating — the same number that decides how
 * strong a field the player is drawn against, which is what makes the extra
 * money a reward for risk rather than a free uplift.
 */
export function getPurse(division: string, difficulty = 0.5): number {
  const base = BASE_PURSES[division] ?? BASE_PURSES.maiden!;
  const clamped = Math.max(0, Math.min(1, difficulty));
  const multiplier =
    MIN_DIFFICULTY_MULTIPLIER +
    clamped * (MAX_DIFFICULTY_MULTIPLIER - MIN_DIFFICULTY_MULTIPLIER);
  // Rounded to the nearest 100 so a racecard never posts an odd-looking purse.
  return Math.round((base * multiplier) / 100) * 100;
}

/**
 * Share of the purse paid down the placings, 1st to 6th.
 *
 * Modelled on how real racing actually pays: the UK distributes to the first
 * six, US purses commonly to the first five at roughly 60/20/11/6/3. The old
 * ladder paid 4th *and everything behind it* a flat 10%, so finishing last of
 * eight in an Open race collected $2,000 and a bad run cost nothing.
 */
export const PRIZE_SHARES = [0.5, 0.22, 0.12, 0.08, 0.05, 0.03];

/**
 * What every other runner collects, win or lose.
 *
 * Real tracks fund a small starter's allowance separately from the advertised
 * purse — a few hundred dollars for turning up. It keeps a bad day from being a
 * total loss without making the back half of the field worth racing for.
 */
export const STARTER_ALLOWANCE_SHARE = 0.01;

/** Share of the purse paid for a finishing position. */
export function getPrizeShare(finishingPosition: number): number {
  return PRIZE_SHARES[finishingPosition - 1] ?? STARTER_ALLOWANCE_SHARE;
}

/** What a given finishing position actually pays. */
export function getPrizeMoney(
  division: string,
  finishingPosition: number,
  difficulty = 0.5,
): number {
  return Math.round(getPurse(division, difficulty) * getPrizeShare(finishingPosition));
}
