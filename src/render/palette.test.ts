import { describe, it, expect } from 'vitest';
import { coatFor, coatForHorse } from './palette.js';
import { FLAXEN_HAIR } from '../data/colors.js';
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
  it('returns the plain coat id when the horse does not express flaxen', () => {
    const horse = { id: 'h1', coat: 'bay', coatGenotype: gene() };
    expect(coatForHorse(horse)).toBe('bay');
  });

  it('returns a full Coat with a paled mane when the horse expresses flaxen', () => {
    const horse = { id: 'h2', coat: 'bay', coatGenotype: gene({ flaxen: ['f', 'f'] }) };
    const result = coatForHorse(horse);
    expect(result).not.toBe('bay');
    expect(result).toEqual({ ...coatFor('bay'), hair: FLAXEN_HAIR });
  });

  it('leaves the body colour untouched — only the hair material changes', () => {
    const horse = { id: 'h3', coat: 'palomino', coatGenotype: gene({ flaxen: ['f', 'f'] }) };
    const result = coatForHorse(horse);
    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(result.body).toBe(coatFor('palomino').body);
      expect(result.hair).toBe(FLAXEN_HAIR);
    }
  });

  it('falls back to a derived genotype for a horse with none recorded, without throwing', () => {
    expect(() => coatForHorse({ id: 'h4', coat: 'bay' })).not.toThrow();
  });
});
