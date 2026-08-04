import { describe, expect, it } from 'vitest';
import {
  kickWindowBonus,
  momentWindow,
  regenCharges,
  spendCharge,
  startingCharges,
  windowArea,
  windowPeak,
} from './charges.js';
import { MOMENTS } from '../../data/index.js';
import {
  CHARGE_CAPACITY,
  CHARGE_REGEN_SECONDS,
  CHARGE_REGEN_SETTLED,
  KICK_OUT_OF_WINDOW,
} from './constants.js';

describe('every Moment pays the same at its peak (the fairness invariant)', () => {
  // The failure this prevents is on record: windows of 25/35/35/20% of the race
  // gave midLate a third more opportunity than late, and late sat at a 0.0% win
  // rate through five separate attempts to fix it by other means.
  it('all four peak at exactly the same value', () => {
    const peaks = MOMENTS.map((m) => windowPeak(m));
    for (const peak of peaks) expect(peak).toBeCloseTo(peaks[0]!, 6);
  });

  it('but they are NOT the same width — that is where the character is', () => {
    // Equal widths would be fair and dull. Width sets how forgiving the timing
    // is: early is generous, late demands precision for the identical reward.
    const width = (m: Parameters<typeof momentWindow>[0]): number => {
      const w = momentWindow(m);
      return w.to - w.from;
    };
    expect(width('early')).toBeGreaterThan(width('late') * 1.5);
    expect(windowArea('early')).toBeGreaterThan(windowArea('late'));
  });

  it('the windows march through the race in order', () => {
    const centres = MOMENTS.map((m) => {
      const w = momentWindow(m);
      return (w.from + w.to) / 2;
    });
    for (let i = 1; i < centres.length; i++) {
      expect(centres[i]!).toBeGreaterThan(centres[i - 1]!);
    }
  });
});

describe('a mistimed kick is weak, never wasted', () => {
  it('never drops below the out-of-window floor', () => {
    for (const moment of MOMENTS) {
      for (let t = 0; t <= 1.0001; t += 0.01) {
        expect(kickWindowBonus(moment, t)).toBeGreaterThanOrEqual(KICK_OUT_OF_WINDOW - 1e-9);
      }
    }
  });

  it('is worth clearly less than one produced at the right moment', () => {
    for (const moment of MOMENTS) {
      const w = momentWindow(moment);
      const centre = (w.from + w.to) / 2;
      const away = centre > 0.5 ? 0.02 : 0.98;
      expect(kickWindowBonus(moment, away)).toBeLessThan(kickWindowBonus(moment, centre));
    }
  });
});

describe('the charge bank', () => {
  it('starts FULL — a player should not open a race with an empty bank', () => {
    expect(startingCharges().count).toBe(CHARGE_CAPACITY);
  });

  it('regenerates on its own clock, never from the tank', () => {
    const s = startingCharges();
    spendCharge(s);
    const before = s.count;
    regenCharges(s, CHARGE_REGEN_SECONDS, false);
    expect(s.count).toBe(before + 1);
  });

  it('refills faster when the horse is settled', () => {
    const busy = startingCharges();
    const settled = startingCharges();
    spendCharge(busy);
    spendCharge(settled);
    for (let i = 0; i < 300; i++) {
      regenCharges(busy, 1 / 30, false);
      regenCharges(settled, 1 / 30, true);
    }
    expect(settled.progress + settled.count).toBeGreaterThan(busy.progress + busy.count);
    expect(CHARGE_REGEN_SETTLED).toBeLessThan(1);
  });

  it('never banks more than capacity', () => {
    const s = startingCharges();
    for (let i = 0; i < 10000; i++) regenCharges(s, 1 / 30, true);
    expect(s.count).toBe(CHARGE_CAPACITY);
  });

  it('does not refund a charge spent from a full bank', () => {
    // The bug this guards: progress pinned at 1 while full meant spending a
    // charge rolled straight back over on the next tick, so a horse sitting at
    // capacity had effectively unlimited kicks.
    const s = startingCharges();
    for (let i = 0; i < 10000; i++) regenCharges(s, 1 / 30, true);
    expect(s.count).toBe(CHARGE_CAPACITY);
    spendCharge(s);
    regenCharges(s, 1 / 30, true);
    expect(s.count).toBe(CHARGE_CAPACITY - 1);
  });

  it('spends one at a time and refuses when empty', () => {
    const s = { count: 1, progress: 0 };
    expect(spendCharge(s)).toBe(true);
    expect(s.count).toBe(0);
    expect(spendCharge(s)).toBe(false);
  });
});
