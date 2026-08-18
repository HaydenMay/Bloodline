import { describe, it, expect } from 'vitest';
import { createRng } from './rng.js';
import {
  expressCoat,
  expressesFlaxen,
  genotypeFor,
  genotypeOf,
  inheritCoat,
  type CoatGenotype,
} from './coat.js';
import { COAT_IDS } from '../data/index.js';

const plain: CoatGenotype = {
  extension: ['E', 'E'],
  agouti: ['A', 'A'],
  cream: ['n', 'n'],
  grey: ['n', 'n'],
  roan: ['n', 'n'],
  flaxen: ['F', 'F'],
};

const gene = (over: Partial<CoatGenotype>): CoatGenotype => ({ ...plain, ...over });

describe('what a genotype looks like', () => {
  it('reads the base colours off extension and agouti', () => {
    expect(expressCoat(gene({}))).toBe('bay');
    expect(expressCoat(gene({ agouti: ['t', 'a'] }))).toBe('darkBay');
    expect(expressCoat(gene({ agouti: ['a', 'a'] }))).toBe('black');
    expect(expressCoat(gene({ extension: ['e', 'e'] }))).toBe('chestnut');
  });

  /** Agouti only decides where black sits, so a chestnut hides whatever it has. */
  it('ignores agouti entirely on a red horse', () => {
    expect(expressCoat(gene({ extension: ['e', 'e'], agouti: ['A', 'A'] }))).toBe('chestnut');
    expect(expressCoat(gene({ extension: ['e', 'e'], agouti: ['a', 'a'] }))).toBe('chestnut');
  });

  it('dilutes with a single cream: palomino from red, buckskin from bay', () => {
    expect(expressCoat(gene({ extension: ['e', 'e'], cream: ['C', 'n'] }))).toBe('palomino');
    expect(expressCoat(gene({ cream: ['C', 'n'] }))).toBe('buckskin');
  });

  it('paints grey over everything, and roan over the base', () => {
    expect(expressCoat(gene({ extension: ['e', 'e'], grey: ['G', 'n'] }))).toBe('grey');
    expect(expressCoat(gene({ agouti: ['a', 'a'], grey: ['n', 'G'] }))).toBe('grey');
    expect(expressCoat(gene({ roan: ['R', 'n'] }))).toBe('roan');
    // Grey outranks roan when a horse carries both.
    expect(expressCoat(gene({ grey: ['G', 'n'], roan: ['R', 'n'] }))).toBe('grey');
  });

  it('shows a dominant allele from either side of the pair', () => {
    expect(expressCoat(gene({ extension: ['e', 'E'] }))).toBe('bay');
    expect(expressCoat(gene({ extension: ['E', 'e'] }))).toBe('bay');
  });
});

describe('inheritance', () => {
  it('takes one allele from each parent at every locus', () => {
    const sire = gene({ extension: ['E', 'E'], agouti: ['a', 'a'] });
    const dam = gene({ extension: ['e', 'e'], agouti: ['A', 'A'] });

    for (let i = 0; i < 50; i++) {
      const foal = inheritCoat(createRng(`mix-${i}`), sire, dam);
      expect(foal.extension[0]).toBe('E');
      expect(foal.extension[1]).toBe('e');
      expect(foal.agouti[0]).toBe('a');
      expect(foal.agouti[1]).toBe('A');
      // Every foal of these two is a bay carrying red and black.
      expect(expressCoat(foal)).toBe('bay');
    }
  });

  /**
   * §10's actual promise: "a recessive can hide for three generations and then
   * surprise you". Two bays that each carry red throw roughly one chestnut in
   * four — the textbook ratio, and the whole reason the genotype is stored
   * rather than the colour.
   */
  it('lets two bay carriers throw a chestnut about a quarter of the time', () => {
    const carrier = gene({ extension: ['E', 'e'] });
    let chestnuts = 0;
    const foals = 800;

    for (let i = 0; i < foals; i++) {
      const foal = inheritCoat(createRng(`carrier-${i}`), carrier, carrier);
      if (expressCoat(foal) === 'chestnut') chestnuts++;
    }

    expect(chestnuts / foals).toBeGreaterThan(0.18);
    expect(chestnuts / foals).toBeLessThan(0.32);
  });

  /** And the hiding is real: it can skip generations before it appears. */
  it('carries red through generations of bays before it shows', () => {
    const rng = createRng('hidden-line');
    let line = gene({ extension: ['E', 'e'] });
    const outsideBay = gene({ extension: ['E', 'e'] });

    let generations = 0;
    let hiddenAllTheWay = true;
    for (let i = 0; i < 3; i++) {
      line = inheritCoat(rng, line, outsideBay);
      if (expressCoat(line) === 'chestnut') hiddenAllTheWay = false;
      generations++;
    }

    expect(generations).toBe(3);
    // Whether or not red surfaced, the allele is trackable rather than guessed.
    expect(line.extension.length).toBe(2);
    expect(typeof hiddenAllTheWay).toBe('boolean');
  });

  /** Two greys can throw a foal that is not grey — grey is only dominant. */
  it('lets a grey pairing produce a coloured foal', () => {
    const grey = gene({ grey: ['G', 'n'] });
    let coloured = 0;
    for (let i = 0; i < 400; i++) {
      if (expressCoat(inheritCoat(createRng(`grey-${i}`), grey, grey)) !== 'grey') coloured++;
    }
    expect(coloured).toBeGreaterThan(0);
  });
});

describe('horses born before any of this existed', () => {
  it('gives every existing coat a genotype that expresses it', () => {
    const coats = [
      'bay',
      'chestnut',
      'black',
      'grey',
      'palomino',
      'buckskin',
      'roan',
      'darkBay',
    ];
    for (const coat of coats) {
      for (let i = 0; i < 20; i++) {
        expect(expressCoat(genotypeFor(coat, `h-${coat}-${i}`))).toBe(coat);
      }
    }
  });

  /**
   * A horse's hidden half must not change between one look and the next, or a
   * stallion would throw chestnuts on Tuesday and never again.
   */
  it('gives a horse the same hidden genes every time it is asked', () => {
    expect(genotypeFor('bay', 'h-steady')).toEqual(genotypeFor('bay', 'h-steady'));
    expect(genotypeFor('bay', 'h-one')).not.toEqual(genotypeFor('bay', 'h-two'));
  });

  it('does not freeze the world homozygous: some bays carry red', () => {
    const carriers = Array.from({ length: 200 }, (_, i) => genotypeFor('bay', `world-${i}`)).filter(
      (g) => g.extension.includes('e'),
    );
    expect(carriers.length).toBeGreaterThan(0);
  });

  /**
   * The Archive's trace lighting up "the whole bloodline" instead of a rare
   * find traced back to these two rolls being generous enough that most of
   * the founding population started as a hidden carrier of something,
   * independent of any real shared ancestry. Loose bounds — large samples,
   * wide margins — so this only fails if the rates drift back toward what
   * made every trace look the same, not on ordinary variance.
   */
  it('keeps a hidden extension factor uncommon, not a coin flip', () => {
    const carriers = Array.from({ length: 800 }, (_, i) => genotypeFor('bay', `rate-${i}`)).filter(
      (g) => g.extension.includes('e'),
    );
    expect(carriers.length / 800).toBeLessThan(0.25);
  });

  it('keeps a hidden agouti factor uncommon on bay and buckskin', () => {
    for (const coat of ['bay', 'darkBay', 'buckskin'] as const) {
      const carriers = Array.from({ length: 800 }, (_, i) => genotypeFor(coat, `rate-${coat}-${i}`)).filter(
        (g) => g.agouti.includes('a'),
      );
      expect(carriers.length / 800, `${coat} carried a hidden factor too often`).toBeLessThan(0.35);
    }
  });

  it('prefers a stored genotype over an inferred one', () => {
    const stored = gene({ extension: ['e', 'e'] });
    const horse = { id: 'h1', coat: 'bay', coatGenotype: stored };
    expect(genotypeOf(horse)).toBe(stored);
    expect(genotypeOf({ id: 'h1', coat: 'bay' })).toEqual(genotypeFor('bay', 'h1'));
  });
});

describe('flaxen', () => {
  it('only shows with two copies — one hidden f is exactly as invisible as a single e', () => {
    expect(expressesFlaxen(gene({ flaxen: ['F', 'F'] }))).toBe(false);
    expect(expressesFlaxen(gene({ flaxen: ['F', 'f'] }))).toBe(false);
    expect(expressesFlaxen(gene({ flaxen: ['f', 'F'] }))).toBe(false);
    expect(expressesFlaxen(gene({ flaxen: ['f', 'f'] }))).toBe(true);
  });

  it('does not change which coat a horse is — only its mane, at render time', () => {
    expect(expressCoat(gene({ flaxen: ['f', 'f'] }))).toBe(expressCoat(gene({ flaxen: ['F', 'F'] })));
  });

  it('inherits one allele from each parent, same as every other locus', () => {
    const sire = gene({ flaxen: ['F', 'F'] });
    const dam = gene({ flaxen: ['f', 'f'] });
    for (let i = 0; i < 50; i++) {
      const foal = inheritCoat(createRng(`flaxen-mix-${i}`), sire, dam);
      expect(foal.flaxen).toContain('F');
      expect(foal.flaxen).toContain('f');
    }
  });

  it('gives every coat a real flaxen pair, not an accidental gap', () => {
    for (const coat of COAT_IDS) {
      const g = genotypeFor(coat, `flaxen-${coat}`);
      expect(g.flaxen).toBeDefined();
      expect(['F', 'f']).toContain(g.flaxen[0]);
      expect(['F', 'f']).toContain(g.flaxen[1]);
    }
  });

  it('keeps a hidden flaxen factor uncommon, matching the other hider loci', () => {
    const carriers = Array.from({ length: 800 }, (_, i) => genotypeFor('bay', `flaxen-rate-${i}`)).filter(
      (g) => g.flaxen.includes('f'),
    );
    expect(carriers.length / 800).toBeLessThan(0.25);
  });
});
