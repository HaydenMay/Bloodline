// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { generateRaceCalendar, mountRaceCalendar } from './raceCalendar.js';

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

/**
 * "Rest Instead" (found in play: an accidental habitual click into the
 * calendar used to force a race pick with no way back out) has to appear on
 * an ordinary week but never on the one-race weeks — resting to duck a
 * promotion, demotion or championship decider would let a player postpone
 * the ladder indefinitely, which defeats the point of those thresholds.
 */
describe('mountRaceCalendar back button', () => {
  const mount = (opts: Parameters<typeof mountRaceCalendar>[3]): HTMLElement => {
    const container = document.createElement('div');
    mountRaceCalendar(container, () => {}, 'seed-back-btn', opts, () => {});
    return container;
  };

  it('offers Rest Instead on an ordinary week', () => {
    const container = mount({ division: 'open' });
    expect(container.querySelector('#calendar-back-btn')).not.toBeNull();
  });

  it('omits it when no onBack is given', () => {
    const container = document.createElement('div');
    mountRaceCalendar(container, () => {}, 'seed-no-onback', { division: 'open' });
    expect(container.querySelector('#calendar-back-btn')).toBeNull();
  });

  for (const [label, opts] of [
    ['promotion-ready', { division: 'open', isPromotionReady: true }],
    ['demotion-risk', { division: 'open', isDemotionRisk: true }],
    ['championship-ready', { division: 'championship', isChampionshipReady: true }],
  ] as const) {
    it(`omits it on a ${label} week, even with onBack given`, () => {
      const container = mount(opts);
      expect(container.querySelector('#calendar-back-btn')).toBeNull();
    });
  }
});
