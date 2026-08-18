import { describe, it, expect } from 'vitest';
import { generateRaceCalendar } from './raceCalendar.js';

describe('generateRaceCalendar', () => {
  it('offers a single championship race, flagged isChampionshipRace, when isChampionshipReady', () => {
    const races = generateRaceCalendar('seed-champ', {
      division: 'championship',
      isChampionshipReady: true,
    });
    expect(races).toHaveLength(1);
    expect(races[0]!.isChampionshipRace).toBe(true);
    expect(races[0]!.isPromotion).toBeUndefined();
  });

  /**
   * `isPromotionReady` is structurally impossible at the Championship division
   * (gated by `divisionLevel < 4` in main.ts), so this asserts the calendar
   * itself also prefers the championship branch if both were ever true —
   * the two conditions must never fight over the same week's card.
   */
  it('prefers the championship race over a promotion race when both flags are set', () => {
    const races = generateRaceCalendar('seed-both', {
      division: 'championship',
      isChampionshipReady: true,
      isPromotionReady: true,
    });
    expect(races).toHaveLength(1);
    expect(races[0]!.isChampionshipRace).toBe(true);
  });

  it('falls back to an ordinary three-race calendar when not championship-ready', () => {
    const races = generateRaceCalendar('seed-normal', {
      division: 'championship',
      isChampionshipReady: false,
    });
    expect(races).toHaveLength(3);
    expect(races.every((r) => !r.isChampionshipRace)).toBe(true);
  });
});
