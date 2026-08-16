import { describe, it, expect } from 'vitest';
import {
  HALL_OF_FAME_THRESHOLD,
  PROMOTION_BONUS,
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
    const swing = applyRaceToHorseLegacy(promoted, 1, 'novice', { promoted: true });
    expect(swing.bonus).toBe(PROMOTION_BONUS);
    expect(promoted.points - plain.points).toBe(PROMOTION_BONUS);
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
    expect(getTierFromPoints(0)).toBe(0);
    expect(getTierFromPoints(99)).toBe(0);
    expect(getTierFromPoints(100)).toBe(1);
    expect(getTierFromPoints(300)).toBe(2);
    expect(getTierFromPoints(600)).toBe(3);
    expect(getTierFromPoints(1000)).toBe(4);
    expect(getTierFromPoints(999999)).toBe(4);
  });

  it('always resolves to a tier', () => {
    expect(getTier(-50).name).toBe('Novice');
    expect(getTier(1200).name).toBe('Legend');
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
