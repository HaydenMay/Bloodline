import { describe, it, expect } from 'vitest';
import { coatFor, coatForHorse, hairRampFor, HAIR_MUTATION_CHANCE } from './palette.js';
import { FLAXEN_HAIR } from '../data/colors.js';
import { COAT_IDS } from '../data/index.js';
import type { CoatGenotype } from '../sim/coat.js';

const gene = (over: Partial<CoatGenotype> = {}): CoatGenotype => ({
  extension: ['E', 'E'],
  agouti: ['A', 'A'],
  cream: ['n', 'n'],
  grey: ['n', 'n'],
  roan: ['n', 'n'],
  flaxen: ['F', 'F'],
  ...over,
});

describe('coatForHorse', () => {
  it('always returns a full Coat, body colour untouched, for every coat', () => {
    for (const coat of COAT_IDS) {
      const horse = { id: `h-${coat}`, coat, coatGenotype: gene() };
      const result = coatForHorse(horse);
      expect(result.body).toBe(coatFor(coat).body);
    }
  });

  it('gives a paled mane when the horse expresses flaxen, overriding any mutation roll', () => {
    const horse = { id: 'h2', coat: 'bay', coatGenotype: gene({ flaxen: ['f', 'f'] }) };
    expect(coatForHorse(horse).hair).toBe(FLAXEN_HAIR);
  });

  it('is stable for the same horse — the same id always resolves the same mane', () => {
    const horse = { id: 'stable-id-example', coat: 'roan', coatGenotype: gene() };
    const first = coatForHorse(horse).hair;
    const second = coatForHorse({ ...horse }).hair;
    expect(second).toBe(first);
  });

  it('falls back to a derived genotype for a horse with none recorded, without throwing', () => {
    expect(() => coatForHorse({ id: 'h4', coat: 'bay' })).not.toThrow();
  });

  /**
   * The point of this whole mechanism (ROADMAP.md): only 8 coats, each
   * previously locked to one fixed mane, meant 99.9% of eight-horse fields
   * shared an exact look. Sampled across many ids, the same coat should not
   * always resolve to the same mane any more.
   */
  it('varies the mane across different horses of the same coat', () => {
    const manes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      manes.add(coatForHorse({ id: `sample-${i}`, coat: 'bay', coatGenotype: gene() }).hair);
    }
    expect(manes.size).toBeGreaterThan(1);
  });

  /**
   * Every non-flaxen mane is a real, named colour — either from the coat's
   * own ramp (`hairRampFor`) or, on the rare mutation roll, another coat's
   * default hair. Never an arbitrary value: a "mutation" still has to be a
   * colour that belongs to some real horse in the game.
   */
  it('only ever picks a mane from the coat\'s own ramp or another coat\'s default', () => {
    const validMutationHairs = new Set(COAT_IDS.map((c) => coatFor(c).hair));
    for (let i = 0; i < 300; i++) {
      const hair = coatForHorse({ id: `valid-${i}`, coat: 'grey', coatGenotype: gene() }).hair;
      const inOwnRamp = hairRampFor('grey').includes(hair);
      expect(inOwnRamp || validMutationHairs.has(hair)).toBe(true);
    }
  });

  /**
   * `HAIR_MUTATION_CHANCE` (0.08) should land in the right neighbourhood over
   * enough samples — a wide tolerance band, since this is a statistical
   * property of a hash-derived roll rather than a seeded RNG stream.
   */
  it('rolls a cross-coat mutation at roughly HAIR_MUTATION_CHANCE', () => {
    let mutations = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      const hair = coatForHorse({ id: `rate-${i}`, coat: 'chestnut', coatGenotype: gene() }).hair;
      if (!hairRampFor('chestnut').includes(hair)) mutations += 1;
    }
    const rate = mutations / trials;
    expect(rate).toBeGreaterThan(HAIR_MUTATION_CHANCE * 0.5);
    expect(rate).toBeLessThan(HAIR_MUTATION_CHANCE * 1.5);
  });
});

describe('hairRampFor', () => {
  it('gives every coat a non-empty, de-duplicated ramp', () => {
    for (const coat of COAT_IDS) {
      const ramp = hairRampFor(coat);
      expect(ramp.length).toBeGreaterThan(0);
      expect(new Set(ramp).size).toBe(ramp.length);
    }
  });

  it('includes the coat\'s own natural mane colour', () => {
    expect(hairRampFor('bay')).toContain(coatFor('bay').hair);
  });
});
