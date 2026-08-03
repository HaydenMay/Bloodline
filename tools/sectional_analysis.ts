/**
 * Diagnostic: Analyze sectional performance to find when gaps open
 *
 * Uses furlong-by-furlong times to identify which running styles accelerate
 * away and when the gap forms between early runners and closers.
 */

import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { RUNNING_STYLES, type RunningStyle } from '../src/data/index.js';
import { STAT_KEYS, type Horse } from '../src/sim/types.js';

const RACES = 50;
const SEED = 'sectional-diag';

interface SectionalStats {
  style: RunningStyle;
  furlongTimes: number[]; // Average time per furlong
  cumulativeDistance: number[]; // Estimated cumulative distance per furlong
}

const stats: Record<RunningStyle, SectionalStats> = {
  frontRunner: { style: 'frontRunner', furlongTimes: [], cumulativeDistance: [] },
  stalker: { style: 'stalker', furlongTimes: [], cumulativeDistance: [] },
  midPack: { style: 'midPack', furlongTimes: [], cumulativeDistance: [] },
  closer: { style: 'closer', furlongTimes: [], cumulativeDistance: [] },
};

// Initialize arrays for each furlong (up to 10 furlongs)
for (const style of RUNNING_STYLES) {
  for (let i = 0; i < 10; i++) {
    stats[style].furlongTimes[i] = 0;
    stats[style].cumulativeDistance[i] = 0;
  }
}

console.log('Analyzing sectional times across 50 races...\n');

for (let i = 0; i < RACES; i++) {
  const rng = createRng(`${SEED}-race-${i}`);
  const names = createNameGenerator(rng);
  const distance = [6, 8, 10][i % 3]!;

  // Balanced field: one of each style, same quality
  const horses: Horse[] = [];
  for (const style of RUNNING_STYLES) {
    const h = generateHorse(rng, names, { division: 'open', style, age: 4 });
    for (const key of STAT_KEYS) h.stats[key] = 55;
    h.aptitudes = { sprint: 80, mile: 80, route: 80 };
    h.jockeySkill = 60;
    h.condition = 75;
    h.traits = [];
    horses.push(h);
  }

  const outcome = simulateRace(
    horses.map((horse) => ({ horse })),
    { furlongs: distance, going: 'good', hype: 0.5, seed: `${SEED}-race-${i}` },
  );

  // Collect sectional data
  for (const result of outcome.results) {
    const horse = horses.find((h) => h.id === result.horseId)!;
    const s = stats[horse.style];

    // Sum sectional times and calculate cumulative distance
    let cumDist = 0;
    for (let f = 0; f < result.sectionals.length && f < 10; f++) {
      s.furlongTimes[f] += result.sectionals[f];
      cumDist += 220; // Each furlong = 220 yards
      s.cumulativeDistance[f] += cumDist;
    }
  }
}

console.log('=== SECTIONAL TIME ANALYSIS ===\n');
console.log('Time per furlong (seconds):\n');

console.log('Furlong | FrontRunner | Stalker | MidPack | Closer | Gap (FR - Closer)');
console.log('─'.repeat(80));

for (let f = 0; f < 10; f++) {
  let hasData = false;
  const times: Record<RunningStyle, number> = {
    frontRunner: 0,
    stalker: 0,
    midPack: 0,
    closer: 0,
  };

  for (const style of RUNNING_STYLES) {
    const count = RACES * 4; // Each race has 4 horses
    if (stats[style].furlongTimes[f] > 0) {
      times[style] = stats[style].furlongTimes[f] / count;
      hasData = true;
    }
  }

  if (!hasData) break;

  const gap = times.frontRunner - times.closer;
  console.log(
    `   ${(f + 1).toString().padEnd(2)} | ${times.frontRunner.toFixed(2).padEnd(11)} | ${times.stalker.toFixed(2).padEnd(7)} | ${times.midPack.toFixed(2).padEnd(7)} | ${times.closer.toFixed(2).padEnd(6)} | ${gap.toFixed(2)}s`,
  );
}

console.log('\n\nCUMULATIVE DISTANCE GAP (yards):\n');
console.log('Progress | FrontRunner | Closer | Gap Behind');
console.log('─'.repeat(50));

for (let f = 0; f < 10; f++) {
  const raceCount = RACES * 4;
  const frDist = stats.frontRunner.cumulativeDistance[f] / raceCount;
  const closerDist = stats.closer.cumulativeDistance[f] / raceCount;

  if (frDist === 0) break;

  const gap = frDist - closerDist;
  const progress = ((f + 1) / 10).toFixed(0) + '0%';

  console.log(
    `   ${progress.padEnd(8)} | ${frDist.toFixed(0).padEnd(11)} | ${closerDist.toFixed(0).padEnd(6)} | ${gap.toFixed(1)} yards`,
  );
}

console.log('\n\nINTERPRETATION:');
console.log('- Negative gap = FrontRunner is ahead');
console.log('- Wider gaps in later furlongs show when frontRunner pulls away');
console.log('- If gap suddenly widens mid-race, that\'s when bonuses kick in');
console.log('- Look for where closer stops catching and starts falling further back');
