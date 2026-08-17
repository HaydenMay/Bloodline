import { describe, it, expect } from 'vitest';
import { createRng } from '../sim/rng.js';
import { STAT_KEYS, type Horse, type StatKey, type Stats } from '../sim/types.js';
import {
  BASE_POOL,
  PRIMARY_SHARE,
  TRAIT_COST_SHARE,
  applyYear,
  developmentPool,
  latentTraits,
  resolveYear,
  totalGain,
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

/** Averages a stat's gain over many years, so the systematic part is what shows. */
function meanGain(key: StatKey, plan: Parameters<typeof resolveYear>[2], pool = 24): number {
  let total = 0;
  const runs = 300;
  for (let i = 0; i < runs; i++) {
    total += resolveYear(createRng(`y-${key}-${i}`), foalOf(), plan, pool).gains[key] ?? 0;
  }
  return total / runs;
}

describe('what the year is worth', () => {
  it('gives every foal the same base, whatever the yard', () => {
    expect(developmentPool({})).toBe(BASE_POOL);
  });

  /**
   * The Stud Farm has advertised "+10% breeding potential" since Phase 4 and
   * been read by nothing. This is that promise landing.
   */
  it('grows with the Stud Farm the yard actually built', () => {
    expect(developmentPool({ stud: 3 })).toBeGreaterThan(developmentPool({ stud: 1 }));
  });

  it('grows with the gallops and the trainer, at a share of their racing effect', () => {
    expect(developmentPool({ training: 5 })).toBeGreaterThan(BASE_POOL);
    expect(developmentPool({}, 5)).toBeGreaterThan(BASE_POOL);
    // A yearling is not in full work, so the gallops count for less than they
    // do for a horse in training.
    expect(developmentPool({ training: 5 })).toBeLessThan(Math.round(BASE_POOL * 1.5));
  });

  it('is not swayed by facilities with nothing to do with foals', () => {
    expect(developmentPool({ barn: 5, medical: 5, admin: 5 })).toBe(BASE_POOL);
  });
});

describe('a year of rearing', () => {
  it('puts most of the year where it was aimed', () => {
    const focused = meanGain('speed', { primary: 'speed', secondary: null });
    const ignored = meanGain('stamina', { primary: 'speed', secondary: null });
    expect(focused).toBeGreaterThan(ignored * 2);
  });

  it('gives the second focus less than the first, and more than the rest', () => {
    const plan = { primary: 'speed' as StatKey, secondary: 'stamina' as StatKey };
    const first = meanGain('speed', plan);
    const second = meanGain('stamina', plan);
    const rest = meanGain('grit', plan);
    expect(first).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(rest);
  });

  /**
   * §10 wants the phase "fully skippable for anyone who just wants to race". A
   * skip that produced nothing would make skipping a punishment rather than a
   * choice — the foal still grew, it just grew however it liked.
   */
  it('still brings a skipped foal along, just less and evenly', () => {
    const skipped = resolveYear(createRng('skip'), foalOf(), null, 24);
    expect(totalGain(skipped)).toBeGreaterThan(0);

    let focusedTotal = 0;
    let skippedTotal = 0;
    for (let i = 0; i < 200; i++) {
      focusedTotal += totalGain(
        resolveYear(createRng(`f-${i}`), foalOf(), { primary: 'speed', secondary: null }, 24),
      );
      skippedTotal += totalGain(resolveYear(createRng(`f-${i}`), foalOf(), null, 24));
    }
    expect(skippedTotal).toBeGreaterThan(0);
    expect(skippedTotal).toBeLessThan(focusedTotal);
  });

  /** Bounded variance: the plan must still mean something. */
  it('sometimes goes unusually well, and sometimes badly', () => {
    let breakthroughs = 0;
    let setbacks = 0;
    for (let i = 0; i < 400; i++) {
      const year = resolveYear(
        createRng(`e-${i}`),
        foalOf(),
        { primary: 'speed', secondary: null },
        24,
      );
      if (year.event === 'breakthrough') breakthroughs++;
      if (year.event === 'setback') setbacks++;
    }
    expect(breakthroughs).toBeGreaterThan(0);
    expect(setbacks).toBeGreaterThan(0);
    // Never both at once, and most years are ordinary.
    expect(breakthroughs + setbacks).toBeLessThan(400 * 0.45);
  });

  it('lands an event on the stat the year was aimed at', () => {
    for (let i = 0; i < 200; i++) {
      const year = resolveYear(
        createRng(`w-${i}`),
        foalOf(),
        { primary: 'grit', secondary: null },
        24,
      );
      if (year.event) expect(year.eventStat).toBe('grit');
    }
  });

  it('never delivers wildly more than the year was worth', () => {
    for (let i = 0; i < 200; i++) {
      const year = resolveYear(
        createRng(`c-${i}`),
        foalOf(),
        { primary: 'speed', secondary: 'stamina' },
        24,
      );
      expect(totalGain(year)).toBeLessThan(24 * 1.6);
    }
  });
});

/**
 * The line this phase must never cross. The inheritance budget owns potential;
 * a development year that could raise a ceiling would be a second and much
 * easier budget, which would make the first one pointless.
 */
describe('the ceiling holds', () => {
  it('never pushes a stat past the potential the foal was born with', () => {
    const nearlyThere = foalOf({ stats: stats(79), potential: stats(80) });
    for (let i = 0; i < 100; i++) {
      const year = resolveYear(
        createRng(`cap-${i}`),
        nearlyThere,
        { primary: 'speed', secondary: null },
        60,
      );
      const developed = applyYear(nearlyThere, year);
      for (const key of STAT_KEYS) expect(developed.stats[key]).toBeLessThanOrEqual(80);
      expect(developed.potential).toEqual(nearlyThere.potential);
    }
  });

  /**
   * Pouring a year into a stat that was already finished is exactly the mistake
   * this screen should let a player learn from, so the waste is reported rather
   * than quietly vanishing.
   */
  it('reports growth that had nowhere to go', () => {
    const maxed = foalOf({ stats: stats(80), potential: stats(80) });
    const year = resolveYear(createRng('waste'), maxed, { primary: 'speed', secondary: null }, 30);
    expect(totalGain(year)).toBe(0);
    expect(year.wasted).toBeGreaterThan(0);
  });

  it('does not mutate the foal it was given', () => {
    const foal = foalOf();
    const year = resolveYear(createRng('pure'), foal, { primary: 'speed', secondary: null }, 24);
    applyYear(foal, year, 'ironLungs');
    expect(foal.stats.speed).toBe(30);
    expect(foal.traits).toEqual(['grinder']);
  });
});

describe('the decision at the end', () => {
  const sire = foalOf({ id: 's', traits: ['grinder', 'ironLungs'] });
  const dam = foalOf({ id: 'd', traits: ['bigGame'] });

  it('offers only what the parents carried and the foal missed', () => {
    expect(latentTraits(foalOf({ traits: ['grinder'] }), sire, dam).sort()).toEqual([
      'bigGame',
      'ironLungs',
    ]);
  });

  it('offers nothing when the foal took everything going', () => {
    const foal = foalOf({ traits: ['grinder', 'ironLungs', 'bigGame'] });
    expect(latentTraits(foal, sire, dam)).toEqual([]);
  });

  it('copes with a parent the yard can no longer find', () => {
    expect(latentTraits(foalOf({ traits: [] }), sire, undefined)).toEqual([
      'grinder',
      'ironLungs',
    ]);
  });

  /** Taking a trait spends the rest of the year, so it has to cost real growth. */
  it('costs a real share of the year to bring a trait out', () => {
    const foal = foalOf();
    const plan = { primary: 'speed' as StatKey, secondary: null };
    const full = resolveYear(createRng('trait'), foal, plan, 24);
    const reduced = resolveYear(createRng('trait'), foal, plan, Math.round(24 * (1 - TRAIT_COST_SHARE)));

    expect(totalGain(reduced)).toBeLessThan(totalGain(full));

    const developed = applyYear(foal, reduced, 'ironLungs');
    expect(developed.traits).toEqual(['grinder', 'ironLungs']);
  });

  it('adds a coaxed trait without disturbing the inherited ones', () => {
    const year = resolveYear(createRng('t2'), foalOf(), null, 24);
    expect(applyYear(foalOf({ traits: ['grinder'] }), year, 'ironLungs').traits).toEqual([
      'grinder',
      'ironLungs',
    ]);
  });
});

describe('the shares add up', () => {
  it('keeps the primary share the dominant one', () => {
    expect(PRIMARY_SHARE).toBeGreaterThan(0.4);
    expect(PRIMARY_SHARE).toBeLessThan(0.7);
  });
});
