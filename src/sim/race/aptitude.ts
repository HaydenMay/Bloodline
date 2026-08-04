import type { DistancePreference } from '../types.js';
import {
  DIST_FLOOR,
  DIST_PEAK_BASE,
  DIST_PEAK_NARROW_BONUS,
  DIST_TOLERANCE,
  DIST_WIDTH_MAX,
  DIST_WIDTH_MIN,
} from './constants.js';

/**
 * Distance suitability (REBUILD.md §7).
 *
 * Replaces the three-band aptitude grid entirely. A horse carries a preferred
 * range in metres — "Preferred Length 600-800 m" — which reads plainly to the
 * player where a letter grade per band needed explaining, and which is
 * continuous, so no horse is arbitrarily on the wrong side of a boundary.
 *
 * The WIDTH of the range is a real quality, and a trade rather than a tier: a
 * narrow specialist peaks higher but falls off a cliff outside its range, a
 * wide horse handles anything without ever being sharp. Neither is strictly
 * better, which is the shape TRAITS.md asks of anything that differentiates
 * horses.
 */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0 for the widest possible range, 1 for the narrowest. */
export function narrowness(pref: DistancePreference): number {
  const width = pref.max - pref.min;
  return 1 - clamp01((width - DIST_WIDTH_MIN) / (DIST_WIDTH_MAX - DIST_WIDTH_MIN));
}

/** The speed factor a horse gets inside its own preferred range. */
export function peakFor(pref: DistancePreference): number {
  return DIST_PEAK_BASE + DIST_PEAK_NARROW_BONUS * narrowness(pref);
}

/**
 * The distance component of the pre-race factor.
 *
 * Full peak inside the range, decaying linearly to DIST_FLOOR over
 * DIST_TOLERANCE metres outside it. Bottoming out costs 6% against a narrow
 * specialist in its range, which over any real distance is decisive — a
 * sprinter asked to run a route gets beaten, and beaten clearly.
 */
export function distanceFactor(pref: DistancePreference, metres: number): number {
  const peak = peakFor(pref);
  if (metres >= pref.min && metres <= pref.max) return peak;

  const outside = metres < pref.min ? pref.min - metres : metres - pref.max;
  const t = clamp01(outside / DIST_TOLERANCE);
  return peak - (peak - DIST_FLOOR) * t;
}
