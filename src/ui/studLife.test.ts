// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Horse } from '../sim/types.js';
import { DEFAULTS } from '../data/colors.js';
import { BREEDING_MAX_AGE, canBreed } from '../sim/breeding.js';
import { studFee } from '../data/studFee.js';
import { getStakeOptions, MAX_STAKE_SHARE } from '../data/wagering.js';
import {
  STUD_INFLUENCE_SHARE,
  BREEDING_ADVANCE_AGE,
  createNewCareer,
  createStable,
  loadStable,
  retireCurrentHorse,
  saveCareer,
  studInfluence,
  takeStudInfluence,
  type Stable,
} from './career.js';
import { breedFoal, partnersFor, toPartner } from './studBook.js';

/**
 * Stage 2: what a stud life costs and what it earns.
 *
 * Retired horses age into ineligibility, outside partners are priced on what
 * they actually give a foal, and a Hall of Fame horse keeps paying its yard in
 * prestige long after it has stopped racing.
 */

function horse(name: string, gender: 'stallion' | 'mare', age = 5): Horse {
  return {
    id: `h-${name}`,
    name,
    gender,
    age,
    stats: { speed: 60, stamina: 60, burst: 60, grit: 60, temper: 60, consistency: 60 },
    potential: { speed: 78, stamina: 84, burst: 70, grit: 80, temper: 66, consistency: 74 },
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

function retire(name: string, gender: 'stallion' | 'mare', peak = 400, age = 5): Stable {
  const career = createNewCareer(
    horse(name, gender, age),
    DEFAULTS.playerSilksDefault,
    loadStable() ?? createStable('studLife-1'),
  );
  career.horseLegacy.peak = peak;
  career.horseLegacy.points = peak;
  career.horseLegacy.hallOfFame = peak >= 1000;
  career.stats.racesCompleted = 18;
  saveCareer(career);
  return retireCurrentHorse(career);
}

beforeEach(() => {
  localStorage.clear();
});

describe('retired horses age', () => {
  /**
   * The bump is BREEDING_ADVANCE_AGE - the retiring horse's own age, floored
   * at 0, not a flat number: a horse retired at its natural peak (5) barely
   * costs the rest of the yard anything (6-5=1), while one retired at debut
   * age still costs the full 4 (6-2=4) — matching what the old flat constant
   * always charged for the fast reroll-and-retire case specifically.
   */
  it('advances every horse at stud by BREEDING_ADVANCE_AGE minus the retiring horse\'s age', () => {
    retire('Brash Tide', 'stallion');
    const first = loadStable()!.bloodstock[0]!;
    expect(first.horse.age).toBe(5);

    retire('Storm Lantern', 'mare'); // retires at age 5 -> bump of 1
    const aged = loadStable()!.bloodstock.find((e) => e.horse.name === 'Brash Tide')!;
    expect(aged.horse.age).toBe(5 + (BREEDING_ADVANCE_AGE - 5));
  });

  it('never ages the rest of the yard backwards for a horse retired past BREEDING_ADVANCE_AGE', () => {
    retire('Brash Tide', 'stallion');
    retire('Storm Lantern', 'mare', 400, 9); // well past BREEDING_ADVANCE_AGE
    const untouched = loadStable()!.bloodstock.find((e) => e.horse.name === 'Brash Tide')!;
    expect(untouched.horse.age).toBe(5);
  });

  /**
   * §10's whole breeding lifespan: a horse retired at five breeds at 5, 9, 13,
   * 17 and 21, then never again. Without ageing it would breed forever, which
   * removes the pressure that makes a yard keep retiring new horses into stud.
   * Fillers retire young (debut age) here specifically to hit the full
   * BREEDING_ADVANCE_AGE bump each time, same as the old flat constant did —
   * a yard that instead plays every filler out to a full career ages its
   * older studs far more slowly, which is the intended trade-off, not a bug.
   */
  it('eventually ages a sire out of the stud book entirely', () => {
    retire('Old Guard', 'stallion');
    for (let career = 0; career < 5; career++) retire(`Filler ${career}`, 'mare', 400, 2);

    const veteran = loadStable()!.bloodstock.find((e) => e.horse.name === 'Old Guard')!;
    expect(veteran.horse.age).toBeGreaterThanOrEqual(BREEDING_MAX_AGE);
    expect(canBreed(veteran.horse)).toBe(false);

    // And it is gone from what the yard is offered, rather than listed and dead.
    const mare = loadStable()!.bloodstock.find((e) => e.horse.gender === 'mare')!;
    const offered = partnersFor(loadStable()!, mare.horse).map((o) => o.partner.horse.name);
    expect(offered).not.toContain('Old Guard');
  });
});

describe('stud influence', () => {
  it('pays nothing for a yard with no Hall of Fame horse', () => {
    retire('Plain Runner', 'stallion', 400);
    expect(studInfluence(loadStable()!)).toBe(0);
  });

  /** §1: enshrining a horse is the most valuable thing a career can produce. */
  it('pays a share of what an enshrined horse banked, every career', () => {
    retire('Immortal', 'stallion', 1200);
    const stable = loadStable()!;
    const enshrined = stable.bloodstock[0]!;
    expect(enshrined.hallOfFame).toBe(true);

    const expected = Math.round(enshrined.legacyBanked * STUD_INFLUENCE_SHARE);
    expect(studInfluence(stable)).toBe(expected);

    // It lands on the yard's prestige when the next career ends.
    const before = stable.legacy.archivedPoints;
    retire('Next Up', 'mare', 200);
    const after = loadStable()!;
    expect(after.legacy.archivedPoints).toBeGreaterThan(before);
    expect(takeStudInfluence()).toBeGreaterThan(0);
  });

  it('pays in prestige and never in cash', () => {
    retire('Immortal', 'stallion', 1200);
    const cashBefore = loadStable()!.cash;
    retire('Next Up', 'mare', 200);
    expect(loadStable()!.cash).toBe(cashBefore);
  });

  /**
   * It fades with the taper, so the faucet closes rather than running
   * forever. Fillers retire young (age 2) to hit the full
   * BREEDING_ADVANCE_AGE bump each time, same as `YEARS_PER_CAREER` always
   * did — a yard playing every filler out to a full career ages Immortal
   * out far more slowly, which is now the intended trade-off.
   */
  it('stops once the horse is past breeding age', () => {
    retire('Immortal', 'stallion', 1200);
    for (let career = 0; career < 5; career++) retire(`Filler ${career}`, 'mare', 100, 2);
    expect(studInfluence(loadStable()!)).toBe(0);
  });
});

describe('stud fees', () => {
  const cheap = horse('Modest', 'stallion');
  const grand = {
    ...horse('Elite', 'stallion'),
    potential: { speed: 96, stamina: 94, burst: 95, grit: 93, temper: 92, consistency: 95 },
  };

  it('charges more for a better horse', () => {
    expect(studFee(grand, 525)).toBeGreaterThan(studFee(cheap, 60));
  });

  it('prices potential as well as record, so two equal records still differ', () => {
    expect(studFee(grand, 300)).toBeGreaterThan(studFee(cheap, 300));
  });

  /** §10: your own horses are free, forever, Hall of Fame or not. */
  it('never charges for a horse in your own yard', () => {
    retire('Brash Tide', 'stallion');
    retire('Storm Lantern', 'mare');
    const stable = loadStable()!;
    const mine = stable.bloodstock.find((e) => e.horse.gender === 'mare')!;

    const own = partnersFor(stable, mine.horse).filter((o) => o.source === 'bloodstock');
    expect(own.length).toBeGreaterThan(0);
    for (const option of own) expect(option.fee).toBe(0);
  });

  it('charges for an outside stud, and takes it out of the yard', () => {
    retire('Brash Tide', 'stallion');
    const stable = loadStable()!;
    stable.cash = 500_000;

    const mine = stable.bloodstock[0]!;
    const outside = partnersFor(stable, mine.horse).find((o) => o.source === 'outside');
    expect(outside).toBeDefined();
    expect(outside!.fee).toBeGreaterThan(0);

    const before = stable.cash;
    // Breeding through the stud book is what charges, so no screen can skip it.
    breedFoal(stable, toPartner(mine), outside!.partner, outside!.fee);
    expect(stable.cash).toBe(before - outside!.fee);
  });

  /**
   * The escape hatch has to stay open. A yard whose own line has dead-ended
   * must always be offered something it can pay for, or breeding stops being
   * available at exactly the moment it is needed.
   */
  it('always offers a poor yard something it can afford', () => {
    retire('Brash Tide', 'stallion');
    const stable = loadStable()!;
    stable.cash = 2_000;

    const options = partnersFor(stable, stable.bloodstock[0]!.horse);
    expect(options.some((option) => option.fee <= stable.cash)).toBe(true);
  });
});

describe('what a bet may stake', () => {
  /**
   * The hole this closes: the ladder ran to $10,000 in every division, so a
   * Maiden race with a $5,000 purse could pay $25,000 — betting outpaid
   * winning, in the division where the player's own horse is easiest to read.
   */
  it('keeps a maiden stake proportional to a maiden purse', () => {
    const stakes = getStakeOptions(100_000, 5_000);
    expect(Math.max(...stakes)).toBeLessThanOrEqual(5_000 * MAX_STAKE_SHARE);
  });

  it('still allows a real bet in a championship', () => {
    const stakes = getStakeOptions(100_000, 100_000);
    expect(Math.max(...stakes)).toBe(10_000);
  });

  it('never offers more than the yard holds', () => {
    expect(getStakeOptions(700, 100_000)).toEqual([500]);
  });

  it('offers something rather than nothing in a small race', () => {
    const stakes = getStakeOptions(50_000, 1_200);
    expect(stakes.length).toBeGreaterThan(0);
    expect(stakes[0]).toBeLessThanOrEqual(300);
  });
});
