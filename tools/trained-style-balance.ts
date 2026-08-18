import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from '../src/data/index.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { STAT_KEYS } from '../src/sim/types.js';
import {
  applyTrainedStat,
  getAgeTrainingFactor,
  MIDPACK_TRAINING_BONUS,
} from '../src/sim/growth.js';
import type { Division } from '../src/data/index.js';
import type { RaceEntrant } from '../src/sim/race/types.js';

/**
 * B1's blind spot, closed.
 *
 * `tools/harness.ts`'s B1 races fresh, untrained horses once. That is the
 * right test for whatever a style earns ON THE RACECOURSE — front-runner's
 * relief, stalker's draft edge, closer's late kick — because those are true
 * the moment a horse is generated. Mid-pack's edge (ROADMAP.md) is not: it is
 * `MIDPACK_GENEROSITY` on the potential ceiling and `MIDPACK_TRAINING_BONUS`
 * on how fast a player closes to it, and NEITHER shows in a horse's stats
 * until something has actually trained it. B1 cannot see mid-pack's design by
 * construction, whatever mid-pack's real strength is.
 *
 * This trains every horse toward its own potential — same shape as an
 * ordinary played career, no facilities, no trainer, nothing style-aware
 * except the one bonus actually being tested — then races it. If mid-pack's
 * design works, its win rate should climb back toward fair once the horses
 * racing have actually had a career, even though B1 (correctly) shows it
 * short on day one.
 *
 *   npm run trained-style-balance
 *   WEEKS=80 npm run trained-style-balance
 */

const RACES = Number(process.env.RACES ?? 800);
const WEEKS = Number(process.env.WEEKS ?? 60);
const METRES = 1400;
const DIVISION: Division = 'open';

const RAW_GAIN = 1.2; // per stat per week, all six trained evenly — an unfocused, ordinary career.

function trainCareer(horse: ReturnType<typeof generateHorse>): void {
  const styleBonus = horse.style === 'midPack' ? 1 + MIDPACK_TRAINING_BONUS : 1;
  for (let w = 0; w < WEEKS; w++) {
    const age = Math.min(5, 2 + w / (WEEKS / 3)); // spends the simulated career aging 2 -> 5
    const factor = getAgeTrainingFactor(age) * styleBonus;
    for (const key of STAT_KEYS) applyTrainedStat(horse, key, RAW_GAIN * factor);
  }
}

const styleWins: Record<string, number> = {};
const styleRuns: Record<string, number> = {};
for (const s of RUNNING_STYLES) { styleWins[s] = 0; styleRuns[s] = 0; }

for (let n = 0; n < RACES; n++) {
  const rng = createRng(`trained-${n}`);
  const names = createNameGenerator(rng);
  const field = Array.from({ length: FIELD_SIZE }, (_, i) => {
    const style = RUNNING_STYLES[i % RUNNING_STYLES.length]!;
    const horse = generateHorse(rng, names, {
      division: DIVISION,
      style,
      age: 2,
      distanceCentre: METRES * rng.range(0.85, 1.15),
    });
    trainCareer(horse);
    return horse;
  });
  for (const h of field) styleRuns[h.style]! += 1;

  const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
  const outcome = simulateRace(entrants, { metres: METRES, going: 'good', hype: 0.5, seed: `trained-run-${n}` });
  const winner = field.find((h) => h.id === outcome.results[0]!.horseId)!;
  styleWins[winner.style]! += 1;
}

const FAIR = 100 / FIELD_SIZE;
console.log(`\n${RACES} races, ${WEEKS}-week simulated careers. Fair share is ${FAIR.toFixed(1)}%.\n`);
console.log('style          untrained (B1)   trained (this run)');
for (const s of RUNNING_STYLES) {
  const rate = (styleWins[s]! / styleRuns[s]!) * 100;
  console.log(`${s.padEnd(14)}${''.padEnd(16)}${rate.toFixed(1)}%`);
}
