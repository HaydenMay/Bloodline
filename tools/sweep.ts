import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, MOMENTS, RUNNING_STYLES } from '../src/data/index.js';
import { simulateRace } from '../src/sim/race/engine.js';
import type { RaceEntrant } from '../src/sim/race/types.js';

/**
 * Fast style/moment balance proxy.
 *
 * The full harness takes minutes; this takes seconds and uses the SAME seed
 * prefix and field construction as `harness.ts`'s B1/B2, so numbers from here
 * are directly comparable to a full run rather than a separate measurement that
 * has to be re-based every time.
 *
 * For tuning only. The full harness is still the gate.
 *
 *   npm run sweep -- [races]
 */

const RACES = Number(process.argv[2] ?? 400);
const METRES = 1400;

const styleWins: Record<string, number> = {};
const styleRuns: Record<string, number> = {};
const momentWins: Record<string, number> = {};
const momentRuns: Record<string, number> = {};
for (const s of RUNNING_STYLES) {
  styleWins[s] = 0;
  styleRuns[s] = 0;
}
for (const m of MOMENTS) {
  momentWins[m] = 0;
  momentRuns[m] = 0;
}

for (let n = 0; n < RACES; n++) {
  const rng = createRng(`balance-${n}`);
  const names = createNameGenerator(rng);
  const field = Array.from({ length: FIELD_SIZE }, (_, i) =>
    generateHorse(rng, names, {
      division: 'open',
      style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
      age: 4,
      distanceCentre: METRES * rng.range(0.85, 1.15),
    }),
  );
  const byId = new Map(field.map((h) => [h.id, h]));
  for (const h of field) {
    styleRuns[h.style]! += 1;
    momentRuns[h.moment]! += 1;
  }
  const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
  const outcome = simulateRace(entrants, {
    metres: METRES,
    going: 'good',
    hype: 0.5,
    seed: `balance-run-${n}`,
  });
  const winner = byId.get(outcome.results[0]!.horseId)!;
  styleWins[winner.style]! += 1;
  momentWins[winner.moment]! += 1;
}

const FAIR = 1 / FIELD_SIZE;
const line = (label: string, wins: number, runs: number): string => {
  const rate = runs > 0 ? wins / runs : 0;
  const rel = ((rate - FAIR) / FAIR) * 100;
  return `${label.padEnd(12)} ${(rate * 100).toFixed(1).padStart(5)}%  ${rel >= 0 ? '+' : ''}${rel.toFixed(0)}%`;
};

console.log(`\n${RACES} races, fair share ${(FAIR * 100).toFixed(1)}%  (bar is +/-30%)\n`);
for (const s of RUNNING_STYLES) console.log('  ' + line(s, styleWins[s]!, styleRuns[s]!));
console.log('');
for (const m of MOMENTS) console.log('  ' + line(m, momentWins[m]!, momentRuns[m]!));

const worst = Math.max(
  ...[...RUNNING_STYLES, ...MOMENTS].map((k) => {
    const w = styleWins[k] ?? momentWins[k]!;
    const r = styleRuns[k] ?? momentRuns[k]!;
    return Math.abs((w / r - FAIR) / FAIR);
  }),
);
console.log(`\nworst deviation ${(worst * 100).toFixed(0)}%  ${worst <= 0.3 ? 'PASS' : 'FAIL'}\n`);
