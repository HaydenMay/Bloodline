import { STAT_KEYS, type Horse, type StatKey } from '../sim/types.js';
import type { TraitId } from './traits.js';
import { getBreedingBonus } from './facilities.js';

/**
 * The foal development phase (DESIGN.md §10).
 *
 * "A short, **skippable but genuinely significant** phase — a pool of
 * development points spent on stat growth, aptitude nudges, or coaxing out a
 * latent trait. Explicitly modelled on Pokémon EVs: big enough that a
 * competitive player would never skip it, fully skippable for anyone who just
 * wants to race. **This is where player agency enters an otherwise random
 * inheritance.**"
 *
 * That last line is the whole design. Everything else about a foal is decided
 * before you meet it — the budget by its parents' careers, the shape by the
 * roll, the colour by genes you cannot see. This is the one place you get to
 * push back, and it is deliberately small enough that it shapes a horse without
 * ever out-earning the generations of breeding that produced it.
 *
 * **Points never raise a ceiling.** Everything here moves what the foal *starts*
 * with, where it wants to run, and what it knows — never its potential. The
 * budget owns potential, and a development phase that could inflate it would be
 * a second, easier budget that made the first one pointless.
 */

/* ---------------------------------------------------------------------------
   The pool
   ------------------------------------------------------------------------ */

/** Points every foal gets, whatever the yard behind it. */
export const BASE_POOL = 24;

/**
 * How much the Stud Farm adds, per level.
 *
 * The facility has advertised "+10% breeding potential" since Phase 4 and been
 * read by nothing — `getBreedingBonus` was written and left banked for exactly
 * this. A yard that has invested in raising foals raises them better, which is
 * what the card has been promising players all along.
 *
 * It also answers the roadmap's open question — does the pool scale with
 * anything? — without scaling it by the foal's own quality. Tying it to the
 * budget would have handed the best-bred foals the most agency too, which is
 * the opposite of what this phase is for.
 */
export function developmentPool(facilities: Record<string, number>): number {
  return Math.round(BASE_POOL * (1 + getBreedingBonus(facilities)));
}

/* ---------------------------------------------------------------------------
   What points buy
   ------------------------------------------------------------------------ */

/** One point on a starting stat. Never past the ceiling the foal was born with. */
export const STAT_COST = 1;

/** One point shifts the preferred trip by this much, in metres. */
export const APTITUDE_STEP = 25;
export const APTITUDE_COST = 1;

/**
 * Coaxing out a trait the foal carried but did not show.
 *
 * Expensive, because it is the only buy that changes what the horse *is* rather
 * than how big its numbers are — and because §10 is firm that a trait is never
 * paid for out of the inheritance budget. Paying for one here is different: it
 * was already in the foal, from parents that had it, and the points only bring
 * it out.
 */
export const TRAIT_COST = 10;

/** Most a single stat may be pushed, so a pool cannot all land in one place. */
export const MAX_PER_STAT = 8;

/* ---------------------------------------------------------------------------
   What a particular foal may spend on
   ------------------------------------------------------------------------ */

/**
 * Traits the foal's parents carried that it did not inherit.
 *
 * These are the only ones it can be coaxed into showing. A foal cannot learn
 * something no ancestor had — that is what mutation is for, and mutation
 * happens at birth, free, exactly as §10 asks.
 */
export function latentTraits(foal: Horse, sire?: Horse, dam?: Horse): TraitId[] {
  const inherited = new Set(foal.traits);
  const carried = new Set<TraitId>([...(sire?.traits ?? []), ...(dam?.traits ?? [])]);
  return [...carried].filter((trait) => !inherited.has(trait));
}

/** A foal's plan, as the screen builds it. */
export interface DevelopmentPlan {
  /** Points added to each starting stat. */
  stats: Partial<Record<StatKey, number>>;
  /** Steps of `APTITUDE_STEP` metres, negative for shorter. */
  aptitudeShift: number;
  /** Latent traits being coaxed out. */
  traits: TraitId[];
}

export const emptyPlan = (): DevelopmentPlan => ({ stats: {}, aptitudeShift: 0, traits: [] });

/** What a plan costs. */
export function planCost(plan: DevelopmentPlan): number {
  const stats = STAT_KEYS.reduce((sum, key) => sum + (plan.stats[key] ?? 0) * STAT_COST, 0);
  const aptitude = Math.abs(plan.aptitudeShift) * APTITUDE_COST;
  return stats + aptitude + plan.traits.length * TRAIT_COST;
}

/**
 * How far a stat can still be pushed, given the plan so far and the pool left.
 *
 * Three ceilings at once: the per-stat cap, the potential the foal was born
 * with, and the points remaining. The middle one is the important one — a
 * development phase that could push a stat past its ceiling would be raising
 * potential through the back door.
 */
export function headroomFor(
  foal: Horse,
  plan: DevelopmentPlan,
  key: StatKey,
  pool: number,
): number {
  const spent = plan.stats[key] ?? 0;
  const toCap = MAX_PER_STAT - spent;
  const toCeiling = Math.max(0, Math.floor(foal.potential[key]) - (foal.stats[key] + spent));
  const affordable = Math.floor((pool - planCost(plan)) / STAT_COST);
  return Math.max(0, Math.min(toCap, toCeiling, affordable));
}

/* ---------------------------------------------------------------------------
   Applying it
   ------------------------------------------------------------------------ */

/**
 * The foal as its plan leaves it. Pure: returns a new horse.
 *
 * Skipping is simply an empty plan, which is why nothing here special-cases it —
 * §10 wants the phase "fully skippable for anyone who just wants to race", and
 * a skip that took a different code path would be a second thing to keep right.
 */
export function applyDevelopment(foal: Horse, plan: DevelopmentPlan): Horse {
  const developed: Horse = {
    ...foal,
    stats: { ...foal.stats },
    potential: { ...foal.potential },
    traits: [...foal.traits],
    preferredDistance: { ...foal.preferredDistance },
  };

  for (const key of STAT_KEYS) {
    const points = plan.stats[key] ?? 0;
    if (points <= 0) continue;
    // The ceiling holds. Points are a head start, never a bigger horse.
    developed.stats[key] = Math.min(
      Math.floor(foal.potential[key]),
      developed.stats[key] + points,
    );
  }

  if (plan.aptitudeShift !== 0) {
    const shift = plan.aptitudeShift * APTITUDE_STEP;
    developed.preferredDistance = {
      min: Math.max(400, foal.preferredDistance.min + shift),
      max: Math.max(425, foal.preferredDistance.max + shift),
    };
  }

  for (const trait of plan.traits) {
    if (!developed.traits.includes(trait)) developed.traits.push(trait);
  }

  return developed;
}
