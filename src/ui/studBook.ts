import { STAT_KEYS, type Horse, type StatBand, type StatKey } from '../sim/types.js';
import { createRng } from '../sim/rng.js';
import {
  breed,
  calculateBudget,
  canBreed,
  canPair,
  distributePotential,
  pairingKey,
  type BreedingPartner,
  type BreedingResult,
} from '../sim/breeding.js';
import { getTierFromPoints, seedLegacyFromRecord } from '../data/legacy.js';
import { createNameGenerator } from '../data/names.js';
import type { Division } from '../data/index.js';
import type { RetiredHorse, Stable } from './career.js';

/**
 * The stud book — who a yard can breed to, and what a pairing would produce.
 *
 * `sim/breeding.ts` knows how two horses make a third. It deliberately knows
 * nothing about yards, saves or partner lists, so this is the layer between:
 * everything here reads the `Stable` and hands `sim/` the two horses and the
 * repeat count it asks for.
 *
 * DOM-free on purpose. It lives in `ui/` only because `Stable` does — the
 * breeding screen renders what this returns, and can be rewritten without
 * touching any of these rules.
 */

/* ---------------------------------------------------------------------------
   Counting repeats
   ------------------------------------------------------------------------ */

/**
 * How many foals this exact pair has already produced.
 *
 * The first-cross bonus tapers per repeat and is rolled once per pairing, so
 * this count is what stops a player farming it — and it has to persist across
 * careers, because the pairing outlives the horse being campaigned (ROADMAP.md,
 * "What Stage 1 must record").
 */
export function timesBred(stable: Stable, a: Horse, b: Horse): number {
  return stable.pairings?.[pairingKey(a, b)] ?? 0;
}

/** Records that this pair has bred. Mutates the yard; the caller saves it. */
export function recordPairing(stable: Stable, a: Horse, b: Horse): void {
  if (!stable.pairings) stable.pairings = {};
  const key = pairingKey(a, b);
  stable.pairings[key] = (stable.pairings[key] ?? 0) + 1;
}

/* ---------------------------------------------------------------------------
   Who is available
   ------------------------------------------------------------------------ */

/** A horse you can breed, and where it came from. */
export interface PartnerOption {
  partner: BreedingPartner;
  /** Your own yard, or a rival's. */
  source: 'bloodstock' | 'outside';
  /** Foals this pairing has already produced. */
  timesBred: number;
  /** Its class, for the list. Outside studs are known by nothing else. */
  division: Division;
}

/** Turns one of your retirees into a breeding partner. */
export function toPartner(retired: RetiredHorse): BreedingPartner {
  return {
    horse: retired.horse,
    legacyBanked: retired.legacyBanked,
    hallOfFame: retired.hallOfFame,
  };
}

/** Every horse of yours still able to breed, newest retirement first. */
export function breedingStock(stable: Stable): RetiredHorse[] {
  return [...stable.bloodstock].reverse().filter((entry) => canBreed(entry.horse));
}

/**
 * The best class of outside stud a yard can reach, by prestige.
 *
 * §10 gates higher-calibre partners behind standing — written as reputation
 * there, which no longer exists, so prestige gates them (ROADMAP.md). Indexed
 * by prestige tier: an unknown yard is offered Novice horses, a Legend yard the
 * best in the world.
 */
const PARTNER_CEILING: Division[] = ['novice', 'open', 'stakes', 'championship', 'championship'];

const DIVISION_RANK: Division[] = ['maiden', 'novice', 'open', 'stakes', 'championship'];

/**
 * Outside studs, drawn from the horses already racing in your world.
 *
 * They are real animals with records and shapes of their own rather than a
 * horse invented at the moment you ask for one, which matters more than it
 * sounds: a stud rolled fresh at a high division comes out at 94.9 average
 * potential with half its stats pinned at 100, and breeding to that flattens a
 * line inside three generations (ROADMAP.md, Stage 1 follow-up). Drawing from
 * the world also means the partner is a horse the player has raced against, and
 * one the pedigree tree can point at in Stage 4.
 */
export function outsideStuds(stable: Stable, mine: Horse, limit = 6): BreedingPartner[] {
  const ceiling = PARTNER_CEILING[getTierFromPoints(stable.legacy.archivedPoints)] ?? 'novice';
  const maxRank = DIVISION_RANK.indexOf(ceiling);

  return (stable.world ?? [])
    .filter(
      (horse) =>
        canPair(mine, horse) &&
        DIVISION_RANK.indexOf(horse.division) <= maxRank &&
        // A two-year-old has not raced enough to be standing at stud.
        horse.age >= 4,
    )
    .sort(
      (a, b) =>
        DIVISION_RANK.indexOf(b.division) - DIVISION_RANK.indexOf(a.division) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map((horse) => ({
      horse,
      // An outside stud never raced for you, so there is no banked legacy of
      // yours to read. Its class stands in for the career you did not watch —
      // the same conversion a save written before legacy existed uses.
      legacyBanked: seedLegacyFromRecord(horse.wins ?? 0, 0, horse.division),
      hallOfFame: false,
    }));
}

/**
 * Everyone `mine` can be bred to: your own stock first, then outside studs.
 *
 * Your own come first because they are the intended path (§1) and free forever;
 * the outside list exists so a yard holding two colts in a row is never stuck
 * (ROADMAP.md's decision table).
 */
export function partnersFor(stable: Stable, mine: Horse): PartnerOption[] {
  const own: PartnerOption[] = breedingStock(stable)
    .filter((entry) => canPair(mine, entry.horse))
    .map((entry) => ({
      partner: toPartner(entry),
      source: 'bloodstock' as const,
      timesBred: timesBred(stable, mine, entry.horse),
      division: entry.horse.division,
    }));

  const outside: PartnerOption[] = outsideStuds(stable, mine).map((partner) => ({
    partner,
    source: 'outside' as const,
    timesBred: timesBred(stable, mine, partner.horse),
    division: partner.horse.division,
  }));

  return [...own, ...outside];
}

/* ---------------------------------------------------------------------------
   What a pairing would produce
   ------------------------------------------------------------------------ */

export type FoalProjection = Record<StatKey, StatBand>;

/** Rolls sampled to build the projected ranges. */
const PROJECTION_SAMPLES = 60;

/**
 * How much of the sampled spread the band shows, trimmed from each end.
 *
 * The first cut drew the full min-to-max of the sample, which made every
 * pairing read "D to S" — technically true, and useless. A band that always
 * spans the whole scale is not information, and §10 wants this picture to be
 * the *only* thing a player needs at the moment of decision. Trimming the tails
 * shows where a foal will usually land, so a tight line and a wild outcross
 * look as different on the screen as they are.
 */
const PROJECTION_TRIM = 0.1;

/** The value at a percentile of a sorted sample. */
function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index]!;
}

/**
 * The foal this pairing would produce, as a range per stat.
 *
 * §10: the pairing screen shows "a preview of the foal's projected potential
 * ranges — and nothing else". Ranges come out naturally wider for an unrelated
 * pair and narrower for close family, so the mechanic is felt without a
 * relatedness rating, a percentage, or a concept to learn.
 *
 * Seeded off the pairing rather than off a live stream, so the same two horses
 * always preview identically. A band that shifted every time the screen redrew
 * would read as noise, and worse, would let a player reroll the *preview* until
 * it flattered the pairing.
 */
export function projectFoal(
  sire: BreedingPartner,
  dam: BreedingPartner,
  repeats = 0,
): FoalProjection {
  const budget = calculateBudget(sire, dam, repeats);
  const key = pairingKey(sire.horse, dam.horse);

  const rolls = Array.from({ length: PROJECTION_SAMPLES }, (_, i) =>
    distributePotential(
      createRng(`preview-${key}-${repeats}-${i}`),
      sire.horse,
      dam.horse,
      budget.total,
      budget.relatedness,
    ),
  );

  const projection = {} as FoalProjection;
  for (const stat of STAT_KEYS) {
    const sorted = rolls.map((roll) => roll[stat]).sort((a, b) => a - b);
    projection[stat] = {
      low: percentile(sorted, PROJECTION_TRIM),
      high: percentile(sorted, 1 - PROJECTION_TRIM),
    };
  }
  return projection;
}

/* ---------------------------------------------------------------------------
   The foal itself
   ------------------------------------------------------------------------ */

/**
 * Breeds the pairing, records it, and hands back the foal.
 *
 * One foal per pairing, per §10 — there is no reroll here, which is what makes
 * the projected ranges a decision rather than a preview of something you can
 * shop for. Repeating the pairing is allowed and simply costs the first-cross
 * bonus a little more of itself.
 */
export function breedFoal(
  stable: Stable,
  mine: BreedingPartner,
  partner: BreedingPartner,
): BreedingResult {
  const repeats = timesBred(stable, mine.horse, partner.horse);
  const key = pairingKey(mine.horse, partner.horse);

  // The stallion is the sire whichever side of the pairing the player picked
  // first. `breed` writes `sireId` from its first argument and asks no
  // questions, so choosing a mare from your own yard would otherwise record her
  // as the sire — and Stage 3's linebreeding and Stage 4's tree read those two
  // fields as fact. A pedigree cannot be corrected after the horses are gone.
  const [sire, dam] =
    partner.horse.gender === 'mare' ? [mine, partner] : [partner, mine];

  // Seeded from the pairing and how often it has bred, so a foal is
  // reproducible from the save rather than from the clock — the same rule the
  // rest of the simulation follows.
  const rng = createRng(`foal-${key}-${repeats}-${stable.careersCompleted}`);

  const used = [
    ...stable.bloodstock.map((entry) => entry.horse.name),
    ...(stable.world ?? []).map((horse) => horse.name),
  ];
  const names = createNameGenerator(rng, used);

  const result = breed(rng, sire, dam, names.next(), repeats);
  recordPairing(stable, mine.horse, partner.horse);
  return result;
}
