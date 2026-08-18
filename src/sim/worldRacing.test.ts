import { describe, it, expect } from 'vitest';
import { createRng } from './rng.js';
import { createNameGenerator } from '../data/names.js';
import { generateHorse } from './horse.js';
import { runWorldMeeting } from './worldRacing.js';
import { seedLegacyFromRecord } from '../data/legacy.js';
import type { Horse } from './types.js';

function world(count: number, seed = 'world'): Horse[] {
  const rng = createRng(seed);
  const names = createNameGenerator(rng);
  return Array.from({ length: count }, () =>
    generateHorse(rng, names, { division: 'open', age: 4 }),
  );
}

/** World horses arrive with a career already behind them, so measure deltas. */
const snapshot = (field: Horse[]): Map<string, Horse> =>
  new Map(field.map((h) => [h.id, { ...h }]));
const gained = (before: Map<string, Horse>, h: Horse, key: 'starts' | 'wins' | 'places' | 'shows'): number =>
  h[key] - (before.get(h.id)?.[key] ?? 0);
const earned = (before: Map<string, Horse>, h: Horse): number =>
  (h.earnings ?? 0) - (before.get(h.id)?.earnings ?? 0);

describe('the world races when you do', () => {
  it('gives every runner a start and exactly one winner per race', () => {
    const field = world(16);
    const before = snapshot(field);
    const report = runWorldMeeting(createRng('meet-1'), field);

    expect(report.races).toBe(2);
    expect(report.runners).toBe(16);
    expect(field.every((h) => gained(before, h, 'starts') === 1)).toBe(true);
    expect(field.filter((h) => gained(before, h, 'wins') === 1)).toHaveLength(report.races);
  });

  /**
   * The defect this module exists to fix: a rival only ever recorded a result
   * from a race the player was in, so a world of seventy horses finished a
   * career with nothing on the board.
   */
  it('puts wins on the board without the player being involved', () => {
    const field = world(24);
    const before = snapshot(field);
    for (let week = 0; week < 6; week++) {
      runWorldMeeting(createRng(`meet-${week}`), field);
    }
    expect(field.filter((h) => gained(before, h, 'wins') > 0).length).toBeGreaterThan(1);
    expect(field.reduce((sum, h) => sum + gained(before, h, 'wins'), 0)).toBeGreaterThan(10);
  });

  it('records placings and prize money, not only wins', () => {
    const field = world(16);
    const before = snapshot(field);
    runWorldMeeting(createRng('m0'), field);

    expect(field.some((h) => gained(before, h, 'places') > 0)).toBe(true);
    expect(field.some((h) => gained(before, h, 'shows') > 0)).toBe(true);
    expect(field.some((h) => earned(before, h) > 0)).toBe(true);
    // Paid down to sixth and no further, so 7th and 8th collect nothing.
    expect(field.some((h) => earned(before, h) === 0)).toBe(true);
  });

  /**
   * The point of the whole exercise: an outside stud's budget contribution has
   * three terms and two of them were always zero. With a real record, two
   * horses of the same class stop being interchangeable.
   */
  it('makes two horses of the same division worth different amounts at stud', () => {
    const field = world(16);
    for (let week = 0; week < 8; week++) runWorldMeeting(createRng(`s${week}`), field);

    const legacies = field.map((h) =>
      seedLegacyFromRecord(h.wins, h.earnings ?? 0, h.division),
    );
    expect(new Set(legacies).size).toBeGreaterThan(1);
    expect(Math.max(...legacies)).toBeGreaterThan(Math.min(...legacies));
  });

  it('leaves the horses that just raced the player alone', () => {
    const field = world(16);
    const before = snapshot(field);
    const rested = new Set([field[0]!.id, field[1]!.id]);
    runWorldMeeting(createRng('meet-x'), field, rested);

    expect(gained(before, field[0]!, 'starts')).toBe(0);
    expect(gained(before, field[1]!, 'starts')).toBe(0);
    expect(field.slice(2).every((h) => gained(before, h, 'starts') === 1)).toBe(true);
  });

  it('does not hand a lone horse a walkover', () => {
    const solo = world(1);
    solo[0]!.division = 'championship';
    const before = snapshot(solo);
    const report = runWorldMeeting(createRng('meet-solo'), solo);

    expect(report.races).toBe(0);
    expect(gained(before, solo[0]!, 'starts')).toBe(0);
    expect(gained(before, solo[0]!, 'wins')).toBe(0);
  });

  /**
   * The best horse should win often, never always — the race engine's own
   * determinism reproduced here would give each division one unbeatable animal
   * and a field of permanent losers.
   */
  it('lets a division be won by more than one horse', () => {
    const field = world(8, 'spread');
    const before = snapshot(field);
    for (let week = 0; week < 30; week++) runWorldMeeting(createRng(`u${week}`), field);
    expect(field.filter((h) => gained(before, h, 'wins') > 0).length).toBeGreaterThan(1);
  });
});
