// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Horse } from '../sim/types.js';
import {
  createNewCareer,
  createStable,
  loadCareer,
  loadStable,
  retireCurrentHorse,
  saveCareer,
} from './career.js';
import { DEFAULTS } from '../data/colors.js';

function horse(name = 'Runner'): Horse {
  return {
    id: `h-${name}`,
    name,
    gender: 'stallion',
    age: 3,
    stats: { speed: 50, stamina: 50, burst: 50, grit: 50, temper: 50, consistency: 50 },
    potential: { speed: 80, stamina: 80, burst: 80, grit: 80, temper: 80, consistency: 80 },
    style: 'stalker',
    moment: 'late',
    preferredDistance: { min: 1200, max: 1800 },
    traits: [],
    condition: 75,
    morale: 65,
    division: 'maiden',
    divisionLevel: 0,
    divisionPoints: 0,
    starts: 0,
    wins: 0,
    places: 0,
    shows: 0,
    coat: 'bay',
    jockeySkill: 60,
  };
}

beforeEach(() => {
  localStorage.clear();
});

/**
 * Phase 4's deliverable is "careers connect — run 2 opens stronger than run 1".
 * These cover the chain that makes that true.
 */
describe('the stable outlives the horse', () => {
  it('carries facilities, staff, cash and prestige into the next career', () => {
    const first = createNewCareer(horse('First'), DEFAULTS.playerSilksDefault, createStable());
    first.stable.cash = 250_000;
    first.stable.facilities.barn = 3;
    first.stable.staff.trainer.level = 4;
    first.stable.consumables.bran_mash = 2;
    first.horseLegacy.peak = 300;
    saveCareer(first);

    retireCurrentHorse(first);

    const second = createNewCareer(horse('Second'), DEFAULTS.playerSilksDefault);
    expect(second.stable.cash).toBe(250_000);
    expect(second.stable.facilities.barn).toBe(3);
    expect(second.stable.staff.trainer.level).toBe(4);
    expect(second.stable.consumables.bran_mash).toBe(2);
  });

  /**
   * §8: "chasing one more purse is a real gamble that costs future value".
   * Banking the peak made running a horse into the ground free, so the yard
   * banks what the horse still holds instead.
   */
  it('banks only what a faded horse still holds, not its peak', () => {
    const first = createNewCareer(horse('First'), DEFAULTS.playerSilksDefault, createStable());
    first.horseLegacy.peak = 420;
    first.horseLegacy.points = 90;
    saveCareer(first);

    retireCurrentHorse(first);

    const second = createNewCareer(horse('Second'), DEFAULTS.playerSilksDefault);
    expect(second.stable.legacy.archivedPoints).toBe(90);
  });

  it('pays a bonus for retiring on top', () => {
    const career = createNewCareer(horse('Sound'), DEFAULTS.playerSilksDefault, createStable());
    career.horseLegacy.peak = 400;
    career.horseLegacy.points = 400;
    saveCareer(career);

    const stable = retireCurrentHorse(career);
    // 400 held plus the 20% sound-retirement bonus.
    expect(stable.legacy.archivedPoints).toBe(480);
    expect(stable.bloodstock[0]!.retirementReason).toBe('sound');
  });

  /** §6: the injury costs the racing career, never the breeding value. */
  it('banks the full peak when a career is ended by injury', () => {
    const career = createNewCareer(horse('Unlucky'), DEFAULTS.playerSilksDefault, createStable());
    career.horseLegacy.peak = 300;
    career.horseLegacy.points = 120;
    career.careerEndedByInjury = true;
    saveCareer(career);

    const stable = retireCurrentHorse(career);
    expect(stable.legacy.archivedPoints).toBe(300);
    expect(stable.bloodstock[0]!.retirementReason).toBe('injured');
  });

  it('records what each horse actually banked alongside its peak', () => {
    const career = createNewCareer(horse('Faded'), DEFAULTS.playerSilksDefault, createStable());
    career.horseLegacy.peak = 500;
    career.horseLegacy.points = 200;
    saveCareer(career);

    const stable = retireCurrentHorse(career);
    expect(stable.bloodstock[0]!.legacyPeak).toBe(500);
    expect(stable.bloodstock[0]!.legacyBanked).toBe(200);
  });

  it('accumulates prestige across several horses', () => {
    let stable = createStable();
    for (const points of [100, 250, 75]) {
      const career = createNewCareer(horse(`H${points}`), DEFAULTS.playerSilksDefault, stable);
      career.horseLegacy.peak = points;
      career.horseLegacy.points = points;
      saveCareer(career);
      stable = retireCurrentHorse(career);
    }
    // Each retired on top, so each banked its legacy plus 20%.
    expect(stable.legacy.archivedPoints).toBe(100 + 20 + 250 + 50 + 75 + 15);
    expect(stable.careersCompleted).toBe(3);
  });

  it('clears the career but leaves the yard standing', () => {
    const career = createNewCareer(horse(), DEFAULTS.playerSilksDefault, createStable());
    career.stable.cash = 99_000;
    saveCareer(career);

    retireCurrentHorse(career);

    expect(loadCareer()).toBeNull();
    expect(loadStable()?.cash).toBe(99_000);
  });

  it('gives a brand-new player a fresh yard rather than nothing', () => {
    const career = createNewCareer(horse(), DEFAULTS.playerSilksDefault);
    expect(career.stable.cash).toBeGreaterThan(0);
    expect(career.stable.staff.trainer.level).toBe(1);
    expect(career.stable.careersCompleted).toBe(0);
  });

  it('keeps the dossier, so rivals are remembered across careers', () => {
    const first = createNewCareer(horse('First'), DEFAULTS.playerSilksDefault, createStable());
    first.stable.dossier.rival1 = {
      name: 'Zenith',
      wins: 3,
      places: 1,
      shows: 0,
      starts: 6,
      division: 'open',
      lastSeen: 4,
      meetings: 5,
      beaten: 2,
    };
    saveCareer(first);
    retireCurrentHorse(first);

    const second = createNewCareer(horse('Second'), DEFAULTS.playerSilksDefault);
    expect(second.stable.dossier.rival1?.name).toBe('Zenith');
    expect(second.stable.dossier.rival1?.meetings).toBe(5);
  });
});

describe('migrating older saves', () => {
  it('moves cash off the career and onto the yard', () => {
    // A save written before the split, with the currency on career.stats.
    const career = createNewCareer(horse(), DEFAULTS.playerSilksDefault, createStable());
    const raw = JSON.parse(JSON.stringify({ version: 1, data: career }));
    raw.data.stats.cash = 61_000;
    delete raw.data.stable.cash;
    localStorage.setItem('bloodline_career', JSON.stringify(raw));
    localStorage.removeItem('bloodline_stable');

    const loaded = loadCareer()!;
    expect(loaded.stable.cash).toBe(61_000);
    expect((loaded.stats as unknown as { cash?: number }).cash).toBeUndefined();
  });

  /** Reputation was replaced by prestige; a save carrying it must not keep it. */
  it('drops reputation from a save written before prestige became the gate', () => {
    const career = createNewCareer(horse(), DEFAULTS.playerSilksDefault, createStable());
    const raw = JSON.parse(JSON.stringify({ version: 1, data: career }));
    raw.data.stable.reputation = 140;
    raw.data.stats.reputation = 33;
    localStorage.setItem('bloodline_career', JSON.stringify(raw));
    localStorage.removeItem('bloodline_stable');

    const loaded = loadCareer()!;
    expect((loaded.stable as unknown as { reputation?: number }).reputation).toBeUndefined();
    expect((loaded.stats as unknown as { reputation?: number }).reputation).toBeUndefined();
  });

  it('fills in staff and consumables missing from an older stable', () => {
    const career = createNewCareer(horse(), DEFAULTS.playerSilksDefault, createStable());
    const raw = JSON.parse(JSON.stringify({ version: 1, data: career }));
    delete raw.data.stable.staff;
    delete raw.data.stable.consumables;
    localStorage.setItem('bloodline_career', JSON.stringify(raw));
    localStorage.removeItem('bloodline_stable');

    const loaded = loadCareer()!;
    expect(loaded.stable.staff.jockey.level).toBe(1);
    expect(loaded.stable.consumables).toEqual({});
  });

  it('prefers the separately saved yard over the copy inside the career', () => {
    const career = createNewCareer(horse(), DEFAULTS.playerSilksDefault, createStable());
    career.stable.cash = 5_000;
    saveCareer(career);

    // The yard moves on — a later screen banked more cash into it.
    const yard = loadStable()!;
    yard.cash = 80_000;
    localStorage.setItem('bloodline_stable', JSON.stringify({ version: 1, data: yard }));

    expect(loadCareer()!.stable.cash).toBe(80_000);
  });
});

describe('bloodstock', () => {
  it('keeps the retired horse itself, not just a number', () => {
    const career = createNewCareer(horse('Zenith'), DEFAULTS.playerSilksDefault, createStable());
    career.horse.stats.speed = 88;
    career.stats.wins = 7;
    career.stats.racesCompleted = 15;
    career.horseLegacy.peak = 310;
    saveCareer(career);

    const stable = retireCurrentHorse(career);
    expect(stable.bloodstock).toHaveLength(1);

    const entry = stable.bloodstock[0]!;
    expect(entry.horse.name).toBe('Zenith');
    expect(entry.horse.stats.speed).toBe(88);
    expect(entry.wins).toBe(7);
    expect(entry.starts).toBe(15);
    expect(entry.legacyPeak).toBe(310);
  });

  /** A horse leaves the racetrack; it never leaves the yard. */
  it('carries bloodstock into the next career', () => {
    const first = createNewCareer(horse('First'), DEFAULTS.playerSilksDefault, createStable());
    saveCareer(first);
    retireCurrentHorse(first);

    const second = createNewCareer(horse('Second'), DEFAULTS.playerSilksDefault);
    expect(second.stable.bloodstock.map((b) => b.horse.name)).toEqual(['First']);
  });

  it('accumulates a line across many horses', () => {
    let stable = createStable();
    for (const name of ['One', 'Two', 'Three']) {
      const career = createNewCareer(horse(name), DEFAULTS.playerSilksDefault, stable);
      saveCareer(career);
      stable = retireCurrentHorse(career);
    }
    expect(stable.bloodstock).toHaveLength(3);
    expect(stable.bloodstock.map((b) => b.careerNumber)).toEqual([1, 2, 3]);
  });

  it('snapshots the horse, so later edits cannot rewrite history', () => {
    const career = createNewCareer(horse('Ghost'), DEFAULTS.playerSilksDefault, createStable());
    saveCareer(career);
    const stable = retireCurrentHorse(career);

    career.horse.name = 'Renamed';
    career.horse.stats.speed = 1;

    expect(stable.bloodstock[0]!.horse.name).toBe('Ghost');
    expect(stable.bloodstock[0]!.horse.stats.speed).not.toBe(1);
  });

  it('records a career ended by injury as still carrying full value', () => {
    const career = createNewCareer(horse('Unlucky'), DEFAULTS.playerSilksDefault, createStable());
    career.careerEndedByInjury = true;
    career.horseLegacy.peak = 150;
    career.horseLegacy.points = 150;
    saveCareer(career);

    const stable = retireCurrentHorse(career);
    expect(stable.bloodstock[0]!.retiredByInjury).toBe(true);
    // §6: the injury costs the racing career, not the breeding value.
    expect(stable.bloodstock[0]!.legacyPeak).toBe(150);
    expect(stable.legacy.archivedPoints).toBe(150);
  });

  it('gives an older save an empty bloodstock rather than undefined', () => {
    const career = createNewCareer(horse(), DEFAULTS.playerSilksDefault, createStable());
    const raw = JSON.parse(JSON.stringify({ version: 1, data: career }));
    delete raw.data.stable.bloodstock;
    localStorage.setItem('bloodline_career', JSON.stringify(raw));
    localStorage.removeItem('bloodline_stable');

    expect(loadCareer()!.stable.bloodstock).toEqual([]);
  });
});
