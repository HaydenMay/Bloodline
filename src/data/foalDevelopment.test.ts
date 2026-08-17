import { describe, it, expect } from 'vitest';
import { STAT_KEYS, type Horse, type Stats } from '../sim/types.js';
import {
  APTITUDE_STEP,
  BASE_POOL,
  MAX_PER_STAT,
  TRAIT_COST,
  applyDevelopment,
  developmentPool,
  emptyPlan,
  headroomFor,
  latentTraits,
  planCost,
} from './foalDevelopment.js';

function stats(value: number): Stats {
  const out = {} as Stats;
  for (const key of STAT_KEYS) out[key] = value;
  return out;
}

function foalOf(over: Partial<Horse> = {}): Horse {
  return {
    id: 'foal',
    name: 'First Light',
    gender: 'mare',
    age: 2,
    stats: stats(30),
    potential: stats(80),
    style: 'stalker',
    moment: 'late',
    preferredDistance: { min: 1200, max: 1800 },
    traits: ['grinder'],
    condition: 70,
    morale: 60,
    division: 'maiden',
    divisionLevel: 0,
    divisionPoints: 0,
    starts: 0,
    wins: 0,
    places: 0,
    shows: 0,
    coat: 'bay',
    jockeySkill: 60,
    ...over,
  };
}

const noFacilities: Record<string, number> = {};

describe('the pool', () => {
  it('gives every foal the same base, whatever the yard', () => {
    expect(developmentPool(noFacilities)).toBe(BASE_POOL);
  });

  /**
   * The Stud Farm has advertised "+10% breeding potential" since Phase 4 and
   * been read by nothing. This is the promise landing.
   */
  it('grows with the Stud Farm the yard has actually built', () => {
    expect(developmentPool({ stud: 3 })).toBeGreaterThan(developmentPool({ stud: 1 }));
    expect(developmentPool({ stud: 5 })).toBe(Math.round(BASE_POOL * 1.5));
  });

  it('is not swayed by facilities that have nothing to do with foals', () => {
    expect(developmentPool({ barn: 5, training: 5, admin: 5 })).toBe(BASE_POOL);
  });
});

describe('what points buy', () => {
  it('costs a point a stat, a point a step of trip, and ten a trait', () => {
    expect(planCost({ stats: { speed: 4 }, aptitudeShift: 0, traits: [] })).toBe(4);
    expect(planCost({ stats: {}, aptitudeShift: -3, traits: [] })).toBe(3);
    expect(planCost({ stats: {}, aptitudeShift: 0, traits: ['ironLungs'] })).toBe(TRAIT_COST);
  });

  it('raises the stats it was spent on, and nothing else', () => {
    const foal = foalOf();
    const developed = applyDevelopment(foal, {
      stats: { speed: 5 },
      aptitudeShift: 0,
      traits: [],
    });
    expect(developed.stats.speed).toBe(35);
    expect(developed.stats.stamina).toBe(30);
  });

  it('moves the whole preferred range together', () => {
    const developed = applyDevelopment(foalOf(), {
      stats: {},
      aptitudeShift: 2,
      traits: [],
    });
    expect(developed.preferredDistance.min).toBe(1200 + 2 * APTITUDE_STEP);
    expect(developed.preferredDistance.max).toBe(1800 + 2 * APTITUDE_STEP);
  });

  it('leaves the foal untouched when nothing is spent', () => {
    const foal = foalOf();
    const skipped = applyDevelopment(foal, emptyPlan());
    expect(skipped.stats).toEqual(foal.stats);
    expect(skipped.traits).toEqual(foal.traits);
    expect(skipped.preferredDistance).toEqual(foal.preferredDistance);
  });

  it('does not mutate the foal it was given', () => {
    const foal = foalOf();
    applyDevelopment(foal, { stats: { speed: 6 }, aptitudeShift: 1, traits: ['ironLungs'] });
    expect(foal.stats.speed).toBe(30);
    expect(foal.traits).toEqual(['grinder']);
  });
});

/**
 * The line this phase must never cross. The inheritance budget owns potential;
 * a development phase that could raise a ceiling would be a second and much
 * easier budget, which would make the first one pointless.
 */
describe('the ceiling holds', () => {
  it('never pushes a stat past the potential the foal was born with', () => {
    const nearlyThere = foalOf({ stats: stats(78), potential: stats(80) });
    const developed = applyDevelopment(nearlyThere, {
      stats: { speed: MAX_PER_STAT },
      aptitudeShift: 0,
      traits: [],
    });
    expect(developed.stats.speed).toBe(80);
    expect(developed.potential.speed).toBe(80);
  });

  it('offers no headroom on a stat already at its ceiling', () => {
    const maxed = foalOf({ stats: stats(80), potential: stats(80) });
    expect(headroomFor(maxed, emptyPlan(), 'speed', 100)).toBe(0);
  });

  it('caps how much of a pool can land on one stat', () => {
    expect(headroomFor(foalOf(), emptyPlan(), 'speed', 100)).toBe(MAX_PER_STAT);
  });

  it('never offers more than the points left', () => {
    const plan = { stats: { speed: 2 }, aptitudeShift: 0, traits: [] };
    expect(headroomFor(foalOf(), plan, 'stamina', 5)).toBe(3);
  });
});

describe('traits in the blood', () => {
  const sire: Horse = foalOf({ id: 's', traits: ['grinder', 'ironLungs'] });
  const dam: Horse = foalOf({ id: 'd', traits: ['bigGame'] });

  /** Only what an ancestor actually carried; inventing one is what mutation is for. */
  it('offers only what the parents carried and the foal missed', () => {
    const foal = foalOf({ traits: ['grinder'] });
    expect(latentTraits(foal, sire, dam).sort()).toEqual(['bigGame', 'ironLungs']);
  });

  it('offers nothing when the foal already took everything going', () => {
    const foal = foalOf({ traits: ['grinder', 'ironLungs', 'bigGame'] });
    expect(latentTraits(foal, sire, dam)).toEqual([]);
  });

  it('copes with a parent the yard can no longer find', () => {
    expect(latentTraits(foalOf({ traits: [] }), sire, undefined)).toEqual([
      'grinder',
      'ironLungs',
    ]);
  });

  it('adds a coaxed trait without disturbing the inherited ones', () => {
    const developed = applyDevelopment(foalOf({ traits: ['grinder'] }), {
      stats: {},
      aptitudeShift: 0,
      traits: ['ironLungs'],
    });
    expect(developed.traits).toEqual(['grinder', 'ironLungs']);
  });
});
