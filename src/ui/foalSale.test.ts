// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Horse, Stats } from '../sim/types.js';
import { STAT_KEYS } from '../sim/types.js';
import { DEFAULTS } from '../data/colors.js';
import { relatedness } from '../sim/breeding.js';
import { foalSalePrice, releaseAsRival, REJECTION_YEARS } from '../data/foalSale.js';
import {
  createNewCareer,
  createStable,
  loadStable,
  retireCurrentHorse,
  saveCareer,
  type Stable,
} from './career.js';
import { breedFoal, pedigreeOf, partnersFor, sellFoal, toPartner } from './studBook.js';

/**
 * §10's rejected foals: "sold for cash, and they enter the world as rivals
 * carrying your bloodline's name. Pass on a colt for mediocre stamina and you
 * may watch him win a Championship in three years."
 */

function stats(value: number): Stats {
  const out = {} as Stats;
  for (const key of STAT_KEYS) out[key] = value;
  return out;
}

function horse(name: string, gender: 'stallion' | 'mare', potential = 78): Horse {
  return {
    id: `h-${name}`,
    name,
    gender,
    age: 5,
    stats: stats(60),
    potential: stats(potential),
    style: 'stalker',
    moment: 'late',
    preferredDistance: { min: 1200, max: 1800 },
    traits: [],
    condition: 75,
    morale: 65,
    division: 'open',
    divisionLevel: 2,
    divisionPoints: 0,
    starts: 18,
    wins: 5,
    places: 3,
    shows: 2,
    coat: 'bay',
    jockeySkill: 60,
  };
}

function yardWithTwo(): Stable {
  for (const [name, gender] of [
    ['Brash Tide', 'stallion'],
    ['Storm Lantern', 'mare'],
  ] as const) {
    const career = createNewCareer(
      horse(name, gender),
      DEFAULTS.playerSilksDefault,
      loadStable() ?? createStable(),
    );
    career.horseLegacy.peak = 500;
    career.horseLegacy.points = 500;
    saveCareer(career);
    retireCurrentHorse(career);
  }
  return loadStable()!;
}

beforeEach(() => {
  localStorage.clear();
});

describe('what a rejected foal is worth', () => {
  it('pays for the ceilings it has, since it has nothing else', () => {
    expect(foalSalePrice(horse('Modest', 'mare', 60))).toBeLessThan(
      foalSalePrice(horse('Grand', 'mare', 90)),
    );
  });

  it('pays nothing at all for a foal with no promise', () => {
    expect(foalSalePrice(horse('Hopeless', 'mare', 45))).toBe(0);
  });
});

describe('a foal turned loose in the world', () => {
  it('arrives grown, raced by somebody else, rather than as the two-year-old you rejected', () => {
    const foal = { ...horse('Passed', 'stallion', 88), age: 2, starts: 0, wins: 0 };
    for (const key of STAT_KEYS) foal.stats[key] = 30;

    const rival = releaseAsRival(foal);
    expect(rival.age).toBe(4);
    expect(rival.starts).toBeGreaterThan(0);
    for (const key of STAT_KEYS) {
      expect(rival.stats[key]).toBeGreaterThan(foal.stats[key]);
      expect(rival.stats[key]).toBeLessThanOrEqual(rival.potential[key]);
    }
  });

  it('lands in a division its strength justifies', () => {
    const weak = releaseAsRival({ ...horse('Weak', 'mare', 40), age: 2 });
    const strong = releaseAsRival({ ...horse('Strong', 'mare', 95), age: 2 });
    expect(strong.divisionLevel).toBeGreaterThan(weak.divisionLevel);
  });

  /**
   * The whole point of releasing rather than deleting: it is still family. The
   * tree has to be able to draw it, and breeding back to it years later has to
   * read as the close relation it is.
   */
  it('keeps every scrap of its ancestry', () => {
    const stable = yardWithTwo();
    const sire = stable.bloodstock.find((e) => e.horse.gender === 'stallion')!;
    const dam = stable.bloodstock.find((e) => e.horse.gender === 'mare')!;
    const { foal } = breedFoal(stable, toPartner(sire), toPartner(dam));

    const { released } = sellFoal(stable, foal);

    expect(released.sireId).toBe(sire.horse.id);
    expect(released.damId).toBe(dam.horse.id);
    expect(released.generation).toBe(foal.generation);
    expect(released.coatGenotype).toEqual(foal.coatGenotype);

    // And it is findable, so relatedness sees it for what it is.
    expect(pedigreeOf(stable)(released.id)).toBeDefined();
    expect(relatedness(sire.horse, released, pedigreeOf(stable))).toBeGreaterThan(0.4);
  });

  it('joins the world where the player will meet it', () => {
    const stable = yardWithTwo();
    const before = stable.world.length;
    const sire = stable.bloodstock.find((e) => e.horse.gender === 'stallion')!;
    const dam = stable.bloodstock.find((e) => e.horse.gender === 'mare')!;

    const { foal } = breedFoal(stable, toPartner(sire), toPartner(dam));
    const { released } = sellFoal(stable, foal);

    expect(stable.world.length).toBe(before + 1);
    expect(stable.world.some((h) => h.id === released.id)).toBe(true);
  });
});

describe('what passing on a foal costs', () => {
  it('pays the yard, and ages every horse at stud by a covering season', () => {
    const stable = yardWithTwo();
    const cashBefore = stable.cash;
    const agesBefore = stable.bloodstock.map((e) => e.horse.age);

    const sire = stable.bloodstock.find((e) => e.horse.gender === 'stallion')!;
    const dam = stable.bloodstock.find((e) => e.horse.gender === 'mare')!;
    const { foal } = breedFoal(stable, toPartner(sire), toPartner(dam));
    const { price } = sellFoal(stable, foal);

    expect(stable.cash).toBe(cashBefore + price);
    stable.bloodstock.forEach((entry, i) => {
      expect(entry.horse.age).toBe(agesBefore[i]! + REJECTION_YEARS);
    });
  });

  /**
   * §10: "rerolling burns your best sire's remaining years, so the reroll grind
   * eats the thing it depends on." Without that brake, a free pairing inside
   * your own yard would print cash forever.
   */
  it('eventually rerolls a yard out of horses to breed with', () => {
    const stable = yardWithTwo();
    const sire = stable.bloodstock.find((e) => e.horse.gender === 'stallion')!;
    const dam = stable.bloodstock.find((e) => e.horse.gender === 'mare')!;

    let rerolls = 0;
    while (partnersFor(stable, sire.horse).length > 0 && rerolls < 100) {
      const { foal } = breedFoal(stable, toPartner(sire), toPartner(dam));
      sellFoal(stable, foal);
      rerolls++;
    }

    expect(rerolls).toBeLessThan(100);
    expect(partnersFor(stable, sire.horse).length).toBe(0);
  });
});
