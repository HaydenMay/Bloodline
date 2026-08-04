import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from '../src/data/index.js';
import { simulateRace } from '../src/sim/race/engine.js';
import type { RaceEntrant } from '../src/sim/race/types.js';

const RACE_COUNT = 200;
const RACE_METRES = 1400;

/**
 * The tail-collapse table from ROADMAP.md, "Known issue — winning margins are
 * too wide", made reproducible rather than a one-off measurement.
 *
 * Reports the median margin behind the winner by finishing place, 8f open
 * division, so a fix to the energy floor or the speed scale can be checked
 * against the same numbers that first diagnosed the problem instead of a
 * fresh, incomparable measurement.
 *
 * Run: npm run margin-profile
 */
const byPlace: number[][] = Array.from({ length: FIELD_SIZE }, () => []);

for (let n = 0; n < RACE_COUNT; n++) {
  const rng = createRng(`margin-profile-${n}`);
  const names = createNameGenerator(rng);
  const field = Array.from({ length: FIELD_SIZE }, (_, i) =>
    generateHorse(rng, names, {
      division: 'open',
      style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
      age: 4,
      distanceCentre: RACE_METRES * rng.range(0.85, 1.15),
    }),
  );
  const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
  const outcome = simulateRace(entrants, {
    metres: RACE_METRES,
    going: 'good',
    hype: 0.5,
    seed: `margin-profile-${n}`,
  });
  for (const r of outcome.results) byPlace[r.finishPosition - 1]!.push(r.margin);
}

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
};

console.log(`Median margin behind the winner by place (${RACE_COUNT} races, ${RACE_METRES}m open)\n`);
console.log('place  ' + byPlace.map((_, i) => `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'}`.padStart(6)).join(''));
console.log('behind ' + byPlace.map((p) => `${median(p).toFixed(1)}L`.padStart(6)).join(''));
