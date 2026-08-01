import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from '../src/data/index.js';
import { createRace } from '../src/sim/race/engine.js';
import { createAiController } from '../src/sim/race/ai.js';
import { ESTABLISH_UNTIL } from '../src/sim/race/constants.js';
import type { ControlInput, RaceEntrant } from '../src/sim/race/types.js';
import type { Horse } from '../src/sim/types.js';

/** Mirrors PLAYER_CRUISE_CAP in the race screen. */
const CAP = 0.48;
const RACE_COUNT = 120;
const MARKS = [0.05, 0.1, 0.2, 0.28, 0.4, 0.6, 0.8, 1.0];

/**
 * Where does a hands-off ride's energy actually go?
 *
 * Written to answer a specific player complaint: stamina drains hard in the
 * opening, and never really comes back, which reads as "I can't win" rather
 * than "I misjudged the pace". This measures whether that is a perception or
 * a fact of the model — see the diagnosis in ROADMAP.md, "Known issue —
 * position costs more than it returns", which this script produced.
 *
 * Run: npm run energy-profile
 */

function buildField(seed: string): Horse[] {
  const rng = createRng(seed);
  const names = createNameGenerator(rng);
  return Array.from({ length: FIELD_SIZE }, (_, i) =>
    generateHorse(rng, names, {
      division: 'open',
      style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
      age: 4,
    }),
  );
}

function handsOffEntrants(field: Horse[], playerId: string): RaceEntrant[] {
  const me = field.find((h) => h.id === playerId)!;
  const base = createAiController(me);
  return field.map((horse) =>
    horse.id !== playerId
      ? { horse }
      : {
          horse,
          controller: (self, race): ControlInput => {
            const b = base(self, race);
            const settled = race.progress >= ESTABLISH_UNTIL;
            return {
              effort: settled ? Math.min(b.effort, CAP) : b.effort,
              kick: false,
              targetLane: b.targetLane,
            };
          },
        },
  );
}

const byStyle: Record<string, number[][]> = {};
const rateByPhase: Record<'establish' | 'cruise' | 'stretch', number[]> = {
  establish: [],
  cruise: [],
  stretch: [],
};

for (let n = 0; n < RACE_COUNT; n++) {
  const field = buildField(`energy-profile-${n}`);
  const me = field[n % field.length]!;
  byStyle[me.style] ??= MARKS.map(() => []);

  const entrants = handsOffEntrants(field, me.id);
  const race = createRace(entrants, {
    furlongs: 8,
    going: 'good',
    hype: 0.5,
    seed: `energy-profile-${n}`,
  });

  let markIndex = 0;
  while (race.step() && markIndex < MARKS.length) {
    const snap = race.snapshot();
    const p = snap.runners.find((r) => r.id === me.id)!;
    const band = snap.progress < ESTABLISH_UNTIL ? 'establish' : snap.progress < 0.7 ? 'cruise' : 'stretch';
    rateByPhase[band].push(p.energyRate);
    while (markIndex < MARKS.length && snap.progress >= MARKS[markIndex]!) {
      byStyle[me.style]![markIndex++]!.push(p.energy);
    }
  }
}

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;

console.log(`Energy remaining, hands-off ride, by fraction of the race run (${RACE_COUNT} races, 8f open)\n`);
console.log('style        ' + MARKS.map((m) => `${(m * 100).toFixed(0)}%`.padStart(6)).join(''));
for (const [style, cols] of Object.entries(byStyle)) {
  const row = cols
    .map((c) => (c.length ? mean(c).toFixed(0) : '-').padStart(6))
    .join('');
  console.log(style.padEnd(13) + row);
}

console.log('\nNet energy/sec by race phase, across all styles:');
for (const [phase, rates] of Object.entries(rateByPhase)) {
  console.log(`  ${phase.padEnd(10)} ${mean(rates).toFixed(2)}/s`);
}
