/**
 * Breeding — the inheritance budget (DESIGN.md §10).
 *
 * A retired horse's career converts into a point total, and breeding
 * **distributes** that total into the foal rather than rolling fresh numbers.
 * That is what makes rerolling non-inflationary: a reroll reshuffles the same
 * budget, trading Speed for Stamina, concentrating or spreading. All-A's is not
 * a lucky roll away, it is generations away.
 *
 * Three parts, per §10:
 *
 *   - **Floor**    the parents. No pairing can produce a worthless foal.
 *   - **Budget**   career achievement + the first-cross bonus, tapering per repeat.
 *   - **Variance** how unrelated the pairing is. Diversity controls the *spread*,
 *                  never the total — a wide roll is boom-or-bust, a tight line
 *                  is safe and dull, and neither is better on average.
 *
 * Stage 1 of Phase 5: parents only. Grandparents, linebreeding, coat genetics
 * and trait mutation arrive in Stage 3 (see ROADMAP.md).
 */

import type { Rng } from './rng.js';
import type { Horse, Stats } from './types.js';
import { STAT_KEYS } from './types.js';
import { rollTraits } from './horse.js';

/* ---------------------------------------------------------------------------
   What a parent brings
   ------------------------------------------------------------------------ */

/**
 * Either side of a pairing: one of your retired horses, or an outside stud.
 *
 * Deliberately not `RetiredHorse` — outside partners never raced for you, so
 * they have no career record of yours to carry.
 */
export interface BreedingPartner {
  horse: Horse;
  /** Prestige this horse banked when it stopped racing. */
  legacyBanked: number;
  hallOfFame: boolean;
}

/**
 * What enshrining a horse is worth to its foals — §10's worked example gives a
 * Hall of Fame sire +50 on a ~200 base, so a quarter of its own contribution.
 *
 * This is the payoff that makes the Hall of Fame the most valuable thing a
 * career can produce (§1), rather than a badge.
 */
export const HALL_OF_FAME_BONUS = 0.25;

/** A parent's contribution to the budget. */
export function partnerContribution(partner: BreedingPartner): number {
  const base = Math.max(0, partner.legacyBanked);
  return Math.round(base * (partner.hallOfFame ? 1 + HALL_OF_FAME_BONUS : 1));
}

/* ---------------------------------------------------------------------------
   Heterosis — the first-cross bonus
   ------------------------------------------------------------------------ */

/** Share of the base budget a brand-new pairing adds on top. */
export const HETEROSIS_RATE = 0.1;

/** How much of the bonus survives each repeat of the same pairing. */
export const HETEROSIS_DECAY = 0.6;

/**
 * The first-cross bonus, by how many times this exact pair has bred before.
 *
 * §10: "The base never degrades — only the bonus does. Repeats are less
 * exciting, never worse." So this only ever adds, and it is rolled per pairing
 * rather than per foal, which is what stops a reroll farming it.
 */
export function heterosisBonus(baseBudget: number, timesBred: number): number {
  const decay = HETEROSIS_DECAY ** Math.max(0, timesBred);
  return Math.round(baseBudget * HETEROSIS_RATE * decay);
}

/* ---------------------------------------------------------------------------
   Relatedness
   ------------------------------------------------------------------------ */

/**
 * How closely two horses are related, 0 (unrelated) to 1.
 *
 * Parents only, for now. Grandparents and deeper linebreeding are Stage 3, and
 * this is the function they extend — everything downstream reads the number,
 * not the pedigree.
 */
export function relatedness(sire: Horse, dam: Horse): number {
  const parentOf = (a: Horse, b: Horse): boolean =>
    b.sireId === a.id || b.damId === a.id;

  if (parentOf(sire, dam) || parentOf(dam, sire)) return 0.5;

  const shared = [
    sire.sireId && sire.sireId === dam.sireId,
    sire.damId && sire.damId === dam.damId,
  ].filter(Boolean).length;

  // Full siblings share both parents; half siblings one.
  if (shared === 2) return 0.5;
  if (shared === 1) return 0.25;
  return 0;
}

/* ---------------------------------------------------------------------------
   The budget
   ------------------------------------------------------------------------ */

export interface InheritanceBudget {
  /** Both parents' contributions, before the first-cross bonus. */
  base: number;
  /** The first-cross bonus for this pairing at this repeat count. */
  bonus: number;
  total: number;
  /** 0 = unrelated (wide roll), higher = tighter line and a narrower roll. */
  relatedness: number;
}

export function calculateBudget(
  sire: BreedingPartner,
  dam: BreedingPartner,
  timesBred = 0,
): InheritanceBudget {
  const base = partnerContribution(sire) + partnerContribution(dam);
  const bonus = heterosisBonus(base, timesBred);
  return {
    base,
    bonus,
    total: base + bonus,
    relatedness: relatedness(sire.horse, dam.horse),
  };
}

/* ---------------------------------------------------------------------------
   Turning a budget into potential
   ------------------------------------------------------------------------ */

/**
 * The most a single generation can add to the parents' average potential.
 *
 * Kept small on purpose. A foal is its parents plus a nudge earned by their
 * careers, so climbing to a Hall of Fame horse is several generations of work
 * rather than one good pairing — which is exactly the reason the Hall of Fame
 * bar sits above what any first-generation horse can reach.
 */
export const MAX_GENERATION_GAIN = 30;

/** Budget at which half of `MAX_GENERATION_GAIN` is earned. */
export const GAIN_HALF_POINT = 900;

/**
 * How far above its parents a foal lands, in potential points per stat.
 *
 * Two things shape it, and the second matters more than the first:
 *
 *   - **Budget**, saturating, so a spectacular pairing beats a good one without
 *     being unboundedly better.
 *   - **Headroom.** The gain is a share of the distance the parents still have
 *     left to 100, so improvement slows as a line approaches the ceiling.
 *
 * Without the headroom term a line simply added a fixed step each generation
 * and maxed out: measured from a typical generation-1 pair, every stat pinned
 * at 100 by generation four or five, which finishes the bloodline — the whole
 * progression — in about as many careers as it takes to unlock a barn. Scaling
 * by headroom turns that into an asymptote: Hall of Fame material arrives
 * somewhere around generation five or six, and perfection never quite does.
 */
export function generationGain(budget: number, midParentAverage: number): number {
  const b = Math.max(0, budget);
  const budgetFactor = b / (b + GAIN_HALF_POINT);
  const headroom = Math.max(0, 100 - midParentAverage) / 100;
  return MAX_GENERATION_GAIN * budgetFactor * headroom;
}

/** Share of the mid-parent potential a foal is guaranteed, whatever the roll. */
export const FLOOR_SHARE = 0.6;

/**
 * Spread of the fresh distribution roll, at maximum diversity.
 *
 * A **half-range, not a standard deviation**: `rng.normal` sums four uniforms,
 * so a spread of 26 rolls inside ±26 with an sd near 7.5. The first cut read
 * this number as an sd and set it to 14 — an sd of 4, against a natural starter
 * spread of 30 to 56. Averaging two parents narrowed a line far faster than
 * that could widen it, so every bloodline flattened toward an identical
 * all-rounder (ROADMAP.md, Stage 1 follow-up).
 */
export const MAX_SPREAD = 26;

/**
 * How far past a parent a foal can lean on one stat, as a multiple of the gap
 * between the two parents. Also a half-range.
 *
 * **This is the term that stops regression to the mean.** A foal built at the
 * mid-parent of every stat is blander than its parents by construction —
 * averaging always narrows — so a line assembled that way loses its shape no
 * matter how wide the fresh roll is. Leaning per stat instead lets a foal take
 * its sire's stamina and its dam's speed, and now and then more of either than
 * either parent had.
 *
 * It needs no diversity term of its own, which is the point of expressing it
 * this way: two closely related horses are alike, so the gap it multiplies is
 * already small. A line bred back into itself therefore rolls narrower because
 * there is less to lean toward — §10's inbreeding penalty, falling out of the
 * pairing rather than bolted on as a rule.
 */
export const PARENT_TILT = 2.3;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/**
 * Distribute a budget into a foal's potential.
 *
 * The **total** is set by the budget; **diversity** decides only how evenly it
 * lands. A wide roll therefore produces §10's "bust": lopsided, never weak —
 * brilliant in one stat, floor-level in another, with the same points in it.
 *
 * Two things decide the shape, and they answer different questions:
 *
 *   - **The tilt** — which parent each stat came from. This is what carries a
 *     family's character, and what stops a line averaging itself flat.
 *   - **The roll** — fresh variance the pairing did not inherit from either
 *     side, scaled by how unrelated the pair is. This is what lets an outcross
 *     throw a specialist neither parent was.
 */
export function distributePotential(
  rng: Rng,
  sire: Horse,
  dam: Horse,
  budget: number,
  related: number,
): Stats {
  const spread = MAX_SPREAD * (1 - clamp(related, 0, 1));

  const midParent = {} as Stats;
  const floor = {} as Stats;
  /** Half the gap between the parents on each stat — what the tilt leans on. */
  const gap = {} as Stats;
  let midTotal = 0;
  for (const key of STAT_KEYS) {
    const sireSide = sire.potential?.[key] ?? 50;
    const damSide = dam.potential?.[key] ?? 50;
    const mid = (sireSide + damSide) / 2;
    midParent[key] = mid;
    gap[key] = (sireSide - damSide) / 2;
    floor[key] = mid * FLOOR_SHARE;
    midTotal += mid;
  }

  const gain = generationGain(budget, midTotal / STAT_KEYS.length);

  // Offsets are made zero-sum, so shape moves points between stats without
  // ever changing how many there are.
  const offsets = STAT_KEYS.map(
    (key) => rng.normal(0, PARENT_TILT) * gap[key] + rng.normal(0, spread),
  );
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;

  const raw = {} as Stats;
  for (let i = 0; i < STAT_KEYS.length; i++) {
    const key = STAT_KEYS[i]!;
    raw[key] = midParent[key] + gain + (offsets[i]! - mean);
  }

  return redistribute(raw, floor);
}

/**
 * Clamp every stat into [floor, 100] while preserving the total.
 *
 * Clamping alone would quietly destroy points every time a roll pushed a stat
 * past 100 — a well-bred foal would have been *punished* for a lopsided roll,
 * which is the opposite of what §10 asks for.
 */
function redistribute(raw: Stats, floor: Stats): Stats {
  const out = {} as Stats;
  let residue = 0;

  for (const key of STAT_KEYS) {
    const capped = clamp(raw[key], floor[key], 100);
    residue += raw[key] - capped;
    out[key] = capped;
  }

  // Hand the spare points back to whichever stats still have room, repeatedly,
  // because filling one stat can push it to its own cap.
  for (let pass = 0; pass < 4 && Math.abs(residue) > 0.01; pass++) {
    const open = STAT_KEYS.filter((key) =>
      residue > 0 ? out[key] < 100 : out[key] > floor[key],
    );
    if (open.length === 0) break;

    const share = residue / open.length;
    residue = 0;
    for (const key of open) {
      const wanted = out[key] + share;
      const capped = clamp(wanted, floor[key], 100);
      residue += wanted - capped;
      out[key] = capped;
    }
  }

  for (const key of STAT_KEYS) out[key] = Math.round(out[key]);
  return out;
}

/* ---------------------------------------------------------------------------
   The foal
   ------------------------------------------------------------------------ */

/** How much of its potential a foal shows at debut. */
const DEBUT_SHARE_MIN = 0.3;
const DEBUT_SHARE_MAX = 0.42;

export interface BreedingResult {
  foal: Horse;
  budget: InheritanceBudget;
}

/**
 * Produce a foal from a pairing.
 *
 * `name` is supplied by the caller so this stays pure — naming needs the yard's
 * dedupe list, which is not breeding's business.
 */
export function breed(
  rng: Rng,
  sire: BreedingPartner,
  dam: BreedingPartner,
  name: string,
  timesBred = 0,
): BreedingResult {
  const budget = calculateBudget(sire, dam, timesBred);
  const potential = distributePotential(
    rng,
    sire.horse,
    dam.horse,
    budget.total,
    budget.relatedness,
  );

  const stats = {} as Stats;
  for (const key of STAT_KEYS) {
    stats[key] = Math.round(potential[key] * rng.range(DEBUT_SHARE_MIN, DEBUT_SHARE_MAX));
  }

  // Traits come from the parents, and are never paid for out of the budget
  // (§10) — a rare trait is delight, not something the foal was charged for.
  // Mutation, which lets a foal show a trait neither parent had, is Stage 3.
  const parentTraits = [...new Set([...sire.horse.traits, ...dam.horse.traits])];
  const traits = rollTraits(rng, budget.total, parentTraits);

  const inheritDistance = (key: 'min' | 'max'): number => {
    const mid = (sire.horse.preferredDistance[key] + dam.horse.preferredDistance[key]) / 2;
    return Math.round((mid + rng.range(-100, 100)) / 25) * 25;
  };
  const min = inheritDistance('min');
  const max = inheritDistance('max');

  const foal: Horse = {
    id: `h${Math.floor(rng.next() * 0xffffffff).toString(36)}`,
    name,
    gender: rng.chance(0.5) ? 'stallion' : 'mare',
    age: 2,
    stats,
    potential,
    style: rng.chance(0.5) ? sire.horse.style : dam.horse.style,
    moment: rng.chance(0.5) ? sire.horse.moment : dam.horse.moment,
    preferredDistance: { min: Math.min(min, max), max: Math.max(min, max) },
    traits,
    condition: 70,
    morale: 60,
    division: 'maiden',
    divisionLevel: 0,
    divisionPoints: 0,
    starts: 0,
    wins: 0,
    places: 0,
    shows: 0,
    // Stage 3 replaces this with real dominant/recessive inheritance. Until
    // then a foal simply takes a parent's coat, and no hidden allele is
    // invented — a fake genotype now would be worse than none, because Stage 3
    // would inherit its mistakes for three generations.
    coat: rng.chance(0.5) ? sire.horse.coat : dam.horse.coat,
    jockeySkill: 60,

    // Lineage. Nothing reads these until Stages 3 and 4, but they are facts
    // about this moment and cannot be reconstructed later (ROADMAP.md).
    sireId: sire.horse.id,
    damId: dam.horse.id,
    generation: Math.max(sire.horse.generation ?? 1, dam.horse.generation ?? 1) + 1,
  };

  return { foal, budget };
}

/* ---------------------------------------------------------------------------
   Eligibility
   ------------------------------------------------------------------------ */

/** Full contribution up to this age. */
export const BREEDING_PRIME_AGE = 17;
/** Ineligible from this age. */
export const BREEDING_MAX_AGE = 22;

/**
 * How much of its contribution a horse still brings, by age.
 *
 * A career advances the world about four years, so a horse retired at 5 breeds
 * at 5, 9, 13, 17 and 21 — four foals at full strength and a fading fifth. The
 * taper matters more than the cutoff: a sire visibly running out of years is
 * something a player can plan around, where a hard stop simply removes a
 * favourite between one career and the next.
 */
export function fertility(age: number): number {
  if (age >= BREEDING_MAX_AGE) return 0;
  if (age <= BREEDING_PRIME_AGE) return 1;
  const past = age - BREEDING_PRIME_AGE;
  const span = BREEDING_MAX_AGE - BREEDING_PRIME_AGE;
  return Math.max(0, 1 - past / span);
}

export function canBreed(horse: Horse): boolean {
  return fertility(horse.age) > 0;
}

/** A pairing is valid when both are fertile, opposite sexes, and not the same horse. */
export function canPair(a: Horse, b: Horse): boolean {
  return a.id !== b.id && a.gender !== b.gender && canBreed(a) && canBreed(b);
}

/** Stable key for a pairing, so repeats can be counted whichever way round. */
export function pairingKey(a: Horse, b: Horse): string {
  return [a.id, b.id].sort().join('~');
}
