/**
 * Seeded, deterministic pseudo-random number generation.
 *
 * The entire simulation must be reproducible from a seed. This is what makes the
 * headless balance harness possible: run the same race ten thousand times with
 * varying seeds and the results are statistically meaningful; run the same seed
 * twice and you get an identical race, every time, forever.
 *
 * Never use Math.random() anywhere inside sim/.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** True with the given probability (0–1). */
  chance(probability: number): boolean;
  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Returns a new shuffled array; does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  /**
   * Approximately normal distribution via Irwin–Hall (sum of 4 uniforms).
   * Used for stat rolls, where clustering toward the mean is wanted.
   */
  normal(mean: number, spread: number): number;
  /** A fresh independent stream, deterministically derived from this one. */
  fork(): Rng;
}

/** Turns an arbitrary string into a 32-bit seed. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32 — small, fast, and statistically good enough for a game
 * simulation. Chosen over alternatives because it holds all its state in a
 * single 32-bit integer, which makes save/replay trivial.
 */
export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,

    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,

    range: (min, max) => min + next() * (max - min),

    chance: (probability) => next() < probability,

    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick called on an empty array');
      return items[Math.floor(next() * items.length)]!;
    },

    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },

    normal: (mean, spread) => {
      const sum = next() + next() + next() + next();
      // Irwin-Hall(4) has mean 2 and range [0,4]; recentre and scale.
      return mean + ((sum - 2) / 2) * spread;
    },

    fork: () => createRng(Math.floor(next() * 0xffffffff)),
  };

  return rng;
}
