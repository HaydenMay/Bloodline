// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Horse } from '../sim/types.js';
import { DEFAULTS } from '../data/colors.js';
import {
  createNewCareer,
  createStable,
  loadStable,
  retireCurrentHorse,
  saveCareer,
} from './career.js';
import { breedFoal, partnersFor, timesBred, toPartner } from './studBook.js';

/**
 * Stage 1's deliverable, end to end: **the loop closes.** Retire, breed, race
 * the foal.
 *
 * Every piece of this has its own unit tests. What none of them can see is the
 * chain — a foal bred from horses that came out of the save, campaigned as a
 * real career, with its parents still findable afterwards. That chain is the
 * whole point of the phase, and it crosses four modules, so it is checked here
 * rather than assumed.
 */

function horse(name: string, gender: 'stallion' | 'mare'): Horse {
  return {
    id: `h-${name}`,
    name,
    gender,
    age: 5,
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

/** Runs a horse's career to its end and banks it into the yard. */
function retire(name: string, gender: 'stallion' | 'mare', peak = 400): void {
  const career = createNewCareer(
    horse(name, gender),
    DEFAULTS.playerSilksDefault,
    loadStable() ?? createStable(),
  );
  career.horseLegacy.peak = peak;
  career.horseLegacy.points = peak;
  career.stats.racesCompleted = 18;
  career.stats.wins = 5;
  saveCareer(career);
  retireCurrentHorse(career);
}

beforeEach(() => {
  localStorage.clear();
});

describe('the loop closes', () => {
  it('retires two horses, breeds them, and campaigns the foal', () => {
    retire('Brash Tide', 'stallion');
    retire('Storm Lantern', 'mare');

    const stable = loadStable()!;
    expect(stable.bloodstock).toHaveLength(2);

    const sire = stable.bloodstock.find((entry) => entry.horse.gender === 'stallion')!;
    const options = partnersFor(stable, sire.horse);
    const dam = options.find((option) => option.source === 'bloodstock')!;
    expect(dam.partner.horse.name).toBe('Storm Lantern');

    const { foal } = breedFoal(stable, toPartner(sire), dam.partner);

    // The foal is a two-year-old maiden with a record of nothing, and it knows
    // where it came from.
    expect(foal.age).toBe(2);
    expect(foal.starts).toBe(0);
    expect(foal.sireId).toBe(sire.horse.id);
    expect(foal.damId).toBe(dam.partner.horse.id);
    expect(foal.generation).toBe(2);

    const career = createNewCareer(foal, DEFAULTS.playerSilksDefault, stable);
    saveCareer(career);

    // And the yard it was bred in is the yard it now races for.
    const reloaded = loadStable()!;
    expect(reloaded.bloodstock).toHaveLength(2);
    expect(timesBred(reloaded, sire.horse, dam.partner.horse)).toBe(1);
  });

  /**
   * §10: the parents are still in the yard afterwards. "A horse leaves the
   * racetrack; it never leaves the yard" — breeding must not consume them, or
   * the pedigree tree in Stage 4 would be drawing horses that no longer exist.
   */
  it('leaves both parents in the bloodstock, ready to breed again', () => {
    retire('Brash Tide', 'stallion');
    retire('Storm Lantern', 'mare');

    const stable = loadStable()!;
    const sire = stable.bloodstock.find((entry) => entry.horse.gender === 'stallion')!;
    const dam = stable.bloodstock.find((entry) => entry.horse.gender === 'mare')!;

    breedFoal(stable, toPartner(sire), toPartner(dam));
    saveCareer(createNewCareer(horse('Filler', 'stallion'), DEFAULTS.playerSilksDefault, stable));

    const reloaded = loadStable()!;
    expect(reloaded.bloodstock.map((entry) => entry.horse.name).sort()).toEqual([
      'Brash Tide',
      'Storm Lantern',
    ]);
    expect(partnersFor(reloaded, sire.horse).length).toBeGreaterThan(0);
  });

  /**
   * The repeat count is what makes the first-cross bonus unfarmable, and it has
   * to survive the save — a count that lived on the career would reset every
   * time a horse retired, which is exactly when breeding happens.
   */
  it('remembers a repeated pairing across a save and a new career', () => {
    retire('Brash Tide', 'stallion');
    retire('Storm Lantern', 'mare');

    const stable = loadStable()!;
    const sire = stable.bloodstock.find((entry) => entry.horse.gender === 'stallion')!;
    const dam = stable.bloodstock.find((entry) => entry.horse.gender === 'mare')!;

    const first = breedFoal(stable, toPartner(sire), toPartner(dam));
    saveCareer(createNewCareer(first.foal, DEFAULTS.playerSilksDefault, stable));

    const afterSave = loadStable()!;
    const second = breedFoal(afterSave, toPartner(sire), toPartner(dam));
    saveCareer(createNewCareer(second.foal, DEFAULTS.playerSilksDefault, afterSave));

    expect(timesBred(loadStable()!, sire.horse, dam.horse)).toBe(2);
    // The base never degrades; only the bonus does.
    expect(second.budget.base).toBe(first.budget.base);
    expect(second.budget.bonus).toBeLessThan(first.budget.bonus);
    expect(second.budget.total).toBeGreaterThanOrEqual(second.budget.base);
  });

  /**
   * A foal is worth more than a horse off the street — that is §1's claim that
   * breeding is the intended path, and it is the reason the whole phase exists.
   */
  it('produces a foal that starts above what its parents started from', () => {
    retire('Brash Tide', 'stallion', 700);
    retire('Storm Lantern', 'mare', 700);

    const stable = loadStable()!;
    const sire = stable.bloodstock.find((entry) => entry.horse.gender === 'stallion')!;
    const dam = stable.bloodstock.find((entry) => entry.horse.gender === 'mare')!;

    const { foal } = breedFoal(stable, toPartner(sire), toPartner(dam));

    const average = (h: Horse): number =>
      (h.potential.speed +
        h.potential.stamina +
        h.potential.burst +
        h.potential.grit +
        h.potential.temper +
        h.potential.consistency) /
      6;

    expect(average(foal)).toBeGreaterThan(average(sire.horse));
  });
});
