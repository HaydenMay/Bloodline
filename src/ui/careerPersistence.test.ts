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
    first.stable.reputation = 140;
    first.stable.facilities.barn = 3;
    first.stable.staff.trainer.level = 4;
    first.stable.consumables.bran_mash = 2;
    first.horseLegacy.peak = 300;
    saveCareer(first);

    retireCurrentHorse(first);

    const second = createNewCareer(horse('Second'), DEFAULTS.playerSilksDefault);
    expect(second.stable.cash).toBe(250_000);
    expect(second.stable.reputation).toBe(140);
    expect(second.stable.facilities.barn).toBe(3);
    expect(second.stable.staff.trainer.level).toBe(4);
    expect(second.stable.consumables.bran_mash).toBe(2);
  });

  it('banks the retired horse’s peak legacy as permanent prestige', () => {
    const first = createNewCareer(horse('First'), DEFAULTS.playerSilksDefault, createStable());
    first.horseLegacy.peak = 420;
    // A slump before retirement must not reduce what the yard keeps.
    first.horseLegacy.points = 90;
    saveCareer(first);

    retireCurrentHorse(first);

    const second = createNewCareer(horse('Second'), DEFAULTS.playerSilksDefault);
    expect(second.stable.legacy.archivedPoints).toBe(420);
  });

  it('accumulates prestige across several horses', () => {
    let stable = createStable();
    for (const peak of [100, 250, 75]) {
      const career = createNewCareer(horse(`H${peak}`), DEFAULTS.playerSilksDefault, stable);
      career.horseLegacy.peak = peak;
      saveCareer(career);
      stable = retireCurrentHorse(career);
    }
    expect(stable.legacy.archivedPoints).toBe(425);
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
  it('moves cash and reputation off the career and onto the yard', () => {
    // A save written before the split, with the currencies on career.stats.
    const career = createNewCareer(horse(), DEFAULTS.playerSilksDefault, createStable());
    const raw = JSON.parse(JSON.stringify({ version: 1, data: career }));
    raw.data.stats.cash = 61_000;
    raw.data.stats.reputation = 33;
    delete raw.data.stable.cash;
    delete raw.data.stable.reputation;
    localStorage.setItem('bloodline_career', JSON.stringify(raw));
    localStorage.removeItem('bloodline_stable');

    const loaded = loadCareer()!;
    expect(loaded.stable.cash).toBe(61_000);
    expect(loaded.stable.reputation).toBe(33);
    expect((loaded.stats as unknown as { cash?: number }).cash).toBeUndefined();
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
