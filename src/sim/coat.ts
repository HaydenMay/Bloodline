import type { Rng } from './rng.js';
import { createRng } from './rng.js';
import type { CoatId } from '../data/index.js';

/**
 * Coat colour genetics (DESIGN.md §10).
 *
 * Real equine colour genetics, not a coin flip between the parents' colours.
 * "A recessive can hide for three generations and then surprise you" is the
 * promise, and it only works if the hidden allele was written down at the time —
 * which is exactly why Stage 1 refused to invent a genotype rather than shipping
 * a fake one for Stage 3 to inherit.
 *
 * **Six loci, five of which are chosen because they express the eight coats
 * the game already draws** — nothing here needs art that does not exist:
 *
 *   Extension  E/e     `ee` is chestnut. The classic hider: two bays can throw
 *                      a chestnut foal, and the gene can sit unseen for
 *                      generations before two carriers meet.
 *   Agouti     A/t/a   On a black base, where the black sits: bay, dark bay
 *                      (the `t` allele, real-world seal brown), or black.
 *                      Invisible on a chestnut, which is why it hides so well.
 *   Cream      C/n     One copy: chestnut → palomino, bay → buckskin.
 *   Grey       G/n     Dominant, and paints over everything else.
 *   Roan       R/n     Dominant, roans the base coat.
 *   Flaxen     F/f     Real, recessive: pales the mane and tail independent of
 *                      the body colour underneath. `ff` on a bay is a
 *                      different-looking horse without touching the body
 *                      material at all — it needs no new coat and no new art,
 *                      only a different colour fed into the `hair` slot the
 *                      render pipeline already tints on its own.
 *
 * Adding a locus later — dun, tobiano, sabino — means adding a field, an
 * expression rule and the art. Nothing else here changes shape.
 */

export type ExtensionAllele = 'E' | 'e';
/** `A` bay, `t` dark bay (seal brown), `a` black. Dominance runs A > t > a. */
export type AgoutiAllele = 'A' | 't' | 'a';
export type CreamAllele = 'C' | 'n';
export type GreyAllele = 'G' | 'n';
export type RoanAllele = 'R' | 'n';
export type FlaxenAllele = 'F' | 'f';

export type AllelePair<T> = [T, T];

export interface CoatGenotype {
  extension: AllelePair<ExtensionAllele>;
  agouti: AllelePair<AgoutiAllele>;
  cream: AllelePair<CreamAllele>;
  grey: AllelePair<GreyAllele>;
  roan: AllelePair<RoanAllele>;
  flaxen: AllelePair<FlaxenAllele>;
}

/* ---------------------------------------------------------------------------
   Expression — genotype to the colour you see
   ------------------------------------------------------------------------ */

const has = <T>(pair: AllelePair<T>, allele: T): boolean =>
  pair[0] === allele || pair[1] === allele;

/**
 * What a genotype looks like.
 *
 * Order matters: grey covers everything, roan covers the base, cream modifies
 * it, and only then does the base itself show. That order is the real biology
 * and it is also what stops two modifiers arguing over one horse.
 */
export function expressCoat(genotype: CoatGenotype): CoatId {
  // Grey is progressive and epistatic — a grey horse is born coloured and
  // greys out, but the game shows a horse at the age it races, by which point
  // grey has won.
  if (has(genotype.grey, 'G')) return 'grey';
  if (has(genotype.roan, 'R')) return 'roan';

  const red = !has(genotype.extension, 'E');
  const creamed = has(genotype.cream, 'C');

  if (red) return creamed ? 'palomino' : 'chestnut';

  // Black-based. Agouti decides where the black sits.
  const base: CoatId = has(genotype.agouti, 'A')
    ? 'bay'
    : has(genotype.agouti, 't')
      ? 'darkBay'
      : 'black';

  // Cream on a black base only shows where there is red to dilute: a buckskin
  // is a diluted bay. On a true black it is a smoky black, which looks black.
  if (creamed && base !== 'black') return 'buckskin';
  return base;
}

/**
 * Flaxen only shows with two copies — a single `f` sits exactly as hidden as
 * a single `e` does, which is the whole point. Doesn't change which `CoatId`
 * a horse is; it changes the `hair` material fed to the render pipeline for
 * whatever coat that turns out to be, so it needs no new coat and no new art.
 */
export function expressesFlaxen(genotype: CoatGenotype): boolean {
  return genotype.flaxen[0] === 'f' && genotype.flaxen[1] === 'f';
}

/* ---------------------------------------------------------------------------
   Inheritance
   ------------------------------------------------------------------------ */

/** One allele from a parent, picked at random. Mendel, in one line. */
function passOn<T>(rng: Rng, pair: AllelePair<T>): T {
  return rng.chance(0.5) ? pair[0] : pair[1];
}

/**
 * A foal's genotype: one allele from each parent, at every locus.
 *
 * No mutation, deliberately. Colour is the system where the *hiding* is the
 * pleasure — a chestnut appearing out of four generations of bay should mean a
 * carrier married a carrier, not that the game rolled a surprise. Traits and
 * distance aptitude mutate; colour is inherited honestly.
 */
export function inheritCoat(rng: Rng, sire: CoatGenotype, dam: CoatGenotype): CoatGenotype {
  return {
    extension: [passOn(rng, sire.extension), passOn(rng, dam.extension)],
    agouti: [passOn(rng, sire.agouti), passOn(rng, dam.agouti)],
    cream: [passOn(rng, sire.cream), passOn(rng, dam.cream)],
    grey: [passOn(rng, sire.grey), passOn(rng, dam.grey)],
    roan: [passOn(rng, sire.roan), passOn(rng, dam.roan)],
    flaxen: [passOn(rng, sire.flaxen), passOn(rng, dam.flaxen)],
  };
}

/* ---------------------------------------------------------------------------
   Horses that were born before any of this existed
   ------------------------------------------------------------------------ */

/**
 * A genotype that would produce this coat, with plausible hidden alleles.
 *
 * Every horse in the world — starters, rivals, and everything in a save written
 * before Stage 3 — has a colour and no genes. Rather than freeze them at
 * homozygous (which would mean no bay in the game ever carried chestnut, and
 * the recessive could never surprise anyone), each is given a genotype that
 * expresses its actual colour with its unseen half rolled.
 *
 * Seeded from the horse's own id, so a horse's hidden genes are the same every
 * time they are asked for. Deriving them freshly each call would mean a stallion
 * threw chestnut foals on Tuesday and never again.
 */
export function genotypeFor(coat: string, id: string): CoatGenotype {
  const rng = createRng(`coat-${id}`);

  /**
   * A masked locus is one the coat says nothing about, so its alleles are
   * free — but "free" still needs a rate, and this one is deliberately low.
   *
   * Every chestnut and palomino is already a guaranteed `e` (that is what the
   * colour *is*, not a roll), which alone puts a quarter of the game's coats
   * at a hidden-or-expressed `e`. A high roll on top of that for every other
   * coat made the Archive's inheritance map light up as "the whole
   * bloodline" rather than a rare find — found from actually using the
   * trace, not measured, since there is no harness for how often a hidden
   * gene should feel special. Low enough that most founders start clean.
   */
  const maskedExtension = (): AllelePair<ExtensionAllele> => [
    'E',
    rng.chance(0.12) ? 'e' : 'E',
  ];
  const maskedAgouti = (): AllelePair<AgoutiAllele> => [
    rng.pick(['A', 't', 'a'] as const),
    rng.pick(['A', 't', 'a'] as const),
  ];
  /** `chance` is the probability of the plain, non-carrier pairing. */
  const carrier = <T>(shown: T, hidden: T, chance: number): AllelePair<T> => [
    shown,
    rng.chance(chance) ? shown : hidden,
  ];
  /** Independent of every other locus — a carrier at any coat, at the same low rate. */
  const maskedFlaxen = (): AllelePair<FlaxenAllele> => [
    'F',
    rng.chance(0.12) ? 'f' : 'F',
  ];

  const plain: CoatGenotype = {
    extension: ['E', 'E'],
    agouti: ['A', 'A'],
    cream: ['n', 'n'],
    grey: ['n', 'n'],
    roan: ['n', 'n'],
    flaxen: maskedFlaxen(),
  };

  switch (coat) {
    case 'chestnut':
      // Red is the recessive: a chestnut is always ee, and its agouti is free
      // because nothing shows it. This is where hidden bay comes from.
      return { ...plain, extension: ['e', 'e'], agouti: maskedAgouti() };

    case 'palomino':
      return {
        ...plain,
        extension: ['e', 'e'],
        agouti: maskedAgouti(),
        cream: ['C', 'n'],
      };

    case 'bay':
      // 0.8: an 80% chance of the plain pairing, matching maskedExtension's
      // rarity above rather than the coin flip this used to be.
      return { ...plain, extension: maskedExtension(), agouti: carrier('A', 'a', 0.8) };

    case 'darkBay':
      return { ...plain, extension: maskedExtension(), agouti: carrier('t', 'a', 0.8) };

    case 'black':
      return { ...plain, extension: maskedExtension(), agouti: ['a', 'a'] };

    case 'buckskin':
      return {
        ...plain,
        extension: maskedExtension(),
        agouti: carrier('A', 'a', 0.8),
        cream: ['C', 'n'],
      };

    case 'roan':
      // Roan hides whatever is underneath it, so the base is free.
      return {
        ...plain,
        extension: maskedExtension(),
        agouti: maskedAgouti(),
        roan: ['R', 'n'],
      };

    case 'grey':
      // Grey hides the most of all: a grey horse's whole base is unknown, which
      // is why a grey line can throw any colour once the grey allele is lost.
      return {
        extension: maskedExtension(),
        agouti: maskedAgouti(),
        cream: rng.chance(0.15) ? ['C', 'n'] : ['n', 'n'],
        grey: ['G', 'n'],
        roan: rng.chance(0.1) ? ['R', 'n'] : ['n', 'n'],
        flaxen: maskedFlaxen(),
      };

    default:
      return plain;
  }
}

/** The genotype a horse carries, deriving one from its colour if it has none. */
export function genotypeOf(horse: {
  id: string;
  coat: string;
  coatGenotype?: CoatGenotype;
}): CoatGenotype {
  return horse.coatGenotype ?? genotypeFor(horse.coat, horse.id);
}
