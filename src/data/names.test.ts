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

/**
 * DESIGN.md §13: "Procedural, derived from parents, always editable" — the
 * worked example is *Storm Signal* x *Quiet Lantern* suggesting *Lantern
 * Warning*. Confirmed with Hayden: not every word has to come from a parent,
 * just at least one — the rest is a fresh roll, and it's fine for the
 * suggestion to be one editable starting point rather than the final word.
 */
describe('suggestFromParents', () => {
  it('echoes a word from one of the two parents', () => {
    const rng = createRng('derive-1');
    const gen = createNameGenerator(rng);

    for (let i = 0; i < 100; i++) {
      const name = gen.suggestFromParents('Storm Signal', 'Quiet Lantern');
      const words = name.split(' ');
      const echoesAParent = words.some((w) =>
        ['Storm', 'Signal', 'Quiet', 'Lantern'].includes(w),
      );
      expect(echoesAParent).toBe(true);
    }
  });

  it('falls back to a fresh name when neither parent has a word to echo', () => {
    const rng = createRng('derive-2');
    const gen = createNameGenerator(rng);
    // Both solo (single-word) names — nothing to split.
    expect(() => gen.suggestFromParents('Dynamo', 'Wildfire')).not.toThrow();
    const name = gen.suggestFromParents('Dynamo', 'Wildfire');
    expect(name.length).toBeGreaterThan(0);
  });

  it('still derives from whichever parent has two words, when the other is solo', () => {
    const rng = createRng('derive-3');
    const gen = createNameGenerator(rng);
    for (let i = 0; i < 100; i++) {
      const name = gen.suggestFromParents('Storm Signal', 'Dynamo');
      const words = name.split(' ');
      expect(words.some((w) => ['Storm', 'Signal'].includes(w))).toBe(true);
    }
  });

  it('never suggests a name already taken', () => {
    const rng = createRng('derive-4');
    const used = ['Storm Signal', 'Storm Lantern', 'Quiet Signal'];
    const gen = createNameGenerator(rng, used);
    const seen = new Set(used.map((n) => n.toLowerCase()));
    for (let i = 0; i < 100; i++) {
      const name = gen.suggestFromParents('Storm Signal', 'Quiet Lantern');
      expect(seen.has(name.toLowerCase())).toBe(false);
    }
  });

  it('calling it repeatedly (a "Randomize" button) does not exhaust the registry', () => {
    const rng = createRng('derive-5');
    const gen = createNameGenerator(rng);
    // A player clicking Randomize a lot should still keep getting names, not
    // fall into the numbered-variant fallback after just a handful of tries.
    for (let i = 0; i < 50; i++) {
      const name = gen.suggestFromParents('Storm Signal', 'Quiet Lantern');
      expect(name).not.toMatch(/\d$/);
    }
  });
});
