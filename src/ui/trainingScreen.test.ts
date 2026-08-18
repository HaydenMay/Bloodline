import { describe, it, expect } from 'vitest';
import { STAT_KEYS } from '../sim/growth.js';
import { ORDERED_SESSIONS, TRAINING_SESSIONS, scaleTrainingEffects } from './trainingScreen.js';
import type { StatEffects } from './trainingScreen.js';

const sessions = Object.values(TRAINING_SESSIONS);

/** Every stat a session moves, across the whole table. */
function statsTouched(pick: (value: number) => boolean): Set<string> {
  const found = new Set<string>();
  for (const session of sessions) {
    for (const [stat, effect] of Object.entries(session.statEffects)) {
      if (pick(effect)) found.add(stat);
    }
  }
  return found;
}

describe('scaleTrainingEffects', () => {
  /**
   * The bug this exists to stop: the card showed the raw figure while the
   * session applied the scaled one, so an upgraded yard quietly handed back
   * three times what it promised.
   */
  it('scales gains by the multiplier', () => {
    const scaled = scaleTrainingEffects({ stamina: 1, grit: 2 }, 3);
    expect(scaled).toEqual({ stamina: 3, grit: 6 });
  });

  /** Upgrades make the trade-offs sharper, not free. */
  it('leaves costs alone', () => {
    const scaled = scaleTrainingEffects({ speed: 4, stamina: -2 }, 2.5);
    expect(scaled.stamina).toBe(-2);
    expect(scaled.speed).toBe(10);
  });

  it('is the identity at a bare yard', () => {
    const effects: StatEffects = { speed: 4, burst: 2, stamina: -2 };
    expect(scaleTrainingEffects(effects, 1)).toEqual(effects);
  });

  it('never mutates the session it was handed', () => {
    const effects: StatEffects = { grit: 3 };
    scaleTrainingEffects(effects, 4);
    expect(effects.grit).toBe(3);
  });

  it('rounds to whole points, so no card promises a fraction', () => {
    const scaled = scaleTrainingEffects({ temper: 1, grit: 3 }, 1.5);
    expect(scaled.temper).toBe(2);
    expect(scaled.grit).toBe(5);
  });
});

describe('the training table', () => {
  it('only moves stats the horse actually has', () => {
    for (const stat of statsTouched(() => true)) {
      expect(STAT_KEYS).toContain(stat);
    }
  });

  /** Consistency was trainable by no session at all, so it could only decay. */
  it('offers a way to train every stat', () => {
    const trainable = statsTouched((effect) => effect > 0);
    for (const stat of STAT_KEYS) {
      expect(trainable).toContain(stat);
    }
  });

  /**
   * Temper and grit had only incidental +1s attached to other work. A player
   * who needs them should be able to go and get them.
   */
  it('offers a high-yield option for every stat', () => {
    const best = new Map<string, number>();
    for (const session of sessions) {
      for (const [stat, effect] of Object.entries(session.statEffects)) {
        best.set(stat, Math.max(best.get(stat) ?? 0, effect));
      }
    }
    for (const stat of STAT_KEYS) {
      expect(best.get(stat) ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every session an id matching its key, so cards resolve', () => {
    for (const [key, session] of Object.entries(TRAINING_SESSIONS)) {
      expect(session.id).toBe(key);
    }
  });

  it('gives every session something to gain', () => {
    for (const session of sessions) {
      const gains = Object.values(session.statEffects).filter((effect) => effect > 0);
      expect(gains.length).toBeGreaterThan(0);
    }
  });
});

/**
 * The training grid's own order (ROADMAP.md): eighteen sessions used to render
 * in whatever sequence they were historically added — three separate design
 * eras stitched together with no relation to what any of them actually
 * trained. Grouped by primary stat instead, in STAT_KEYS order, so the page
 * reads as one system rather than an accretion.
 */
describe('the training grid orders itself by primary stat', () => {
  const primaryOf = (effects: Record<string, number | undefined>): string =>
    STAT_KEYS.reduce((best, key) => ((effects[key] ?? -Infinity) > (effects[best] ?? -Infinity) ? key : best), STAT_KEYS[0]!);

  it('never regresses to an earlier stat once it has moved on to a later one', () => {
    let seenIndex = -1;
    for (const session of ORDERED_SESSIONS) {
      const statIndex = STAT_KEYS.indexOf(primaryOf(session.statEffects) as (typeof STAT_KEYS)[number]);
      expect(statIndex).toBeGreaterThanOrEqual(seenIndex);
      seenIndex = statIndex;
    }
  });

  it('leads each stat group with its strongest session', () => {
    const groups = new Map<string, typeof ORDERED_SESSIONS>();
    for (const session of ORDERED_SESSIONS) {
      const stat = primaryOf(session.statEffects);
      groups.set(stat, [...(groups.get(stat) ?? []), session]);
    }
    const netOf = (effects: Record<string, number | undefined>): number =>
      Object.values(effects).reduce((sum: number, v) => sum + (v ?? 0), 0);
    for (const group of groups.values()) {
      const nets = group.map((s) => netOf(s.statEffects));
      expect(nets).toEqual([...nets].sort((a, b) => b - a));
    }
  });

  it('contains every session exactly once', () => {
    expect(ORDERED_SESSIONS.length).toBe(sessions.length);
    expect(new Set(ORDERED_SESSIONS.map((s) => s.id)).size).toBe(sessions.length);
  });
});
