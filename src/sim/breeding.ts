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
 * Stage 3 added the texture: real coat genetics, traits and distance aptitude
 * inheriting separately with their own mutation chance, and relatedness that
 * reads grandparents so linebreeding compounds instead of vanishing the moment
 * the shared parents drop out of view.
 */

import type { Rng } from './rng.js';
import type { Horse, Stats } from './types.js';
import { STAT_KEYS } from './types.js';
import { rollTraits } from './horse.js';
import { genotypeOf, expressCoat, inheritCoat } from './coat.js';
import { RACING_TRAIT_IDS, type TraitId } from '../data/traits.js';

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

/**
 * A parent's contribution to the budget.
 *
 * Scaled by how much of its stud life the horse has left. §10's table gives a
 * full contribution to 17, a taper to 21 and nothing at 22 — and the taper has
 * to reach the *budget*, not just eligibility, or a sire visibly running out of
 * years would breed exactly as well at twenty as at five and the warning the
 * taper exists to give would be cosmetic.
 */
export function partnerContribution(partner: BreedingPartner): number {
  const base = Math.max(0, partner.legacyBanked);
  const enshrined = partner.hallOfFame ? 1 + HALL_OF_FAME_BONUS : 1;
  return Math.round(base * enshrined * fertility(partner.horse.age));
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

/** Looks a horse up by id, so a pedigree can be walked. */
export type Pedigree = (id: string) => Horse | undefined;

/** How many generations back relatedness looks. §10: parents and grandparents. */
export const PEDIGREE_DEPTH = 2;

/**
 * Every ancestor within `PEDIGREE_DEPTH`, and how many steps away each one is.
 *
 * A horse can appear twice at different depths — that is linebreeding, and the
 * nearest path is the one that counts, so the shortest distance wins.
 */
function ancestors(horse: Horse, pedigree: Pedigree | undefined, depth = PEDIGREE_DEPTH): Map<string, number> {
  const found = new Map<string, number>();

  const walk = (id: string | undefined, steps: number): void => {
    if (!id || steps > depth) return;
    const known = found.get(id);
    if (known === undefined || steps < known) found.set(id, steps);
    // Without a pedigree to read, the parents' own ids are still known facts —
    // the walk simply cannot go deeper.
    const parent = pedigree?.(id);
    if (!parent) return;
    walk(parent.sireId, steps + 1);
    walk(parent.damId, steps + 1);
  };

  // A horse is its own ancestor, at no distance at all. Without this the walk
  // cannot see a horse bred to its own grandchild: the grandchild carries the
  // grandparent's id, but the grandparent's own set is empty, so the two share
  // nothing and read as strangers. It also makes the parent-to-foal case fall
  // out of the arithmetic — 0.5^(0+1) — rather than needing a rule of its own.
  found.set(horse.id, 0);
  walk(horse.sireId, 1);
  walk(horse.damId, 1);
  return found;
}

/**
 * How closely two horses are related, 0 (unrelated) to 1.
 *
 * Wright's coefficient over the ancestors both sides share: each common
 * ancestor contributes `(1/2)^(n+m)`, where n and m are its distance from each
 * parent. That reproduces the numbers Stage 1 hardcoded — a parent bred to its
 * own foal is 0.5, full siblings 0.5, half siblings 0.25 — and keeps going where
 * they stopped: grandparent to grandchild is 0.25, first cousins 0.125, and a
 * line bred back into itself compounds rather than reading as unrelated the
 * moment the shared parents drop out of view.
 *
 * `pedigree` is how it reaches past the parents. Without one it degrades to what
 * Stage 1 did, which is what the world's horses — who have no recorded ancestry
 * at all — will always get.
 */
export function relatedness(sire: Horse, dam: Horse, pedigree?: Pedigree): number {
  const sireSide = ancestors(sire, pedigree);
  const damSide = ancestors(dam, pedigree);

  let total = 0;
  for (const [id, steps] of sireSide) {
    const other = damSide.get(id);
    if (other === undefined) continue;
    total += 0.5 ** (steps + other);
  }

  return Math.min(1, total);
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
  pedigree?: Pedigree,
): InheritanceBudget {
  const base = partnerContribution(sire) + partnerContribution(dam);
  const bonus = heterosisBonus(base, timesBred);
  return {
    base,
    bonus,
    total: base + bonus,
    relatedness: relatedness(sire.horse, dam.horse, pedigree),
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

/**
 * Chance a foal shows a trait neither parent carried.
 *
 * §10: "Traits and distance aptitude inherit separately through the genetic
 * rules with their own mutation chance — so a rare trait is pure delight, never
 * paid for out of the pool." Roughly one foal in twelve, which is rare enough
 * to feel like a gift and common enough that a long line visibly picks things
 * up over generations rather than being stuck with its founders' hand.
 */
export const TRAIT_MUTATION_CHANCE = 0.08;

/**
 * Chance a foal's preferred trip jumps well outside its parents' range.
 *
 * Aptitude already drifts by up to 100 m either way every generation, which
 * moves a line slowly. This is the other thing: the sprinter out of two
 * stayers. Without it a bloodline is locked to the distance its founder
 * happened to want, and the trip a horse wants is half of what it is.
 */
export const APTITUDE_MUTATION_CHANCE = 0.08;

/** How far a mutated aptitude can jump, in metres. */
export const APTITUDE_MUTATION_RANGE = 450;

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
  pedigree?: Pedigree,
): BreedingResult {
  const budget = calculateBudget(sire, dam, timesBred, pedigree);
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

  const foalGenotype = inheritCoat(rng, genotypeOf(sire.horse), genotypeOf(dam.horse));

  // Traits come from the parents, and are never paid for out of the budget
  // (§10) — a rare trait is delight, not something the foal was charged for.
  const parentTraits = [...new Set([...sire.horse.traits, ...dam.horse.traits])];
  const pool: TraitId[] = [...parentTraits];
  // The mutation: one slot in the pool comes from the whole trait list instead,
  // so a foal can show something neither parent had. Added to the pool rather
  // than to the foal, so it competes for a place like any inherited trait and
  // the count itself is still decided by inherited legacy.
  if (rng.chance(TRAIT_MUTATION_CHANCE)) {
    const novel = rng.pick(RACING_TRAIT_IDS);
    if (!pool.includes(novel)) pool.push(novel);
  }
  const traits = rollTraits(rng, budget.total, pool);

  // Aptitude drifts every generation and occasionally jumps: the sprinter out
  // of two stayers. The jump is rolled once and applied to both ends, so a
  // mutated foal moves its whole range rather than being stretched into a horse
  // that wants everything.
  const jump = rng.chance(APTITUDE_MUTATION_CHANCE)
    ? rng.range(-APTITUDE_MUTATION_RANGE, APTITUDE_MUTATION_RANGE)
    : 0;
  const inheritDistance = (key: 'min' | 'max'): number => {
    const mid = (sire.horse.preferredDistance[key] + dam.horse.preferredDistance[key]) / 2;
    return Math.round(Math.max(400, mid + jump + rng.range(-100, 100)) / 25) * 25;
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
    // Real dominant/recessive inheritance (§10). The foal draws one allele from
    // each parent at every locus, and its colour is whatever those express — so
    // two bays carrying red can throw a chestnut, and the gene that did it was
    // on record the whole time.
    coat: expressCoat(foalGenotype),
    coatGenotype: foalGenotype,
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
