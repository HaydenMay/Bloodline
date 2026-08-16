import { describe, it, expect } from 'vitest';
import { getNextReputationUnlock } from './reputation.js';
import { CONSUMABLES } from './consumables.js';
import { MAX_STAFF_LEVEL, getReputationRequired, type StaffRoster } from './staff.js';

const roster = (trainer: number, jockey = trainer): StaffRoster => ({
  trainer: { level: trainer },
  jockey: { level: jockey },
});

describe('the next thing reputation buys', () => {
  it('names something a brand-new yard can work towards', () => {
    const next = getNextReputationUnlock(0, roster(1));
    expect(next).not.toBeNull();
    expect(next!.at).toBeGreaterThan(0);
    expect(next!.what.length).toBeGreaterThan(0);
  });

  it('always names a wall the yard has not already cleared', () => {
    for (const reputation of [0, 10, 25, 47, 120, 300]) {
      const next = getNextReputationUnlock(reputation, roster(3));
      if (next) expect(next.at).toBeGreaterThan(reputation);
    }
  });

  it('picks the nearest wall, not just any of them', () => {
    const reputation = 30;
    const next = getNextReputationUnlock(reputation, roster(2))!;

    const everyWall = [
      ...Object.values(CONSUMABLES).map((c) => c.reputationRequired),
      getReputationRequired(3),
    ].filter((at) => at > reputation);

    expect(next.at).toBe(Math.min(...everyWall));
  });

  it('moves the target up as the yard levels its staff', () => {
    const early = getNextReputationUnlock(0, roster(1))!;
    const later = getNextReputationUnlock(0, roster(5))!;
    expect(later.at).toBeGreaterThanOrEqual(early.at);
  });

  /** Nothing left to chase is a real state, and must not read as an error. */
  it('reports nothing left once everything is open', () => {
    expect(getNextReputationUnlock(999_999, roster(MAX_STAFF_LEVEL))).toBeNull();
  });

  it('ignores staff already at the ceiling', () => {
    const next = getNextReputationUnlock(0, roster(MAX_STAFF_LEVEL));
    // Only supplies remain, so whatever it names must be one of them.
    const supplies = Object.values(CONSUMABLES).map((c) => c.name);
    expect(supplies).toContain(next!.what);
  });

  it('survives a roster from an older save', () => {
    const partial = { trainer: { level: 2 } } as unknown as StaffRoster;
    expect(() => getNextReputationUnlock(0, partial)).not.toThrow();
  });
});
