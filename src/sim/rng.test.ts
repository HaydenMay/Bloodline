import { describe, it, expect } from 'vitest';
import { createRng, hashSeed } from './rng.js';

describe('createRng', () => {
  it('is deterministic — the same seed produces the same sequence', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('accepts a string seed', () => {
    const a = createRng('Storm Signal');
    const b = createRng('Storm Signal');
    expect(a.next()).toBe(b.next());
    expect(createRng('Quiet Lantern').next()).not.toBe(createRng('Storm Signal').next());
  });

  it('keeps next() within [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('keeps int() within an inclusive range and reaches both ends', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const n = rng.int(1, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
      seen.add(n);
    }
    expect(seen.size).toBe(6);
  });

  it('shuffle preserves every element and does not mutate the input', () => {
    const rng = createRng(4);
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const out = rng.shuffle(input);
    expect(out).toHaveLength(input.length);
    expect([...out].sort((x, y) => x - y)).toEqual([...input]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('normal() clusters around the mean', () => {
    const rng = createRng(2024);
    const samples = Array.from({ length: 20000 }, () => rng.normal(50, 20));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(48);
    expect(mean).toBeLessThan(52);

    // Clustered, not uniform: most samples land near the middle.
    const nearMean = samples.filter((s) => Math.abs(s - 50) < 5).length;
    expect(nearMean / samples.length).toBeGreaterThan(0.25);
  });

  it('chance() approximates the requested probability', () => {
    const rng = createRng(31337);
    let hits = 0;
    const runs = 20000;
    for (let i = 0; i < runs; i++) if (rng.chance(0.25)) hits++;
    expect(hits / runs).toBeGreaterThan(0.23);
    expect(hits / runs).toBeLessThan(0.27);
  });

  it('fork() yields an independent but reproducible stream', () => {
    const parentA = createRng(500);
    const parentB = createRng(500);
    const forkA = parentA.fork();
    const forkB = parentB.fork();
    expect(forkA.next()).toBe(forkB.next());
  });

  it('hashSeed is stable and distinguishes inputs', () => {
    expect(hashSeed('bloodline')).toBe(hashSeed('bloodline'));
    expect(hashSeed('bloodline')).not.toBe(hashSeed('Bloodline'));
  });
});
