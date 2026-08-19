import { describe, it, expect } from 'vitest';
import { createRng } from './rng.js';
import { generateStarterSix, rollTraits } from './horse.js';
import { createNameGenerator } from '../data/names.js';
import { STAT_KEYS } from './types.js';

/** Trait counts across many rolls, so the assertions are about rates not luck. */
function traitCounts(legacy: number, opts: { starter?: boolean } = {}): number[] {
  const counts: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const rng = createRng(`traits-${legacy}-${opts.starter ? 's' : 'b'}-${i}`);
    counts.push(rollTraits(rng, legacy, undefined, opts).length);
  }
  return counts;
}

const shareWith = (counts: number[], n: number): number =>
  counts.filter((c) => c >= n).length / counts.length;

describe('trait rolls', () => {
  it('gives a starter two traits, and a third only rarely', () => {
    const counts = traitCounts(0);
    expect(shareWith(counts, 3)).toBeLessThan(0.02);
    expect(shareWith(counts, 4)).toBe(0);
  });

  /**
   * The regression: a starter inherits nothing however famous the yard is, but
   * it was handed the stable's whole banked prestige, which put it on the
   * bred-horse curve. A second horse opened with four traits about one time in
   * six — the reward for a bloodline, handed out for free.
   */
  it('keeps a starter on the starter curve however rich the yard is', () => {
    for (const prestige of [500, 2000, 10_000]) {
      const counts = traitCounts(prestige, { starter: true });
      expect(shareWith(counts, 3)).toBeLessThan(0.02);
      expect(shareWith(counts, 4)).toBe(0);
    }
  });

  it('still rewards a bred horse for what it inherits', () => {
    const modest = traitCounts(100);
    const strong = traitCounts(1200);
    expect(shareWith(strong, 3)).toBeGreaterThan(shareWith(modest, 3));
    expect(shareWith(strong, 4)).toBeGreaterThan(shareWith(modest, 4));
  });

  /** Four traits is the top of the range, not a common opening hand. */
  it('keeps four traits rare even at the top of the scale', () => {
    expect(shareWith(traitCounts(100_000), 4)).toBeLessThan(0.2);
  });

  it('never rolls more than four', () => {
    expect(Math.max(...traitCounts(100_000))).toBeLessThanOrEqual(4);
  });
});

describe('the six starters offered', () => {
  const pools = (prestige: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < 300; i++) {
      const rng = createRng(`pool-${prestige}-${i}`);
      const names = createNameGenerator(rng);
      for (const horse of generateStarterSix(rng, names, prestige)) {
        out.push(horse.traits.length);
      }
    }
    return out;
  };

  it('opens every starter on two traits, whatever the yard has banked', () => {
    for (const prestige of [0, 600, 5000]) {
      const counts = pools(prestige);
      expect(Math.max(...counts)).toBeLessThanOrEqual(3);
      expect(shareWith(counts, 3)).toBeLessThan(0.05);
    }
  });
});

/**
 * Found in play: "I had one my first gen that the potential was A tier for
 * grit and that set me up like crazy." Six independent per-stat rolls meant
 * six independent chances at the top of the range, uncorrelated with the
 * rest of the horse — measured at 82.8% of starters carrying at least one
 * A-tier (75+) potential and 12.3% an X-tier (90+) one before this. Now a
 * shared pool is split across the six stats, so a big number in one place
 * comes at the expense of the others on the same horse, the way a bred
 * foal's potential already works (sim/breeding.ts's budget).
 */
describe('starter potential is a shared pool, not six independent lottery tickets', () => {
  function starterPotentials(prestige = 0, trials = 400): number[] {
    const out: number[] = [];
    for (let i = 0; i < trials; i++) {
      const rng = createRng(`starter-pool-${prestige}-${i}`);
      const names = createNameGenerator(rng);
      for (const horse of generateStarterSix(rng, names, prestige)) {
        for (const key of STAT_KEYS) out.push(horse.potential[key]);
      }
    }
    return out;
  }

  it('keeps the average starter unchanged — only the outlier ceiling moves', () => {
    const potentials = starterPotentials();
    const mean = potentials.reduce((a, b) => a + b, 0) / potentials.length;
    // Old six-independent-rolls mean: statValue(~26) + headroom(~35.8) ≈ 61.8.
    // The pool's own mean is deliberately set to match it.
    expect(mean).toBeGreaterThan(58);
    expect(mean).toBeLessThan(66);
  });

  it('makes a single X-tier (90+) stat exceedingly rare rather than one time in eight', () => {
    const potentials = starterPotentials(0, 2000);
    const xTierShare = potentials.filter((p) => p >= 90).length / potentials.length;
    expect(xTierShare).toBeLessThan(0.01);
  });

  it('still allows an A-tier (75+) stat sometimes, just not on most starters', () => {
    const potentials = starterPotentials(0, 2000);
    const aTierShare = potentials.filter((p) => p >= 75).length / potentials.length;
    expect(aTierShare).toBeGreaterThan(0);
    expect(aTierShare).toBeLessThan(0.15);
  });

  it('never lets one stat consume so much of the pool that potential exceeds 100 on its own', () => {
    for (const p of starterPotentials(0, 200)) {
      expect(p).toBeLessThanOrEqual(100);
    }
  });
});
