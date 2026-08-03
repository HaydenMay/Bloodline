/**
 * Diagnostic: Measure how much time each running style spends holding
 */

import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { RUNNING_STYLES, type RunningStyle } from '../src/data/index.js';
import { STAT_KEYS, type Horse } from '../src/sim/types.js';

const RACES = 50;
const SEED = 'holding-diag';

interface StyleStats {
  races: number;
  totalHoldTicks: number; // ticks spent holding
  totalRaceTicks: number; // total race ticks
  avgHoldPercent: number; // % of race spent holding
}

const styleStats: Record<RunningStyle, StyleStats> = {
  frontRunner: { races: 0, totalHoldTicks: 0, totalRaceTicks: 0, avgHoldPercent: 0 },
  stalker: { races: 0, totalHoldTicks: 0, totalRaceTicks: 0, avgHoldPercent: 0 },
  midPack: { races: 0, totalHoldTicks: 0, totalRaceTicks: 0, avgHoldPercent: 0 },
  closer: { races: 0, totalHoldTicks: 0, totalRaceTicks: 0, avgHoldPercent: 0 },
};

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

  // Now we have holding data! Track it by running style
  for (const result of outcome.results) {
    const horse = horses.find((h) => h.id === result.horseId)!;
    const stats = styleStats[horse.style];
    stats.races++;
    stats.totalHoldTicks += result.holdingTicks;
    stats.totalRaceTicks += Math.round(result.time * 30); // 30 Hz ticks per second
  }
}

console.log('\n=== HOLDING BEHAVIOR DIAGNOSTIC ===');
console.log(`${RACES} races analyzed\n`);
console.log('Running Style | Races | Avg Hold % | Total Hold Ticks');
console.log('─'.repeat(60));

for (const style of RUNNING_STYLES) {
  const stats = styleStats[style];
  stats.avgHoldPercent = stats.totalRaceTicks > 0 ? (stats.totalHoldTicks / stats.totalRaceTicks) * 100 : 0;

  console.log(
    `${style.padEnd(14)} | ${stats.races.toString().padEnd(5)} | ${stats.avgHoldPercent.toFixed(1).padEnd(9)}% | ${stats.totalHoldTicks}`,
  );
}

console.log('\n\nINTERPRETATION:');
console.log('- High hold % = spending time at 35% effort to build charges');
console.log('- Low hold % = riding at full effort the whole time');
console.log('- Closer should hold more than frontRunner (needs to build charges while chasing)');
console.log('- FrontRunner should hold less (has lead to defend)');
console.log('- If closer holds but is still weak, the issue is not holding strategy but position/timing');
