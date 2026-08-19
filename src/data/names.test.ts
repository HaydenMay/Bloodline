import { describe, it, expect } from 'vitest';
import { createRng } from '../sim/rng.js';
import { createNameGenerator } from './names.js';

/**
 * Found in play: "the solo names for sure are repeatable and over time they
 * could end up the same for others." The registry itself was always sound —
 * `next()` never reissues a name already in it — but three of the five real
 * call sites (`starterSelection.ts`, and `yearlingScreen.ts` partially) were
 * building a fresh, empty registry rather than passing in the yard's actual
 * history, so the guarantee below was never actually being asked for.
 */
describe('createNameGenerator', () => {
  it('never reissues a name already registered', () => {
    const rng = createRng('dedupe-1');
    const used = ['Storm Lantern', 'Dynamo', 'Iron Tide'];
    const gen = createNameGenerator(rng, used);

    const seen = new Set(used.map((n) => n.toLowerCase()));
    for (let i = 0; i < 500; i++) {
      const name = gen.next();
      expect(seen.has(name.toLowerCase())).toBe(false);
      seen.add(name.toLowerCase());
    }
  });

  it('is case-insensitive about what counts as already used', () => {
    const rng = createRng('dedupe-2');
    const gen = createNameGenerator(rng, ['dynamo', 'STORM LANTERN']);
    for (let i = 0; i < 200; i++) {
      const name = gen.next().toLowerCase();
      expect(name).not.toBe('dynamo');
      expect(name).not.toBe('storm lantern');
    }
  });

  /**
   * The specific worry: the 36-word solo pool exhausts long before the
   * two-word pools do (thousands of combinations), so a long save WILL burn
   * through every solo name eventually. Once that happens, `next()` should
   * quietly stop offering solo names rather than loop forever or crash.
   */
  it('keeps producing fresh names once the whole solo pool is exhausted', () => {
    const rng = createRng('solo-exhaustion');
    const gen = createNameGenerator(rng);

    // Burn through far more names than the solo pool holds.
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const name = gen.next();
      expect(seen.has(name.toLowerCase())).toBe(false);
      seen.add(name.toLowerCase());
    }
  });

  it('reserve() blocks a name from being issued at all', () => {
    const rng = createRng('reserve-1');
    const gen = createNameGenerator(rng);
    gen.reserve('Copper Ledger');

    for (let i = 0; i < 200; i++) {
      expect(gen.next().toLowerCase()).not.toBe('copper ledger');
    }
  });

  it('never issues a blocklisted combination', () => {
    const rng = createRng('blocklist-1');
    const gen = createNameGenerator(rng);
    for (let i = 0; i < 500; i++) {
      const name = gen.next().toLowerCase();
      expect(['wild wager', 'shadow bandit', 'lucky chancer']).not.toContain(name);
    }
  });

  it('never issues a name over the length cap', () => {
    const rng = createRng('length-cap-1');
    const gen = createNameGenerator(rng);
    for (let i = 0; i < 500; i++) {
      expect(gen.next().length).toBeLessThanOrEqual(18);
    }
  });
});
