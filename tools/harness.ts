/**
 * The headless balance harness.
 *
 * Runs the simulation thousands of times with varying seeds and reports whether
 * the balance targets in DESIGN.md §4 actually hold:
 *
 *   - no running style dominates
 *   - every division is winnable
 *   - the dominance curve is flat in the middle and steep at the ends
 *   - pace collapses genuinely produce upsets
 *
 * This exists so balance is settled by evidence rather than by feel, and it is
 * the entire reason sim/ is forbidden from importing render/ or ui/.
 *
 * Run with:  npm run harness
 *
 * Phase 1 fills this in. For now it verifies the harness can reach sim/ headless
 * — no DOM, no browser, just Node.
 */

import { createRng } from '../src/sim/index.js';

const RUNS = 100_000;

function main(): void {
  console.log('Bloodline balance harness');
  console.log('─'.repeat(52));

  const rng = createRng('harness-smoke-test');

  // Sanity: confirm the generator is well-distributed before anything depends
  // on it. A biased RNG would quietly poison every balance number we produce.
  const buckets = new Array<number>(10).fill(0);
  for (let i = 0; i < RUNS; i++) {
    buckets[Math.floor(rng.next() * 10)]!++;
  }

  const expected = RUNS / 10;
  const worstDrift = Math.max(...buckets.map((b) => Math.abs(b - expected) / expected));

  console.log(`  runs                ${RUNS.toLocaleString()}`);
  console.log(`  distribution drift  ${(worstDrift * 100).toFixed(2)}%`);
  console.log(`  headless sim access ok`);
  console.log('─'.repeat(52));

  if (worstDrift > 0.05) {
    console.error('RNG distribution is skewed beyond tolerance.');
    process.exit(1);
  }

  console.log('Phase 1 will replace this with real race simulation.');
}

main();
