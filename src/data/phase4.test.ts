import { describe, it, expect } from 'vitest';
import type { Horse } from '../sim/types.js';
import {
  FACILITIES,
  checkFacilityUpgrade,
  getLevelCapForTier,
  getPrizeMultiplier,
  getTrainingMultiplier,
  getUpgradeCost,
} from './facilities.js';
import {
  MAX_STAFF_LEVEL,
  checkStaffUpgrade,
  createStaffRoster,
  getJockeySkill,
  getPrestigeRequired,
  getStaffUpgradeCost,
  getTrainerBonus,
} from './staff.js';
import { CONSUMABLES, applyRaceDayItems, consumableCatalogue } from './consumables.js';
import { getBetOptions, settleBet, winProbability } from './wagering.js';
import { applyRaceUpkeep, applyRestWeek } from '../sim/upkeep.js';

function horse(overrides: Partial<Horse> = {}): Horse {
  return {
    id: 'h1',
    name: 'Test',
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
    division: 'open',
    divisionLevel: 2,
    divisionPoints: 0,
    starts: 0,
    wins: 0,
    places: 0,
    shows: 0,
    coat: 'bay',
    jockeySkill: 60,
    ...overrides,
  };
}

describe('facility effects', () => {
  it('are neutral for an unbuilt yard', () => {
    expect(getTrainingMultiplier({})).toBe(1);
    expect(getPrizeMultiplier({})).toBe(1);
  });

  it('scale with level', () => {
    expect(getTrainingMultiplier({ training: 5 })).toBeCloseTo(1.5);
    expect(getPrizeMultiplier({ admin: 5 })).toBeCloseTo(1.25);
  });

  it('ignore levels beyond the maximum rather than compounding forever', () => {
    expect(getTrainingMultiplier({ training: 99 })).toBeCloseTo(1.5);
  });

  it('costs roughly double each level, so a full build is a real commitment', () => {
    const base = FACILITIES.barn!.baseCost;
    expect(getUpgradeCost(base, 1)).toBe(base);
    expect(getUpgradeCost(base, 5)).toBe(base * 16);
  });
});

describe('facility prestige gating', () => {
  it('caps build level by tier', () => {
    expect(getLevelCapForTier(0)).toBe(2);
    expect(getLevelCapForTier(3)).toBe(5);
  });

  it('blocks a level above the cap however much cash is on hand', () => {
    const check = checkFacilityUpgrade(FACILITIES.barn!, 2, 10_000_000, 0);
    expect(check.tierLocked).toBe(true);
    expect(check.canUpgrade).toBe(false);
  });

  it('allows it once the stable has climbed', () => {
    const check = checkFacilityUpgrade(FACILITIES.barn!, 2, 10_000_000, 2);
    expect(check.tierLocked).toBe(false);
    expect(check.canUpgrade).toBe(true);
  });

  it('reports affordability separately from the tier lock', () => {
    const check = checkFacilityUpgrade(FACILITIES.barn!, 0, 0, 4);
    expect(check.tierLocked).toBe(false);
    expect(check.canAfford).toBe(false);
    expect(check.canUpgrade).toBe(false);
  });

  it('stops at level 5 even at the top tier', () => {
    expect(checkFacilityUpgrade(FACILITIES.barn!, 5, 10_000_000, 4).atMax).toBe(true);
  });
});

describe('staff', () => {
  it('starts both roles at level 1 with no bonus', () => {
    const roster = createStaffRoster();
    expect(roster.trainer.level).toBe(1);
    expect(getTrainerBonus(roster.trainer.level)).toBe(0);
  });

  /** A rich unknown yard is blocked by standing; saying "get money" would lie. */
  it('gates a promotion on prestige before cash', () => {
    const check = checkStaffUpgrade(2, 10_000_000, 0);
    expect(check.blockedBy).toBe('prestige');

    const broke = checkStaffUpgrade(3, 0, 10_000);
    expect(broke.blockedBy).toBe('cash');
  });

  it('allows the promotion when both are satisfied', () => {
    const level = 3;
    const check = checkStaffUpgrade(
      level,
      getStaffUpgradeCost(level + 1),
      getPrestigeRequired(level + 1),
    );
    expect(check.canUpgrade).toBe(true);
  });

  it('reports the ceiling once fully developed', () => {
    const check = checkStaffUpgrade(MAX_STAFF_LEVEL, 10_000_000, 10_000);
    expect(check.atMax).toBe(true);
    expect(check.blockedBy).toBe('max');
  });

  it('raises the jockey toward, but not past, 100 skill', () => {
    expect(getJockeySkill(1)).toBe(50);
    expect(getJockeySkill(MAX_STAFF_LEVEL)).toBeLessThanOrEqual(100);
    expect(getJockeySkill(MAX_STAFF_LEVEL)).toBeGreaterThan(getJockeySkill(1));
  });

  it('makes both prestige and cash climb with level', () => {
    for (let l = 3; l <= MAX_STAFF_LEVEL; l++) {
      expect(getPrestigeRequired(l)).toBeGreaterThan(getPrestigeRequired(l - 1));
      expect(getStaffUpgradeCost(l)).toBeGreaterThan(getStaffUpgradeCost(l - 1));
    }
  });
});

describe('consumables', () => {
  it('hides items the yard has no standing to buy', () => {
    const early = consumableCatalogue(0);
    expect(early.some(({ item, unlocked }) => item.prestigeRequired > 0 && unlocked)).toBe(false);
    expect(consumableCatalogue(5000).every((e) => e.unlocked)).toBe(true);
  });

  it('applies an upkeep item to the horse itself', () => {
    const h = horse({ condition: 50 });
    CONSUMABLES.bran_mash!.apply(h);
    expect(h.condition).toBe(65);
  });

  it('never pushes condition or morale past 100', () => {
    const h = horse({ condition: 95, morale: 95 });
    CONSUMABLES.electrolytes!.apply(h);
    CONSUMABLES.turnout_day!.apply(h);
    expect(h.condition).toBe(100);
    expect(h.morale).toBe(100);
  });

  /** The whole point of a race-day item is that the lift cannot be banked. */
  it('leaves the stored horse untouched when applying race-day items', () => {
    const h = horse();
    const boosted = applyRaceDayItems(h, ['speed_work']);
    expect(boosted.stats.speed).toBe(55);
    expect(h.stats.speed).toBe(50);
    expect(boosted).not.toBe(h);
  });

  it('stacks several race-day items onto the one runner', () => {
    const h = horse();
    const boosted = applyRaceDayItems(h, ['speed_work', 'stamina_prep']);
    expect(boosted.stats.speed).toBe(55);
    expect(boosted.stats.stamina).toBe(57);
  });

  it('returns the same horse when nothing was selected', () => {
    const h = horse();
    expect(applyRaceDayItems(h, [])).toBe(h);
  });

  it('ignores upkeep items handed to the race-day path', () => {
    const h = horse({ condition: 40 });
    const boosted = applyRaceDayItems(h, ['bran_mash']);
    expect(boosted.condition).toBe(40);
  });
});

describe('wagering', () => {
  const weakField = () => [
    horse({ id: 'p' }),
    ...Array.from({ length: 7 }, (_, i) =>
      horse({
        id: `r${i}`,
        stats: { speed: 20, stamina: 20, burst: 20, grit: 20, temper: 20, consistency: 20 },
      }),
    ),
  ];

  it('prices a standout shorter than an outsider', () => {
    const field = weakField();
    const favourite = winProbability(field[0]!, field);

    const strongField = [
      horse({ id: 'p' }),
      ...Array.from({ length: 7 }, (_, i) =>
        horse({
          id: `r${i}`,
          stats: { speed: 95, stamina: 95, burst: 95, grit: 95, temper: 95, consistency: 95 },
        }),
      ),
    ];
    const outsider = winProbability(strongField[0]!, strongField);

    expect(favourite).toBeGreaterThan(outsider);
  });

  it('never offers a certainty or a hopeless price', () => {
    const field = weakField();
    const p = winProbability(field[0]!, field);
    expect(p).toBeGreaterThanOrEqual(0.03);
    expect(p).toBeLessThanOrEqual(0.85);
  });

  it('always pays more than the stake back', () => {
    const field = weakField();
    for (const option of getBetOptions(field[0]!, field)) {
      expect(option.odds).toBeGreaterThan(1);
    }
  });

  it('prices a place shorter than a win', () => {
    const field = weakField();
    const [win, place] = getBetOptions(field[0]!, field);
    expect(place!.odds).toBeLessThan(win!.odds);
  });

  it('settles a win bet only on a win', () => {
    const bet = { type: 'win' as const, stake: 1000, odds: 3 };
    expect(settleBet(bet, 1, 8).won).toBe(true);
    expect(settleBet(bet, 2, 8).won).toBe(false);
    expect(settleBet(bet, 1, 8).payout).toBe(3000);
    expect(settleBet(bet, 1, 8).net).toBe(2000);
  });

  it('pays a place bet on the first three in a big field, first two in a small one', () => {
    const bet = { type: 'place' as const, stake: 500, odds: 1.8 };
    expect(settleBet(bet, 3, 8).won).toBe(true);
    expect(settleBet(bet, 4, 8).won).toBe(false);
    expect(settleBet(bet, 3, 6).won).toBe(false);
    expect(settleBet(bet, 2, 6).won).toBe(true);
  });

  it('loses the whole stake when it loses', () => {
    const settled = settleBet({ type: 'win', stake: 2500, odds: 4 }, 5, 8);
    expect(settled.payout).toBe(0);
    expect(settled.net).toBe(-2500);
  });
});

describe('condition and morale upkeep', () => {
  it('takes condition out of a horse that races', () => {
    const h = horse({ condition: 80 });
    applyRaceUpkeep(h, 4, 8, {});
    expect(h.condition).toBeLessThan(80);
  });

  it('lets the barn and medical wing soften the toll', () => {
    const bare = horse({ condition: 80 });
    const built = horse({ condition: 80 });
    applyRaceUpkeep(bare, 4, 8, {});
    applyRaceUpkeep(built, 4, 8, { barn: 5, medical: 5 });
    expect(built.condition).toBeGreaterThan(bare.condition);
  });

  it('lifts morale for a win and dents it for a tailed-off run', () => {
    const winner = horse({ morale: 50 });
    const beaten = horse({ morale: 50 });
    applyRaceUpkeep(winner, 1, 8, {});
    applyRaceUpkeep(beaten, 8, 8, {});
    expect(winner.morale).toBeGreaterThan(50);
    expect(beaten.morale).toBeLessThan(50);
  });

  it('lets premium feed amplify a good result but not soften a bad one', () => {
    const plainWin = horse({ morale: 50 });
    const fedWin = horse({ morale: 50 });
    applyRaceUpkeep(plainWin, 1, 8, {});
    applyRaceUpkeep(fedWin, 1, 8, { feed: 5 });
    expect(fedWin.morale).toBeGreaterThan(plainWin.morale);

    const plainLoss = horse({ morale: 50 });
    const fedLoss = horse({ morale: 50 });
    applyRaceUpkeep(plainLoss, 8, 8, {});
    applyRaceUpkeep(fedLoss, 8, 8, { feed: 5 });
    expect(fedLoss.morale).toBe(plainLoss.morale);
  });

  it('keeps both values inside 0-100', () => {
    const spent = horse({ condition: 2, morale: 2 });
    applyRaceUpkeep(spent, 8, 8, {});
    expect(spent.condition).toBeGreaterThanOrEqual(0);
    expect(spent.morale).toBeGreaterThanOrEqual(0);

    const peak = horse({ condition: 99, morale: 99 });
    applyRaceUpkeep(peak, 1, 8, { barn: 5, medical: 5, feed: 5, paddock: 5 });
    expect(peak.condition).toBeLessThanOrEqual(100);
    expect(peak.morale).toBeLessThanOrEqual(100);
  });

  /**
   * Every yard recovers something. A bare yard giving nothing back is what
   * made a first career unfinishable — facilities raise the ceiling, they are
   * not the only thing standing between the horse and zero.
   */
  it('recovers on a rest week even with no facilities', () => {
    const bare = horse({ condition: 60, morale: 40 });
    const change = applyRestWeek(bare, {});
    expect(change.condition).toBeGreaterThan(0);
    expect(change.morale).toBeGreaterThan(0);
  });

  it('recovers further in a better yard', () => {
    const bare = horse({ condition: 60, morale: 60 });
    const built = horse({ condition: 60, morale: 60 });
    applyRestWeek(bare, {});
    applyRestWeek(built, { medical: 5, paddock: 5 });
    expect(built.condition).toBeGreaterThan(bare.condition);
    expect(built.morale).toBeGreaterThan(bare.morale);
  });

  it('rests toward a ceiling rather than past it', () => {
    // A bare yard cannot rest a horse up to 100 however many weeks it takes.
    const h = horse({ condition: 60, morale: 60 });
    for (let i = 0; i < 40; i++) applyRestWeek(h, {});
    expect(h.condition).toBeLessThan(75);
    expect(h.condition).toBeGreaterThan(65);
  });

  it('never drags a horse back down to the ceiling', () => {
    // A well-peaked horse in a modest yard holds what it earned.
    const h = horse({ condition: 95, morale: 95 });
    applyRestWeek(h, {});
    expect(h.condition).toBe(95);
    expect(h.morale).toBe(95);
  });

  /** The spiral this replaced: zero condition by race 7 with no way back. */
  it('keeps a horse raceable across a full career in a bare yard', () => {
    const h = horse({ condition: 75, morale: 65 });
    for (let race = 0; race < 20; race++) applyRaceUpkeep(h, 5, 8, {});
    expect(h.condition).toBeGreaterThan(25);
  });

  it('settles higher the better the yard', () => {
    const bare = horse({ condition: 75, morale: 65 });
    const built = horse({ condition: 75, morale: 65 });
    for (let race = 0; race < 20; race++) {
      applyRaceUpkeep(bare, 5, 8, {});
      applyRaceUpkeep(built, 5, 8, { barn: 5, medical: 5 });
    }
    expect(built.condition).toBeGreaterThan(bare.condition + 30);
    // ...but even a maxed yard does not pin a raced horse at 100.
    expect(built.condition).toBeLessThan(100);
  });

  it('treats an ordinary mid-pack run as neither a lift nor a dent', () => {
    // 5th of 8 used to cost the same as finishing last.
    const h = horse({ morale: 50, condition: 100 });
    applyRaceUpkeep(h, 5, 8, {});
    expect(h.morale).toBeGreaterThanOrEqual(50);
  });
});
