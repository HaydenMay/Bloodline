import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, type Division } from '../src/data/index.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { getBetOptions, winProbability } from '../src/data/wagering.js';
import { STAT_KEYS, type Horse } from '../src/sim/types.js';
import type { RaceEntrant } from '../src/sim/race/types.js';

/**
 * Is the betting market honest?
 *
 * `harness.ts` measures one race and `bloodline.ts` measures one line. This
 * measures the **price**: what the market implies your horse's chance is,
 * against the rate the race engine actually produces over hundreds of runs.
 *
 *   npm run odds              (400 races a row)
 *   RACES=1200 npm run odds   (a fuller sample)
 *
 * A market is honest when implied ≈ actual and the EV column is slightly
 * negative — the bookmaker's margin means betting every race is a slow way to
 * lose. A positive EV column is a money printer, and the wider the gap between
 * implied and actual the faster it prints.
 *
 * It exists because a player found the printer before any test did: backing a
 * dominant Maiden horse returned several times the stake, every time. The cause
 * was structural rather than a bad constant — `winProbability` prices a horse
 * on its *share* of the field's total rating, so in an eight-horse field an
 * implied chance above about 30% is unreachable no matter how dominant the
 * horse is, while the engine happily wins 100% of the time on a 19-point edge.
 * Linear share against a steep reality.
 */

const RACES = Number(process.env.RACES ?? 400);

const avg = (h: Horse): number =>
  STAT_KEYS.reduce((sum, k) => sum + h.stats[k], 0) / STAT_KEYS.length;

/** A player horse of a given quality, entered in a division's field. */
function trial(division: Division, playerStat: number, seedTag: string) {
  let wins = 0;
  let impliedSum = 0;
  let oddsSum = 0;
  let rivalAvg = 0;
  let payout = 0;

  for (let n = 0; n < RACES; n++) {
    const rng = createRng(`${seedTag}-${n}`);
    const names = createNameGenerator(rng);

    const player = generateHorse(rng, names, { division, age: 4, distanceCentre: 1400 });
    for (const key of STAT_KEYS) {
      player.stats[key] = Math.min(100, playerStat + rng.range(-4, 4));
      player.potential[key] = Math.max(player.potential[key], player.stats[key]);
    }
    player.condition = 78;
    player.morale = 70;

    const rivals = Array.from({ length: FIELD_SIZE - 1 }, () =>
      generateHorse(rng, names, {
        division,
        isAI: true,
        age: rng.int(2, 5),
        distanceCentre: 1400 * rng.range(0.9, 1.1),
      }),
    );

    const field = [player, ...rivals];
    const implied = winProbability(player, field);
    const [win] = getBetOptions(player, field);

    impliedSum += implied;
    oddsSum += win!.odds;
    rivalAvg += rivals.reduce((s, h) => s + avg(h), 0) / rivals.length;

    const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
    const outcome = simulateRace(entrants, {
      metres: 1400,
      going: 'good',
      hype: 0.5,
      seed: `${seedTag}-run-${n}`,
    });
    const position = outcome.results.find((r) => r.horseId === player.id)?.finishPosition ?? 8;
    if (position === 1) {
      wins += 1;
      payout += win!.odds;
    }
  }

  const actual = wins / RACES;
  const implied = impliedSum / RACES;
  const odds = oddsSum / RACES;
  // What a $1,000 bet returns on average, against the $1,000 staked.
  const ev = (payout / RACES) * 1000 - 1000;

  console.log(
    `  ${division.padEnd(13)} player ${String(playerStat).padStart(3)} vs rivals ` +
      `${(rivalAvg / RACES).toFixed(0).padStart(3)}   ` +
      `implied ${(implied * 100).toFixed(0).padStart(3)}%   ` +
      `actual ${(actual * 100).toFixed(0).padStart(3)}%   ` +
      `odds ${odds.toFixed(2).padStart(5)}x   ` +
      `EV on $1,000 ${ev >= 0 ? '+' : ''}${Math.round(ev).toLocaleString().padStart(7)}`,
  );
}

console.log(`\nBETTING CALIBRATION — ${RACES} races per row\n`);
console.log('  A market is honest when implied ≈ actual and EV is slightly negative.\n');

for (const [division, stats] of [
  ['maiden', [30, 45, 60, 75]],
  ['open', [50, 65, 80]],
  ['championship', [70, 85, 95]],
] as [Division, number[]][]) {
  for (const stat of stats) trial(division, stat, `${division}-${stat}`);
  console.log('');
}
