import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from '../src/data/index.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { STAT_KEYS, type StatKey } from '../src/sim/types.js';
import type { RaceEntrant } from '../src/sim/race/types.js';

/**
 * What each stat is actually worth in a race.
 *
 * DESIGN.md §2 gives the horse six stats and says nothing about one mattering
 * more than another, but play says only about three do. This settles it by
 * measurement rather than by reading constants: hold a field flat, move ONE
 * stat of one horse across the usable range, and see what happens to its win
 * rate and its beaten margin.
 *
 * The number to read is **win% at 90 minus win% at 40**. That is the whole
 * value of thirty points of a stat, in the only currency the game has. A stat
 * worth a couple of points is decoration.
 *
 *   npm run stat-leverage
 *   RACES=600 npm run stat-leverage
 */

const RACES = Number(process.env.RACES ?? 400);
const METRES = Number(process.env.METRES ?? 1400);
const BASELINE = 60;
const LEVELS = [40, 60, 75, 90];

interface Result {
  wins: number;
  beaten: number;
}

function run(stat: StatKey | null, value: number): Result {
  let wins = 0;
  let beaten = 0;

  for (let n = 0; n < RACES; n++) {
    const rng = createRng(`lev-${n}`);
    const names = createNameGenerator(rng);
    const field = Array.from({ length: FIELD_SIZE }, (_, i) =>
      generateHorse(rng, names, {
        division: 'open',
        style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
        age: 4,
        distanceCentre: METRES,
      }),
    );

    // Every horse flat at the baseline, so the ONLY difference in the race is
    // the stat under test. Traits and aptitude are left alone — they are not
    // what is being measured, and they are the same for every level.
    for (const horse of field) {
      for (const key of STAT_KEYS) horse.stats[key] = BASELINE;
      horse.condition = 80;
      horse.morale = 60;
    }

    const subject = field[n % field.length]!;
    if (stat) subject.stats[stat] = value;

    const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
    const outcome = simulateRace(entrants, {
      metres: METRES,
      going: 'good',
      hype: 0.5,
      seed: `lev-run-${n}`,
    });

    const me = outcome.results.find((r) => r.horseId === subject.id)!;
    if (me.finishPosition === 1) wins += 1;
    beaten += me.margin;
  }

  return { wins, beaten };
}

const fair = (100 / FIELD_SIZE).toFixed(1);
console.log(`\n${RACES} races at ${METRES} m. Every horse flat at ${BASELINE}; one stat moved.`);
console.log(`Fair share of wins is ${fair}%.\n`);

const control = run(null, BASELINE);
console.log(`control (nothing moved)   ${((control.wins / RACES) * 100).toFixed(1)}%\n`);

console.log('stat            40      60      75      90     SWING (90 minus 40)');
const swings: Array<[StatKey, number]> = [];
for (const stat of STAT_KEYS) {
  const rates = LEVELS.map((v) => (run(stat, v).wins / RACES) * 100);
  const swing = rates[rates.length - 1]! - rates[0]!;
  swings.push([stat, swing]);
  console.log(
    stat.padEnd(14) +
      rates.map((r) => `${r.toFixed(1)}%`.padStart(7)).join(' ') +
      `${swing >= 0 ? '+' : ''}${swing.toFixed(1)} pts`.padStart(14),
  );
}

console.log('\nRanked by what thirty points of the stat buys:');
for (const [stat, swing] of [...swings].sort((a, b) => b[1] - a[1])) {
  const bar = '#'.repeat(Math.max(0, Math.round(Math.abs(swing) / 2)));
  console.log(`  ${stat.padEnd(13)} ${`${swing >= 0 ? '+' : ''}${swing.toFixed(1)}`.padStart(6)} pts  ${bar}`);
}
