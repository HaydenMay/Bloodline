import { describe, expect, it } from 'vitest';
import { conditionReadout, drainPerSecond, fatigueFactor, recoverPerSecond } from './tank.js';
import { distanceFactor, peakFor } from './aptitude.js';
import { FATIGUE_FLOOR, FATIGUE_START, REFERENCE_PACE, TANK_START } from './constants.js';

/**
 * Simulates a whole race at a constant pace and returns the tank left at the
 * wire. This is the check that matters: the tank's job is to make a flat-out
 * ride empty and a settled one bank, and nothing else in the design works if
 * that shape is wrong.
 */
function tankAfterRace(pace: number, stamina = 50, totalMetres = 1609): number {
  const dt = 1 / 30;
  const speed = 21 * pace;
  let tank = TANK_START;
  let distance = 0;
  while (distance < totalMetres) {
    const drain = drainPerSecond(pace, speed, totalMetres);
    const recover = recoverPerSecond(stamina, speed, totalMetres, false);
    tank = Math.min(1, Math.max(0, tank + (recover - drain) * dt));
    distance += speed * dt;
  }
  return tank;
}

/** How far through a constant-pace race the tank runs dry. 1 = never. */
function emptiesAt(pace: number, stamina = 50, totalMetres = 1609): number {
  const dt = 1 / 30;
  const speed = 21 * pace;
  let tank = TANK_START;
  let distance = 0;
  while (distance < totalMetres) {
    const drain = drainPerSecond(pace, speed, totalMetres);
    const recover = recoverPerSecond(stamina, speed, totalMetres, false);
    tank = Math.min(1, Math.max(0, tank + (recover - drain) * dt));
    distance += speed * dt;
    if (tank <= 0) return distance / totalMetres;
  }
  return 1;
}

describe('the tank has the shape the design depends on (REBUILD.md §5.3)', () => {
  // The tank is a race-long BUDGET every horse is spending down, not a bucket
  // that sits brim-full. At parity the first probe run showed closers holding
  // five charges gate to wire, so their early sag bought nothing and they lost
  // 40 lengths for free. Recovery sits below cost so that cannot happen.

  it('a horse held flat out runs dry well before the wire, leaving room to fade', () => {
    const at = emptiesAt(1.0);
    expect(at).toBeGreaterThan(0.4);
    expect(at).toBeLessThan(0.8);
  });

  it('a horse held at reference pace spends most of its budget but survives', () => {
    const left = tankAfterRace(REFERENCE_PACE);
    expect(left).toBeGreaterThan(0.1);
    expect(left).toBeLessThan(0.7);
  });

  it('a horse sitting off the pace genuinely banks', () => {
    expect(tankAfterRace(0.95)).toBeGreaterThan(tankAfterRace(REFERENCE_PACE));
  });

  it('taking a pull is the only state that gains ground on the budget', () => {
    expect(tankAfterRace(0.945)).toBeCloseTo(TANK_START, 1);
  });

  it('is distance-independent — a dash and a route behave the same', () => {
    const dash = emptiesAt(1.0, 50, 700);
    const route = emptiesAt(1.0, 50, 2400);
    expect(Math.abs(dash - route)).toBeLessThan(0.05);
  });

  it('stamina buys real recovery', () => {
    expect(tankAfterRace(REFERENCE_PACE, 90)).toBeGreaterThan(tankAfterRace(REFERENCE_PACE, 10));
  });

  it('a stayer outlasts a non-stayer at the same pace', () => {
    expect(emptiesAt(1.0, 90)).toBeGreaterThan(emptiesAt(1.0, 10));
  });
});

describe('drain is steeply superlinear in pace', () => {
  it('2.5% more pace costs meaningfully more than 2.5% more tank', () => {
    const atReference = drainPerSecond(REFERENCE_PACE, 21, 1609);
    const atFull = drainPerSecond(1.0, 21, 1609);
    expect(atFull / atReference).toBeGreaterThan(1.25);
  });

  it('sitting off the pace costs markedly less', () => {
    const atReference = drainPerSecond(REFERENCE_PACE, 21, 1609);
    const settled = drainPerSecond(0.95, 21, 1609);
    expect(settled / atReference).toBeLessThan(0.8);
  });
});

describe('drafting', () => {
  it('helps recovery, and only recovery', () => {
    const alone = recoverPerSecond(50, 21, 1609, false);
    const drafting = recoverPerSecond(50, 21, 1609, true);
    expect(drafting).toBeGreaterThan(alone);
  });
});

describe('fatigue', () => {
  it('is inert while the tank holds', () => {
    expect(fatigueFactor(1)).toBe(1);
    expect(fatigueFactor(0.5)).toBe(1);
  });

  it('bottoms out at the floor when empty', () => {
    expect(fatigueFactor(0)).toBeCloseTo(FATIGUE_FLOOR);
  });

  it('ramps smoothly rather than falling off a cliff', () => {
    expect(fatigueFactor(0.075)).toBeGreaterThan(FATIGUE_FLOOR);
    expect(fatigueFactor(0.075)).toBeLessThan(1);
  });
});

describe('the tank is the jockey\'s alone', () => {
  it('surfaces how the horse is going without exposing a number to manage', () => {
    // No stamina bar, but the EFFECT of the tank must be visible or a horse can
    // show a full bank of charges while being completely out of petrol.
    expect(conditionReadout(1)).toBe(1);
    expect(conditionReadout(FATIGUE_START)).toBe(1);
    expect(conditionReadout(0)).toBe(0);
    expect(conditionReadout(FATIGUE_START / 2)).toBeCloseTo(0.5, 5);
  });

  it('tracks the fatigue that is actually being applied', () => {
    // The readout is honest: it starts falling exactly when speed does.
    expect(fatigueFactor(FATIGUE_START)).toBe(1);
    expect(fatigueFactor(FATIGUE_START * 0.5)).toBeLessThan(1);
    expect(fatigueFactor(0)).toBeCloseTo(FATIGUE_FLOOR);
  });
});

describe('distance preference (REBUILD.md §7)', () => {
  const narrow = { min: 700, max: 900 };
  const wide = { min: 550, max: 1250 };

  it('a narrow specialist peaks higher than a versatile horse', () => {
    expect(peakFor(narrow)).toBeGreaterThan(peakFor(wide));
  });

  it('both are at their peak inside their own range', () => {
    expect(distanceFactor(narrow, 800)).toBeCloseTo(peakFor(narrow));
    expect(distanceFactor(wide, 800)).toBeCloseTo(peakFor(wide));
  });

  it('the specialist loses more at a distance neither wants', () => {
    // The trade: narrow peaks higher and falls further. At 1800 m both are well
    // outside, and the specialist has further to fall from.
    const narrowLoss = peakFor(narrow) - distanceFactor(narrow, 1800);
    const wideLoss = peakFor(wide) - distanceFactor(wide, 1800);
    expect(narrowLoss).toBeGreaterThan(wideLoss);
  });

  it('a sprinter asked to run a route is beaten decisively', () => {
    expect(distanceFactor(narrow, 2400)).toBeLessThan(0.97);
  });

  it('is symmetric — too short hurts as much as too far', () => {
    const pref = { min: 1400, max: 1600 };
    expect(distanceFactor(pref, 1400 - 300)).toBeCloseTo(distanceFactor(pref, 1600 + 300));
  });
});
