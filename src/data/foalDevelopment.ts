import { STAT_KEYS, type Horse, type StatKey } from '../sim/types.js';
import type { Rng } from '../sim/rng.js';
import type { TraitId } from './traits.js';
import { getBreedingBonus, getTrainingMultiplier } from './facilities.js';
import { getTrainerBonus } from './staff.js';

/**
 * The foal's first year (DESIGN.md §10).
 *
 * "A short, **skippable but genuinely significant** phase — a pool of
 * development points spent on stat growth, aptitude nudges, or coaxing out a
 * latent trait. **Explicitly modelled on Pokémon EVs**: big enough that a
 * competitive player would never skip it, fully skippable for anyone who just
 * wants to race. **This is where player agency enters an otherwise random
 * inheritance.**"
 *
 * Those two sentences pull against each other, and the second one wins. Pokémon
 * EVs are *earned by what you do*, not spent from a menu — you steer them by
 * choosing where to go, and the numbers follow. So this is a **rearing plan**
 * rather than a shop: you set what the yearling is brought along for, the year
 * resolves against your facilities and your trainer, and it can surprise you in
 * both directions.
 *
 * The first cut was a spend screen — click a stat six times, watch a number go
 * up. It was precise, repetitive, risk-free and completely disconnected from
 * the yard the player had spent five careers building. A year that cannot
 * surprise you is a year with no story in it.
 *
 * **Growth never raises a ceiling.** Everything here moves what the foal
 * *starts* with. Potential belongs to the inheritance budget, and a development
 * phase that could inflate it would be a second, easier budget that made the
 * first one pointless.
 */

/* ---------------------------------------------------------------------------
   What the year is worth
   ------------------------------------------------------------------------ */

/** Growth every foal gets, whatever the yard behind it. */
export const BASE_POOL = 24;

/**
 * The year's total growth, before it is aimed anywhere.
 *
 * Three things the player built decide it, which is the point — the first cut
 * ignored all of them:
 *
 *   - **Stud Farm**, which has advertised "+10% breeding potential" since Phase
 *     4 with `getBreedingBonus` written, banked and read by nothing. A yard that
 *     invested in raising foals raises them better.
 *   - **Training Grounds**, at a third of their racing effect. A yearling is not
 *     in full work, but the gallops are the gallops.
 *   - **The trainer**, likewise. Bringing a young horse along is the job.
 *
 * Deliberately not scaled by the foal's own quality: tying it to the budget
 * would hand the best-bred foals the most agency as well, which is the opposite
 * of what this phase is for.
 */
export function developmentPool(
  facilities: Record<string, number>,
  trainerLevel = 1,
): number {
  const stud = getBreedingBonus(facilities);
  const grounds = (getTrainingMultiplier(facilities) - 1) / 3;
  const trainer = getTrainerBonus(trainerLevel) / 3;
  return Math.round(BASE_POOL * (1 + stud + grounds + trainer));
}

/* ---------------------------------------------------------------------------
   The plan
   ------------------------------------------------------------------------ */

/** What a yearling is brought along for. */
export interface RearingPlan {
  primary: StatKey;
  /** Null is a legitimate plan: everything into one thing. */
  secondary: StatKey | null;
}

/** Share of the year that goes where you aimed it. */
export const PRIMARY_SHARE = 0.5;
export const SECONDARY_SHARE = 0.3;

/**
 * How the year lands when nothing is aimed at all.
 *
 * A skipped year is not a wasted one — the foal still grew, it just grew
 * however it liked. §10 wants the phase "fully skippable for anyone who just
 * wants to race", and a skip that produced nothing would make skipping a
 * punishment rather than a choice.
 */
export const UNFOCUSED_SHARE = 0.55;

/* ---------------------------------------------------------------------------
   What the year did
   ------------------------------------------------------------------------ */

export type YearEvent = 'breakthrough' | 'setback' | null;

export interface YearResult {
  /** Points added to each starting stat. */
  gains: Partial<Record<StatKey, number>>;
  /** Whether the year went unusually well or unusually badly. */
  event: YearEvent;
  /** The stat a breakthrough or setback landed on. */
  eventStat: StatKey | null;
  /** Growth that had nowhere to go, because a stat was already at its ceiling. */
  wasted: number;
}

/** Chance a year goes unusually well, or unusually badly. */
export const BREAKTHROUGH_CHANCE = 0.16;
export const SETBACK_CHANCE = 0.14;

/** How much a breakthrough adds, and a setback takes, as a share of the year. */
export const EVENT_SWING = 0.3;

/**
 * Resolve a year's rearing into actual growth.
 *
 * Bounded variance, deliberately: the year usually delivers close to what was
 * asked of it, with the occasional breakthrough and the occasional setback. Wide
 * enough that the reveal is worth watching, narrow enough that the plan a player
 * chose still means something — a year that ignored your instructions would make
 * the choice decoration.
 *
 * Growth stops dead at the ceiling the foal was born with. Anything that has
 * nowhere to go is reported as `wasted` rather than silently vanishing, because
 * pouring a year into a stat that was already finished is exactly the mistake
 * this screen should let a player learn from.
 */
export function resolveYear(
  rng: Rng,
  foal: Horse,
  plan: RearingPlan | null,
  pool: number,
): YearResult {
  const weights = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) weights[key] = 0;

  if (plan) {
    weights[plan.primary] += PRIMARY_SHARE;
    if (plan.secondary) weights[plan.secondary] += SECONDARY_SHARE;
    // Whatever is left spreads across everything, so a focused year still
    // brings a horse along in general rather than building a freak.
    const spare = 1 - PRIMARY_SHARE - (plan.secondary ? SECONDARY_SHARE : 0);
    for (const key of STAT_KEYS) weights[key] += spare / STAT_KEYS.length;
  } else {
    for (const key of STAT_KEYS) weights[key] = UNFOCUSED_SHARE / STAT_KEYS.length;
  }

  // One event a year at most, and never both.
  let event: YearEvent = null;
  let eventStat: StatKey | null = null;
  if (rng.chance(BREAKTHROUGH_CHANCE)) event = 'breakthrough';
  else if (rng.chance(SETBACK_CHANCE)) event = 'setback';
  if (event) {
    // It lands where the year was aimed, which is what makes it feel like a
    // consequence of the plan rather than a coin flip stapled on top.
    eventStat = plan ? plan.primary : rng.pick(STAT_KEYS);
    weights[eventStat] += event === 'breakthrough' ? EVENT_SWING : -EVENT_SWING;
  }

  const gains: Partial<Record<StatKey, number>> = {};
  let wasted = 0;

  for (const key of STAT_KEYS) {
    // A little jitter per stat, so two identical plans are not identical years.
    const jitter = rng.range(0.85, 1.15);
    const wanted = Math.max(0, Math.round(pool * weights[key] * jitter));
    if (wanted <= 0) continue;

    const room = Math.max(0, Math.floor(foal.potential[key]) - foal.stats[key]);
    const applied = Math.min(wanted, room);
    if (applied > 0) gains[key] = applied;
    wasted += wanted - applied;
  }

  return { gains, event, eventStat, wasted };
}

/* ---------------------------------------------------------------------------
   The one decision at the end
   ------------------------------------------------------------------------ */

/**
 * What coaxing out a latent trait costs, as a share of the year's growth.
 *
 * The decision §10 asks for, priced so that it is one. A trait is not free
 * here — it is the rest of the year, spent on the horse's head instead of its
 * body — but it was never paid for out of the inheritance budget, which is the
 * line §10 actually draws.
 */
export const TRAIT_COST_SHARE = 0.4;

/**
 * Traits the foal's parents carried and it did not inherit.
 *
 * The only ones it can be coaxed into showing. A foal cannot learn something no
 * ancestor had — that is what mutation is for, and mutation happens at birth,
 * free.
 */
export function latentTraits(foal: Horse, sire?: Horse, dam?: Horse): TraitId[] {
  const inherited = new Set(foal.traits);
  const carried = new Set<TraitId>([...(sire?.traits ?? []), ...(dam?.traits ?? [])]);
  return [...carried].filter((trait) => !inherited.has(trait));
}

/* ---------------------------------------------------------------------------
   Applying it
   ------------------------------------------------------------------------ */

/** The foal as its year left it. Pure: returns a new horse. */
export function applyYear(foal: Horse, result: YearResult, trait?: TraitId): Horse {
  const developed: Horse = {
    ...foal,
    stats: { ...foal.stats },
    potential: { ...foal.potential },
    traits: [...foal.traits],
    preferredDistance: { ...foal.preferredDistance },
  };

  for (const key of STAT_KEYS) {
    const gain = result.gains[key] ?? 0;
    if (gain <= 0) continue;
    // The ceiling holds. A year is a head start, never a bigger horse.
    developed.stats[key] = Math.min(Math.floor(foal.potential[key]), developed.stats[key] + gain);
  }

  if (trait && !developed.traits.includes(trait)) developed.traits.push(trait);

  return developed;
}

/** Total growth a result actually delivered. */
export function totalGain(result: YearResult): number {
  return STAT_KEYS.reduce((sum, key) => sum + (result.gains[key] ?? 0), 0);
}
