import { getTierFromPoints } from './legacy.js';

/**
 * Buying a yearling — the escape hatch when a line goes bad.
 *
 * ROADMAP.md's decision table: "Breed or buy, with buying explicitly weaker."
 * Breeding is the intended path (§1), so a bought horse is generation 1 and
 * inherits nothing — it is a starter you paid for, offered when your own
 * bloodstock has nothing you want to run.
 *
 * It is deliberately not a competitive alternative. A yearling is the same
 * animal the starter screen offers, which a third-generation foal beats
 * comfortably; what the cash buys is a way out of a dead end, not a shortcut
 * past the breeding it is meant to protect.
 */

/** What a yearling costs a yard with no name yet. */
export const YEARLING_BASE_PRICE = 4000;

/** How many are on offer at a time. Fewer than the six a new line chooses from. */
export const YEARLING_OFFERS = 3;

/**
 * The asking price, by the yard's standing.
 *
 * It climbs because the horse on offer does — §13 scales the pool with the
 * stable so a fresh horse is never a punishment. A yard that can afford the
 * higher price is one whose bloodstock should already be better than what this
 * buys, which is the shape the trade is meant to have.
 */
export function yearlingPrice(prestige: number): number {
  return Math.round(YEARLING_BASE_PRICE * (1 + getTierFromPoints(prestige) * 0.75));
}
