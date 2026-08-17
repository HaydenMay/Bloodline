import { STAT_KEYS, type Horse } from '../sim/types.js';

/**
 * What an outside stud costs (ROADMAP.md, Stage 2).
 *
 * **Priced on what you are buying, not on a reputation.** Two things set the
 * fee, and both are things the foal actually inherits:
 *
 *   - **Banked legacy** — the achievement half of the inheritance budget. This
 *     is literally the number that becomes your foal's points, so paying for it
 *     is paying for the foal.
 *   - **Potential** — the parents' finishing potentials are the floor the foal
 *     is built from. A stud whose own ceilings are high raises the whole
 *     distribution, and that is worth more than a record alone.
 *
 * **Your own horses are always free**, forever, Hall of Fame or not (§10). The
 * fee exists to price the escape hatch, never the intended path — a player who
 * breeds within their own yard never pays a penny, which is the shape §1 asks
 * for.
 *
 * The curve is deliberately steep at the top. Cash is the currency with the
 * least to spend on once a yard is built, and betting plus purses inflate it
 * faster than facilities drain it, so the best studs in the world are priced as
 * a real decision rather than a formality: about one Championship season for a
 * Championship sire.
 */

/** Cash per point of the stud's banked legacy. */
export const FEE_PER_LEGACY = 100;

/** Where the quality premium starts biting, on the 0-100 potential scale. */
export const FEE_QUALITY_FLOOR = 50;

/**
 * Cash per squared point of potential above the floor.
 *
 * Squared rather than linear because the top of the scale is where the scarcity
 * is: the gap between a 90 and a 95 stud is worth far more than the gap between
 * a 60 and a 65, and a linear price would make the best horses in the world a
 * rounding error on a good season.
 */
export const FEE_PER_QUALITY = 25;

/** Average of a horse's six potential ceilings. */
export function potentialAverage(horse: Horse): number {
  let total = 0;
  for (const key of STAT_KEYS) total += horse.potential?.[key] ?? 50;
  return total / STAT_KEYS.length;
}

/**
 * The fee to breed to an outside stud, in cash.
 *
 * Rounded to the nearest hundred so a stud book never posts an odd price.
 */
export function studFee(horse: Horse, legacyBanked: number): number {
  const legacy = Math.max(0, legacyBanked) * FEE_PER_LEGACY;
  const quality = Math.max(0, potentialAverage(horse) - FEE_QUALITY_FLOOR) ** 2 * FEE_PER_QUALITY;
  return Math.round((legacy + quality) / 100) * 100;
}
