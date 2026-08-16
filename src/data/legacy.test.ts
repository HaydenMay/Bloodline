import { describe, it, expect } from 'vitest';
import {
  DIVISION_ORDER,
  HALL_OF_FAME_THRESHOLD,
  LEGACY_TIERS,
  getPromotionBonus,
  rescaleHorseLegacy,
  rescaleStableLegacy,
  applyRaceToHorseLegacy,
  calculateRaceLegacyChange,
  createHorseLegacy,
  createStableLegacy,
  getStableLegacyPoints,
  getRetirementValue,
  getTier,
  getTierFromPoints,
} from './legacy.js';

describe('calculateRaceLegacyChange', () => {
  it('rewards better finishes more', () => {
    const win = calculateRaceLegacyChange(1, 'open');
    const second = calculateRaceLegacyChange(2, 'open');
    const third = calculateRaceLegacyChange(3, 'open');
    expect(win).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(third);
  });

  it('docks points from 7th and back', () => {
    expect(calculateRaceLegacyChange(6, 'open')).toBeGreaterThan(0);
    expect(calculateRaceLegacyChange(7, 'open')).toBeLessThan(0);
    expect(calculateRaceLegacyChange(12, 'open')).toBeLessThan(0);
  });

  it('swings harder in higher divisions', () => {
    expect(calculateRaceLegacyChange(1, 'championship')).toBeGreaterThan(
      calculateRaceLegacyChange(1, 'maiden'),
    );
    expect(calculateRaceLegacyChange(8, 'championship')).toBeLessThan(
      calculateRaceLegacyChange(8, 'maiden'),
    );
  });

  it('keeps a bad day small next to a good one', () => {
    // A loss must cost well under a win, so slumps sting without crippling.
    const win = calculateRaceLegacyChange(1, 'open');
    const loss = Math.abs(calculateRaceLegacyChange(8, 'open'));
    expect(loss).toBeLessThan(win / 3);
  });
});

describe('applyRaceToHorseLegacy', () => {
  it('climbs on wins and slides on bad finishes', () => {
    const legacy = createHorseLegacy(0);
    applyRaceToHorseLegacy(legacy, 1, 'open');
    const afterWin = legacy.points;
    expect(afterWin).toBeGreaterThan(0);

    applyRaceToHorseLegacy(legacy, 8, 'open');
    expect(legacy.points).toBeLessThan(afterWin);
  });

  it('never drops below zero', () => {
    const legacy = createHorseLegacy(2);
    for (let i = 0; i < 20; i++) applyRaceToHorseLegacy(legacy, 8, 'championship');
    expect(legacy.points).toBe(0);
  });

  it('records the arc, one entry per race plus the starting point', () => {
    const legacy = createHorseLegacy(0);
    applyRaceToHorseLegacy(legacy, 1, 'open');
    applyRaceToHorseLegacy(legacy, 7, 'open');
    applyRaceToHorseLegacy(legacy, 2, 'open');
    expect(legacy.history).toHaveLength(4);
    expect(legacy.history[0]).toBe(0);
    expect(legacy.history[3]).toBe(legacy.points);
  });

  it('pays a promotion far more than any single result', () => {
    const plain = createHorseLegacy(0);
    const promoted = createHorseLegacy(0);
    applyRaceToHorseLegacy(plain, 1, 'novice');
    const swing = applyRaceToHorseLegacy(promoted, 1, 'novice', {
      promoted: true,
      newDivisionLevel: 2,
    });
    expect(swing.bonus).toBe(getPromotionBonus(2));
    expect(promoted.points - plain.points).toBe(getPromotionBonus(2));
  });

  it('pays more for each rung climbed', () => {
    // A flat bonus made stepping into Championship worth no more than
    // stepping out of Maiden.
    for (let level = 2; level <= 4; level++) {
      expect(getPromotionBonus(level)).toBeGreaterThan(getPromotionBonus(level - 1));
    }
    expect(getPromotionBonus(1)).toBe(25);
    expect(getPromotionBonus(4)).toBe(100);
  });

  /** Failing a qualifier is its own outcome; docking points punishes twice. */
  it('never docks legacy for a bad finish in a qualifier', () => {
    const legacy = createHorseLegacy(200);
    const swing = applyRaceToHorseLegacy(legacy, 8, 'stakes', { qualifier: true });
    expect(swing.raceDelta).toBe(0);
    expect(legacy.points).toBe(200);
  });

  it('still pays a good finish in a qualifier', () => {
    const legacy = createHorseLegacy(0);
    const swing = applyRaceToHorseLegacy(legacy, 1, 'stakes', { qualifier: true });
    expect(swing.raceDelta).toBeGreaterThan(0);
  });

  it('still docks a bad finish in an ordinary race', () => {
    const legacy = createHorseLegacy(200);
    applyRaceToHorseLegacy(legacy, 8, 'stakes');
    expect(legacy.points).toBeLessThan(200);
  });

  it('remembers the peak even after a slump', () => {
    const legacy = createHorseLegacy(0);
    for (let i = 0; i < 10; i++) applyRaceToHorseLegacy(legacy, 1, 'stakes');
    const peak = legacy.peak;
    expect(peak).toBe(legacy.points);

    for (let i = 0; i < 5; i++) applyRaceToHorseLegacy(legacy, 8, 'stakes');
    expect(legacy.points).toBeLessThan(peak);
    expect(legacy.peak).toBe(peak);
  });

  it('inducts a horse once its peak clears the threshold, and never revokes it', () => {
    const legacy = createHorseLegacy(HALL_OF_FAME_THRESHOLD - 20);
    expect(legacy.hallOfFame).toBe(false);

    const swing = applyRaceToHorseLegacy(legacy, 1, 'championship');
    expect(swing.inducted).toBe(true);
    expect(legacy.hallOfFame).toBe(true);

    // A collapse afterwards costs points but not the honour.
    for (let i = 0; i < 200; i++) applyRaceToHorseLegacy(legacy, 8, 'championship');
    expect(legacy.points).toBe(0);
    expect(legacy.hallOfFame).toBe(true);
  });

  it('reports induction only on the race that earns it', () => {
    const legacy = createHorseLegacy(HALL_OF_FAME_THRESHOLD);
    expect(legacy.hallOfFame).toBe(true);
    const swing = applyRaceToHorseLegacy(legacy, 1, 'championship');
    expect(swing.inducted).toBe(false);
  });

  it('traces the roller coaster: one win, then a long slide back down', () => {
    const legacy = createHorseLegacy(0);
    applyRaceToHorseLegacy(legacy, 1, 'open');
    const peak = legacy.points;
    for (let i = 0; i < 4; i++) applyRaceToHorseLegacy(legacy, 8, 'open');

    expect(legacy.peak).toBe(peak);
    expect(legacy.points).toBeLessThan(peak);
    expect(legacy.points).toBeGreaterThan(0); // four bad runs must not wipe a win out
  });
});

describe('stable prestige', () => {
  it('is the banked total plus whatever the current horse is worth', () => {
    const stable = createStableLegacy(250);
    const horse = createHorseLegacy(80);
    expect(getStableLegacyPoints(stable, horse)).toBe(330);
  });

  it('falls when the active horse falls', () => {
    const stable = createStableLegacy(100);
    const horse = createHorseLegacy(60);
    const before = getStableLegacyPoints(stable, horse);
    applyRaceToHorseLegacy(horse, 8, 'stakes');
    expect(getStableLegacyPoints(stable, horse)).toBeLessThan(before);
  });

  it('never falls below what past horses banked', () => {
    const stable = createStableLegacy(400);
    const horse = createHorseLegacy(10);
    for (let i = 0; i < 50; i++) applyRaceToHorseLegacy(horse, 8, 'championship');
    expect(getStableLegacyPoints(stable, horse)).toBe(400);
  });
});

describe('tiers', () => {
  it('maps points onto the tier ladder', () => {
    // Derived from the ladder itself, so rebalancing the economy does not mean
    // rewriting the test that proves the mapping works.
    LEGACY_TIERS.forEach((tier, index) => {
      expect(getTierFromPoints(tier.minPoints)).toBe(index);
      if (index > 0) expect(getTierFromPoints(tier.minPoints - 1)).toBe(index - 1);
    });
  });

  it('climbs strictly, so no tier is unreachable', () => {
    for (let i = 1; i < LEGACY_TIERS.length; i++) {
      expect(LEGACY_TIERS[i]!.minPoints).toBeGreaterThan(LEGACY_TIERS[i - 1]!.minPoints);
    }
  });

  it('always resolves to a tier', () => {
    expect(getTier(-50).name).toBe('Novice');
    expect(getTier(999_999).name).toBe('Legend');
  });
});

/**
 * The economy is only as good as the orderings it produces. These replay whole
 * career shapes rather than single races, because every problem this curve was
 * built to fix — a Stakes grinder out-scoring a champion, a first horse walking
 * into the Hall of Fame — only shows up across twenty starts.
 */
describe('what a whole career is worth', () => {
  /** Replays a career as [division, finishes[]] phases, promoting between them. */
  function runCareer(phases: Array<[string, number[]]>): number {
    const legacy = createHorseLegacy(0);
    phases.forEach(([division, finishes], i) => {
      for (const finish of finishes) applyRaceToHorseLegacy(legacy, finish, division);
      const next = phases[i + 1];
      if (next) {
        const level = DIVISION_ORDER.indexOf(next[0] as (typeof DIVISION_ORDER)[number]);
        applyRaceToHorseLegacy(legacy, 1, division, {
          promoted: true,
          newDivisionLevel: level,
          qualifier: true,
        });
      }
    });
    return legacy.peak;
  }

  const win = (n: number): number[] => Array(n).fill(1);

  const TYPICAL: Array<[string, number[]]> = [
    ['maiden', [2, 1, 3, 1]],
    ['novice', [1, 4, 2, 1, 5]],
    ['open', [3, 1, 7, 2, 3, 1, 8, 4, 3, 1, 6]],
  ];

  const GRINDER: Array<[string, number[]]> = [
    ['maiden', win(3)],
    ['novice', win(3)],
    ['open', win(3)],
    ['stakes', win(11)],
  ];

  const CHAMPION: Array<[string, number[]]> = [
    ['maiden', [1, 2, 1]],
    ['novice', [1, 1, 3]],
    ['open', [2, 1, 1]],
    ['stakes', [1, 3, 1]],
    ['championship', [1, 4, 1, 2, 1, 3, 5, 2]],
  ];

  /**
   * The failure the exponential curve exists to fix: on a flat ladder, volume
   * beat class, so a horse that never left Stakes out-scored one winning titles.
   */
  it('ranks a Championship campaign above a flawless Stakes one', () => {
    expect(runCareer(CHAMPION)).toBeGreaterThan(runCareer(GRINDER));
  });

  /**
   * "A first year horse should NOT be able to reach it. It should come with
   * strong breeding and/or stable upgrades."
   */
  it('keeps the Hall of Fame out of reach of an ordinary first career', () => {
    expect(runCareer(TYPICAL)).toBeLessThan(HALL_OF_FAME_THRESHOLD * 0.6);
  });

  /** Even a first horse good enough to reach Stakes falls short of the honour. */
  it('keeps it out of reach of a strong first career too', () => {
    const strong: Array<[string, number[]]> = [
      ['maiden', [1, 1, 2]],
      ['novice', [1, 2, 1, 3]],
      ['open', [1, 3, 1, 2, 1]],
      ['stakes', [4, 2, 5, 3, 1, 4, 3, 2]],
    ];
    expect(runCareer(strong)).toBeLessThan(HALL_OF_FAME_THRESHOLD);
  });

  /** Still reachable, or the honour is decoration. */
  it('lets a title-winning campaign clear the Hall of Fame', () => {
    expect(runCareer(CHAMPION)).toBeGreaterThan(HALL_OF_FAME_THRESHOLD);
  });

  /**
   * §12: the yard's ladder is a long game. One good horse should not hand a
   * player the top tier — the ladder is paced across careers, not races.
   */
  it('leaves the top tier well beyond a single career', () => {
    const best = Math.max(runCareer(CHAMPION), runCareer(GRINDER));
    expect(best).toBeLessThan(LEGACY_TIERS[LEGACY_TIERS.length - 1]!.minPoints);
  });
});

describe('lifting an older save onto the current scale', () => {
  it('scales a horse legacy and marks it done', () => {
    const legacy = { points: 200, peak: 400, history: [0, 200, 400], hallOfFame: false };
    rescaleHorseLegacy(legacy);
    expect(legacy.points).toBe(300);
    expect(legacy.peak).toBe(600);
    expect(legacy.history).toEqual([0, 300, 600]);
  });

  it('never scales the same record twice', () => {
    const legacy = { points: 200, peak: 400, history: [400], hallOfFame: false };
    rescaleHorseLegacy(legacy);
    rescaleHorseLegacy(legacy);
    rescaleHorseLegacy(legacy);
    expect(legacy.peak).toBe(600);
  });

  it('leaves a freshly created legacy alone', () => {
    const legacy = createHorseLegacy(120);
    rescaleHorseLegacy(legacy);
    expect(legacy.points).toBe(120);
  });

  /** A yard that was Professional must not load back as a Novice. */
  it('carries banked prestige and its Hall of Fame across', () => {
    const stable = createStableLegacy(0);
    delete stable.scale;
    stable.archivedPoints = 400;
    stable.hallOfFame = [
      {
        horseName: 'Zenith',
        wins: 9,
        starts: 20,
        earnings: 400_000,
        legacyPoints: 520,
        division: 'stakes',
        season: 3,
        timestamp: 0,
      },
    ];

    rescaleStableLegacy(stable);
    expect(stable.archivedPoints).toBe(600);
    expect(stable.hallOfFame[0]!.legacyPoints).toBe(780);

    rescaleStableLegacy(stable);
    expect(stable.archivedPoints).toBe(600);
  });
});

describe('what a career is worth at retirement', () => {
  const legacy = (points: number, peak: number) => ({
    points,
    peak,
    history: [points],
    hallOfFame: peak >= HALL_OF_FAME_THRESHOLD,
  });

  it('pays a bonus for stopping at the peak', () => {
    const value = getRetirementValue(legacy(400, 400));
    expect(value.reason).toBe('sound');
    expect(value.base).toBe(400);
    expect(value.bonus).toBe(80);
    expect(value.banked).toBe(480);
  });

  it('still counts as sound just inside the threshold', () => {
    const value = getRetirementValue(legacy(365, 400)); // 91% held
    expect(value.reason).toBe('sound');
  });

  it('banks only what is left once a horse has faded', () => {
    const value = getRetirementValue(legacy(250, 400)); // 63% held
    expect(value.reason).toBe('faded');
    expect(value.bonus).toBe(0);
    expect(value.banked).toBe(250);
  });

  /** The gamble: racing on past the peak has to cost something. */
  it('makes running a horse down strictly worse than stopping', () => {
    const stopped = getRetirementValue(legacy(400, 400));
    const ranOn = getRetirementValue(legacy(300, 420));
    expect(ranOn.banked).toBeLessThan(stopped.banked);
  });

  /** §6: the injury costs the racing career, not the breeding value. */
  it('banks the full peak when a career ends in injury', () => {
    const value = getRetirementValue(legacy(120, 300), true);
    expect(value.reason).toBe('injured');
    expect(value.banked).toBe(300);
  });

  it('does not let an injury bonus stack on top of the peak', () => {
    const value = getRetirementValue(legacy(300, 300), true);
    expect(value.bonus).toBe(0);
    expect(value.banked).toBe(300);
  });

  it('handles a horse that never scored', () => {
    const value = getRetirementValue(legacy(0, 0));
    expect(value.banked).toBe(0);
    expect(value.reason).toBe('sound');
  });

  /**
   * Hall of Fame is judged on the peak and is deliberately untouched by any of
   * this — racing on can still earn it while bleeding what the yard banks.
   */
  it('leaves the Hall of Fame decided by the peak alone', () => {
    const enshrined = legacy(50, HALL_OF_FAME_THRESHOLD + 10);
    expect(enshrined.hallOfFame).toBe(true);
    const value = getRetirementValue(enshrined);
    expect(value.reason).toBe('faded');
    // Faded badly, banks little — but the honour stands.
    expect(value.banked).toBe(50);
    expect(enshrined.hallOfFame).toBe(true);
  });
});
