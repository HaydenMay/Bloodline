import { describe, expect, it } from 'vitest';
import { MOMENT_SHIFT, STYLE_BASE, interp, paceFactor, styleCost } from './pace.js';
import { MOMENTS, RUNNING_STYLES } from '../../data/index.js';
import { PACE_MAX, PACE_MIN } from './constants.js';

describe('MOMENT_SHIFT is zero-sum (REBUILD.md R5)', () => {
  // The load-bearing invariant of the whole Moment system. If a row stops
  // summing to zero, one Moment is inherently faster than another and the
  // `late`-at-0.0%-win-rate failure is free to come back.
  for (const moment of MOMENTS) {
    it(`${moment} sums to zero`, () => {
      const sum = MOMENT_SHIFT[moment].reduce((a, b) => a + b, 0);
      expect(Math.abs(sum)).toBeLessThan(0.001);
    });
  }
});

describe('paceFactor stays inside its bounds', () => {
  it('never leaves [PACE_MIN, PACE_MAX] for any style x moment x t', () => {
    for (const style of RUNNING_STYLES) {
      for (const moment of MOMENTS) {
        for (let t = 0; t <= 1.0001; t += 0.01) {
          const p = paceFactor(style, moment, t);
          expect(p).toBeGreaterThanOrEqual(PACE_MIN);
          expect(p).toBeLessThanOrEqual(PACE_MAX);
        }
      }
    }
  });

  it('clamps t outside [0, 1] rather than extrapolating', () => {
    for (const style of RUNNING_STYLES) {
      expect(paceFactor(style, 'early', -0.5)).toBe(paceFactor(style, 'early', 0));
      expect(paceFactor(style, 'late', 1.5)).toBe(paceFactor(style, 'late', 1));
    }
  });

  it('the pace clamp never binds — a bound shift breaks zero-sum', () => {
    for (const style of RUNNING_STYLES) {
      for (const moment of MOMENTS) {
        for (let t = 0; t <= 1.0001; t += 0.005) {
          const raw = interp(STYLE_BASE[style], t) + interp(MOMENT_SHIFT[moment], t);
          expect(raw).toBeLessThanOrEqual(PACE_MAX + 1e-9);
          expect(raw).toBeGreaterThanOrEqual(PACE_MIN - 1e-9);
        }
      }
    }
  });
});

describe('the curves say what the design says they say', () => {
  it('front-runners start faster than closers', () => {
    expect(interp(STYLE_BASE.frontRunner, 0)).toBeGreaterThan(interp(STYLE_BASE.closer, 0));
  });

  it('closers finish at least as fast as front-runners', () => {
    expect(interp(STYLE_BASE.closer, 1)).toBeGreaterThan(interp(STYLE_BASE.frontRunner, 1));
  });

  it('every style costs the same tank across a race (the real invariant)', () => {
    const costs = RUNNING_STYLES.map((s) => styleCost(s));
    for (const c of costs) expect(c).toBeCloseTo(costs[0]!, 3);
  });

  it('a front-runner does NOT finish flat out — it has spent its race', () => {
    expect(interp(STYLE_BASE.frontRunner, 1)).toBeLessThan(
      interp(STYLE_BASE.frontRunner, 0),
    );
  });

  it('the field spreads far enough for a clear lead to be possible', () => {
    // Below about 3% the field never separates, EASY_LEAD_RECOVER_BONUS can
    // never trigger, and press applies to a leader permanently.
    const spread = interp(STYLE_BASE.frontRunner, 0) - interp(STYLE_BASE.closer, 0);
    expect(spread).toBeGreaterThan(0.028);
  });
});

describe('interp', () => {
  it('hits the control points exactly', () => {
    const pts = [0, 0.25, 0.5, 0.75, 1];
    expect(interp(pts, 0)).toBeCloseTo(0);
    expect(interp(pts, 0.25)).toBeCloseTo(0.25);
    expect(interp(pts, 0.5)).toBeCloseTo(0.5);
    expect(interp(pts, 1)).toBeCloseTo(1);
  });

  it('interpolates between them', () => {
    expect(interp([0, 1, 1, 1, 1], 0.125)).toBeCloseTo(0.5);
  });
});
