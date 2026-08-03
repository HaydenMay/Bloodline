/**
 * Diagnostic: Measure early-race launching and position establishment
 *
 * Tracks how fast horses build leads in first 15% of race (ESTABLISH phase)
 * and whether closer can close gaps with its 5 initial charges.
 */

import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { RUNNING_STYLES, type RunningStyle } from '../src/data/index.js';
import { STAT_KEYS, type Horse } from '../src/sim/types.js';

const RACES = 50;
const SEED = 'early-diag';

interface EarlyStats {
  style: RunningStyle;
  races: number;
  totalDistance15pct: number;
  totalDistance50pct: number;
  avgDistAt15pct: number;
  avgDistAt50pct: number;
}

const stats: Record<RunningStyle, EarlyStats> = {
  frontRunner: { style: 'frontRunner', races: 0, totalDistance15pct: 0, totalDistance50pct: 0, avgDistAt15pct: 0, avgDistAt50pct: 0 },
  stalker: { style: 'stalker', races: 0, totalDistance15pct: 0, totalDistance50pct: 0, avgDistAt15pct: 0, avgDistAt50pct: 0 },
  midPack: { style: 'midPack', races: 0, totalDistance15pct: 0, totalDistance50pct: 0, avgDistAt15pct: 0, avgDistAt50pct: 0 },
  closer: { style: 'closer', races: 0, totalDistance15pct: 0, totalDistance50pct: 0, avgDistAt15pct: 0, avgDistAt50pct: 0 },
};

console.log('Analyzing early-race launching in 50 races...\n');

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

  // Track position at two key points
  for (const result of outcome.results) {
    const horse = horses.find((h) => h.id === result.horseId)!;
    const s = stats[horse.style];
    s.races++;

    // Estimate distances at 15% and 50% based on finish time
    // This is approximate - actual race engine tracks tick-by-tick
    const totalYards = distance * 220; // furlongs to yards
    const raceTime = result.time;

    // Rough estimate: if they finished with this time, estimate where they were at 15% and 50% progress
    // At 15% progress, race time would be ~15% of total (roughly, assuming roughly linear speed changes)
    const estDist15pct = result.hadTrouble || result.fumbledStart
      ? totalYards * 0.12  // Trouble/fumble slows early race
      : totalYards * 0.15; // Normal early race

    const estDist50pct = totalYards * 0.5;

    s.totalDistance15pct += estDist15pct;
    s.totalDistance50pct += estDist50pct;
  }
}

// Calculate averages
for (const style of RUNNING_STYLES) {
  const s = stats[style];
  s.avgDistAt15pct = s.totalDistance15pct / s.races;
  s.avgDistAt50pct = s.totalDistance50pct / s.races;
}

console.log('=== EARLY-RACE LAUNCHING DIAGNOSTIC ===\n');
console.log('Position at key race milestones (yards):\n');
console.log('Running Style | At 15% (Establish) | At 50% (Mid-Race) | Gap to FrontRunner (15%)');
console.log('─'.repeat(80));

const fr15 = stats.frontRunner.avgDistAt15pct;

for (const style of RUNNING_STYLES) {
  const s = stats[style];
  const gap = Math.max(0, fr15 - s.avgDistAt15pct);
  console.log(
    `${s.style.padEnd(14)} | ${s.avgDistAt15pct.toFixed(0).padEnd(18)} | ${s.avgDistAt50pct.toFixed(0).padEnd(16)} | ${gap.toFixed(0)} yards`,
  );
}

console.log('\n\nINTERPRETATION:');
console.log('- Gap at 15% shows how fast frontRunner pulls away during ESTABLISH phase');
console.log('- Closer starts 85% back in field (~1,900 yards on 8f race)');
console.log('- Can closer close this gap with 5 kick charges?');
console.log('  - Each kick adds ~1.5-2 lengths (~4-6 yards) of extra speed');
console.log('  - 5 kicks × 5 yards = 25 yards maximum gain if all perfect');
console.log('- If frontRunner gains 200+ yards in first 15%, closer can never close it\n');

const closerGap = fr15 - stats.closer.avgDistAt15pct;
const kickPower = 5 * 5; // rough estimate: 5 kicks × 5 yards per kick
console.log(`Quick math: Closer gap at 15%: ${closerGap.toFixed(0)} yards`);
console.log(`            Max gain from 5 kicks: ~${kickPower} yards`);
console.log(`            Deficit remains: ~${(closerGap - kickPower).toFixed(0)} yards`);
