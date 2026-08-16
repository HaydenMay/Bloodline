import { describe, it, expect } from 'vitest';
import { getNextPrestigeUnlock } from './unlocks.js';
import { CONSUMABLES } from './consumables.js';
import { MAX_STAFF_LEVEL, getPrestigeRequired, type StaffRoster } from './staff.js';

const roster = (trainer: number, jockey = trainer): StaffRoster => ({
  trainer: { level: trainer },
  jockey: { level: jockey },
});

describe('the next thing prestige buys', () => {
  it('names something a brand-new yard can work towards', () => {
    const next = getNextPrestigeUnlock(0, roster(1));
    expect(next).not.toBeNull();
    expect(next!.at).toBeGreaterThan(0);
    expect(next!.what.length).toBeGreaterThan(0);
  });

  it('always names a wall the yard has not already cleared', () => {
    for (const prestige of [0, 60, 150, 300, 900, 3000]) {
      const next = getNextPrestigeUnlock(prestige, roster(3));
      if (next) expect(next.at).toBeGreaterThan(prestige);
    }
  });

  it('picks the nearest wall, not just any of them', () => {
    const prestige = 200;
    const next = getNextPrestigeUnlock(prestige, roster(2))!;

    const everyWall = [
      ...Object.values(CONSUMABLES).map((c) => c.prestigeRequired),
      getPrestigeRequired(3),
    ].filter((at) => at > prestige);

    expect(next.at).toBe(Math.min(...everyWall));
  });

  it('moves the target up as the yard levels its staff', () => {
    const early = getNextPrestigeUnlock(0, roster(1))!;
    const later = getNextPrestigeUnlock(0, roster(5))!;
    expect(later.at).toBeGreaterThanOrEqual(early.at);
  });

  /** Nothing left to chase is a real state, and must not read as an error. */
  it('reports nothing left once everything is open', () => {
    expect(getNextPrestigeUnlock(999_999, roster(MAX_STAFF_LEVEL))).toBeNull();
  });

  /**
   * Only checking level + 1 told a yard on 1,168 prestige that everything was
   * unlocked, while its level-1 trainer still had three walls above it.
   */
  it('looks past a promotion the yard can already afford', () => {
    const next = getNextPrestigeUnlock(1168, roster(1));
    expect(next).not.toBeNull();
    expect(next!.at).toBeGreaterThan(1168);
  });

  it('only reports nothing when nothing is genuinely left', () => {
    const topOfLadder = getPrestigeRequired(MAX_STAFF_LEVEL);
    expect(getNextPrestigeUnlock(topOfLadder - 1, roster(1))).not.toBeNull();
    expect(getNextPrestigeUnlock(topOfLadder, roster(1))).toBeNull();
  });

  it('ignores staff already at the ceiling', () => {
    const next = getNextPrestigeUnlock(0, roster(MAX_STAFF_LEVEL));
    // Only supplies remain, so whatever it names must be one of them.
    const supplies = Object.values(CONSUMABLES).map((c) => c.name);
    expect(supplies).toContain(next!.what);
  });

  it('survives a roster from an older save', () => {
    const partial = { trainer: { level: 2 } } as unknown as StaffRoster;
    expect(() => getNextPrestigeUnlock(0, partial)).not.toThrow();
  });
});
