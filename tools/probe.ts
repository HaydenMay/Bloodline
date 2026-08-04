import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from '../src/data/index.js';
import { createRace } from '../src/sim/race/engine.js';
import { CHARGE_CAPACITY, METRES_PER_LENGTH } from '../src/sim/race/constants.js';
import type { RaceEntrant } from '../src/sim/race/types.js';

/**
 * Single-race trace.
 *
 * Not a gate — a diagnostic. Every real bug this project has hit was found by
 * tracing ONE race directly rather than reasoning about aggregates, so this
 * exists to make that cheap.
 *
 *   npm run probe -- [seed] [metres]
 */

const seed = process.argv[2] ?? 'probe-1';
const metres = Number(process.argv[3] ?? 1400);

const rng = createRng(seed);
const names = createNameGenerator(rng);
// A realistic race card: horses entered for a trip they are broadly suited to.
// Random preferences put 2200 m stayers in a 1400 m race, where DIST_FLOOR
// correctly buries them — an honest result, but it tells you about the
// field-building rather than about the riding you came here to look at.
const field = Array.from({ length: FIELD_SIZE }, (_, i) =>
  generateHorse(rng, names, {
    division: 'open',
    style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
    age: 4,
    distanceCentre: metres * rng.range(0.85, 1.15),
  }),
);

const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
const race = createRace(entrants, { metres, going: 'good', hype: 0.5, seed: `${seed}-run` });

console.log(`\n${metres} m, good going, field of ${field.length}, seed "${seed}"\n`);
console.log('runner                  style        moment    spd sta brs grt  jky   pref');
for (const h of field) {
  console.log(
    `${h.name.padEnd(22)}  ${h.style.padEnd(11)}  ${h.moment.padEnd(8)}  ` +
      `${String(h.stats.speed).padStart(3)} ${String(h.stats.stamina).padStart(3)} ` +
      `${String(h.stats.burst).padStart(3)} ${String(h.stats.grit).padStart(3)}  ` +
      `${String(h.jockeySkill).padStart(3)}   ${h.preferredDistance.min}-${h.preferredDistance.max}m`,
  );
}

// ---- Trace ----------------------------------------------------------------
const SAMPLES = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
let nextSample = 0;

console.log('\n--- trace: pace / tank / charges / rank, by leader progress ---');
while (race.step()) {
  const snap = race.snapshot();
  if (nextSample < SAMPLES.length && snap.progress >= SAMPLES[nextSample]!) {
    console.log(`\nat ${(SAMPLES[nextSample]! * 100).toFixed(0)}%  (t=${snap.elapsed.toFixed(1)}s)`);
    console.log('  runner                  rank  pace   charges  regen  behind');
    const leader = snap.leaderDistance;
    for (const r of [...snap.runners].sort((a, b) => a.rank - b.rank)) {
      const behind = (leader - r.distance) / METRES_PER_LENGTH;
      const dots = '#'.repeat(r.kicksRemaining) + '.'.repeat(CHARGE_CAPACITY - r.kicksRemaining);
      console.log(
        `  ${r.name.padEnd(22)}  ${String(r.rank).padStart(2)}   ` +
          `${r.effort.toFixed(2)}   ${dots}   ` +
          `${r.regenMult.toFixed(2)}  ${behind.toFixed(1).padStart(6)}L` +
          `${r.kicking ? '  KICK' : ''}${r.drafting ? '  draft' : ''}`,
      );
    }
    nextSample++;
  }
}

// ---- Result ---------------------------------------------------------------
const outcome = race.outcome();
console.log(
  `\n--- result --- (${outcome.duration.toFixed(1)}s, pace rating ${outcome.paceRating.toFixed(3)})\n`,
);
console.log('pos  runner                  style        moment      time   behind  chg  kicks');
const kicksBy = new Map<string, number>();
for (const e of outcome.events) {
  if (e.kind === 'kick') kicksBy.set(e.horseId, (kicksBy.get(e.horseId) ?? 0) + 1);
}
for (const r of outcome.results) {
  const h = field.find((f) => f.id === r.horseId)!;
  console.log(
    `${String(r.finishPosition).padStart(3)}  ${r.name.padEnd(22)}  ${h.style.padEnd(11)}  ` +
      `${h.moment.padEnd(8)}  ${r.time.toFixed(2)}s  ${r.margin.toFixed(1).padStart(6)}L  ` +
      `${String(r.kicksLeft).padStart(3)}  ${String(kicksBy.get(r.horseId) ?? 0).padStart(5)}`,
  );
}
console.log('');
