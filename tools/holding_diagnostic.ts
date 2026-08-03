/**
 * Diagnostic: Measure how much time each running style spends holding
 */

import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { RUNNING_STYLES, FIELD_SIZE, type RunningStyle } from '../src/data/index.js';
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

  // This is where we'd want to access detailed tick-by-tick data to track holding
  // But simulateRace likely doesn't return that level of detail
  // For now, we note the issue and recommend instrumenting the engine

  for (const horse of horses) {
    styleStats[horse.style].races++;
    // TODO: This requires adding holding tracking to engine.ts
    // We need to log when each horse enters/exits holding mode
  }
}

console.log('\n=== HOLDING BEHAVIOR DIAGNOSTIC ===\n');
console.log(
  'NOTE: To properly track holding, we need to instrument the race engine to log\n' +
  'when each horse enters/exits holding mode during the race.\n',
);

for (const style of RUNNING_STYLES) {
  const stats = styleStats[style];
  console.log(`\n${style}:`);
  console.log(`  Races: ${stats.races}`);
  console.log(`  (Requires engine instrumentation to show holding %)`);
}

console.log(
  '\n\nTo implement this, we need to:\n' +
  '1. Add a holding event tracker to the Runner state (engine.ts)\n' +
  '2. Log when holding becomes true/false during stepRunner()\n' +
  '3. Sum up total ticks with holding=true per horse\n' +
  '4. Report total holding time / total race time percentage\n',
);
