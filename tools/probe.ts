/**
 * Single-race diagnostic. Dumps how each running style's kick charges and
 * track position evolve, so a balance failure can be read rather than
 * guessed at.
 *
 *   npx tsx tools/probe.ts
 */

import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { RUNNING_STYLES } from '../src/data/index.js';
import { STAT_KEYS, type Horse } from '../src/sim/types.js';
import type { Controller, RaceView, RunnerView } from '../src/sim/race/types.js';
import { createAiController } from '../src/sim/race/ai.js';

const rng = createRng('probe');
const names = createNameGenerator(rng);

const horses: Horse[] = RUNNING_STYLES.map((style) => {
  const h = generateHorse(rng, names, { division: 'open', style, age: 4 });
  for (const k of STAT_KEYS) h.stats[k] = 55;
  h.aptitudes = { sprint: 80, mile: 80, route: 80 };
  h.jockeySkill = 60;
  h.condition = 75;
  h.traits = [];
  h.name = style;
  return h;
});
// Two of each so the field is eight, like a real race.
const field = [...horses, ...horses.map((h) => ({ ...h, id: h.id + 'b', name: h.name + '2' }))];

interface Sample {
  t: number;
  rows: { name: string; kicksRemaining: number; pos: number; effort: number; rank: number; speed: number; blocked: boolean }[];
}
const samples: Sample[] = [];
let lastSample = -1;

const spy =
  (h: Horse): Controller =>
  (self: RunnerView, race: RaceView) => {
    const base = createAiController(h);
    const out = base(self, race);
    const bucket = Math.floor(race.progress * 10);
    if (bucket !== lastSample && self.id === field[0]!.id) {
      lastSample = bucket;
      samples.push({ t: race.progress, rows: [] });
    }
    const s = samples[samples.length - 1];
    if (s && s.rows.length < field.length) {
      s.rows.push({
        name: self.name,
        kicksRemaining: self.kicksRemaining,
        pos: self.distance,
        effort: out.effort,
        rank: self.rank,
        speed: self.speed,
        blocked: self.blocked,
      });
    }
    return out;
  };

const outcome = simulateRace(
  field.map((horse) => ({ horse, controller: spy(horse) })),
  { furlongs: 8, going: 'good', hype: 0.5, seed: 'probe-race' },
);

console.log('\nCHARGES / RANK THROUGH THE RACE  (one of each style)\n');
console.log(
  'prog  ' +
    RUNNING_STYLES.map((s) => s.slice(0, 9).padEnd(11)).join('') ,
);
for (const s of samples) {
  const cells = RUNNING_STYLES.map((style) => {
    const row = s.rows.find((r) => r.name === style);
    return row ? `${row.kicksRemaining}c r${row.rank} `.padEnd(11) : ''.padEnd(11);
  });
  console.log(`${(s.t * 100).toFixed(0).padStart(3)}%  ` + cells.join(''));
}

console.log('\nEFFORT THROUGH THE RACE\n');
console.log('prog  ' + RUNNING_STYLES.map((s) => s.slice(0, 9).padEnd(11)).join(''));
for (const s of samples) {
  const cells = RUNNING_STYLES.map((style) => {
    const row = s.rows.find((r) => r.name === style);
    return row ? row.effort.toFixed(2).padEnd(11) : ''.padEnd(11);
  });
  console.log(`${(s.t * 100).toFixed(0).padStart(3)}%  ` + cells.join(''));
}

console.log('\nGAP TO LEADER, IN LENGTHS\n');
console.log('prog  ' + RUNNING_STYLES.map((s) => s.slice(0, 9).padEnd(11)).join(''));
for (const s of samples) {
  const lead = Math.max(...s.rows.map((r) => r.pos));
  const cells = RUNNING_STYLES.map((style) => {
    const row = s.rows.find((r) => r.name === style);
    return row ? `${((lead - row.pos) / 2.7).toFixed(1)}L`.padEnd(11) : ''.padEnd(11);
  });
  console.log(`${(s.t * 100).toFixed(0).padStart(3)}%  ` + cells.join(''));
}

console.log('\nRESULT\n');
outcome.results.forEach((r) =>
  console.log(
    `  ${r.finishPosition}. ${r.name.padEnd(14)} ${r.time.toFixed(2)}s  ${r.margin.toFixed(1)}L  ${r.kicksLeft} charges left`,
  ),
);
console.log(`\n  pace rating ${outcome.paceRating.toFixed(3)}\n`);
