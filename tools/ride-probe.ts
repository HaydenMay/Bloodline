import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from '../src/data/index.js';
import { createAiController } from '../src/sim/race/ai.js';
import { simulateRace } from '../src/sim/race/engine.js';
import * as K from '../src/sim/race/constants.js';

/** Mirrors PLAYER_CRUISE_CAP in the race screen. */
const CAP = 0.48;
import type { ControlInput, RaceEntrant } from '../src/sim/race/types.js';
import type { Horse } from '../src/sim/types.js';

/**
 * Does riding the horse actually change the result?
 *
 * Gate 2 asks whether racing is fun, and the answer depends entirely on whether
 * the player's input matters. This measures it: the same seeds ridden four
 * ways, reporting wins and the reserve left at the wire.
 *
 * What the numbers have to show, or the controls are decoration:
 *   - hands off must be well BELOW a fair share of wins, and must FINISH WITH
 *     ITS RESERVE INTACT — the reserve is the player's to spend, and a ride
 *     that empties it before their window leaves them nothing to decide
 *   - a well-timed ride must be ABOVE a fair share
 *   - riding well must beat riding hard, or timing means nothing
 *
 * Run: npm run ride-probe
 */
function field(seed: string): { field: Horse[]; playerId: string } {
  const rng = createRng(seed);
  const names = createNameGenerator(rng);
  const f: Horse[] = Array.from({ length: FIELD_SIZE }, (_, i) =>
    generateHorse(rng, names, { division: 'open', style: RUNNING_STYLES[i % RUNNING_STYLES.length]!, age: 4 }),
  );
  return { field: f, playerId: f[Math.floor(rng.next() * f.length)]!.id };
}

type Ride = 'hands off' | 'urge in the window' | 'urge + kick' | 'urge the whole way';

function run(seed: string, ride: Ride): { pos: number; margin: number; energy: number } {
  const { field: f, playerId } = field(seed);
  const me = f.find((h) => h.id === playerId)!;
  const window = K.STYLE_PROFILES[me.style].kickAt;
  const entrants: RaceEntrant[] = f.map((horse) => {
    if (horse.id !== playerId) return { horse };
    const base = createAiController(horse);
    let kicked = false;
    return {
      horse,
      controller: (self, race): ControlInput => {
        const b = base(self, race);
        let effort = race.progress >= K.ESTABLISH_UNTIL ? Math.min(b.effort, CAP) : b.effort;
        const inWindow = Math.abs(race.progress - window) <= 0.09;
        let kick = false;
        if (ride === 'urge the whole way') effort = 1;
        else if (ride !== 'hands off' && race.progress >= window - 0.09) effort = 1;
        if (ride === 'urge + kick' && inWindow && !kicked) { kick = true; kicked = true; }
        return { effort, kick, targetLane: b.targetLane };
      },
    };
  });
  const out = simulateRace(entrants, { furlongs: 8, going: 'good', hype: 0.65, seed: `${seed}-run` });
  const r = out.results.find((x) => x.horseId === playerId)!;
  return { pos: r.finishPosition, margin: r.margin, energy: r.energyLeft };
}

const N = 150;
console.log('Does riding the horse change the result?  150 races each, same seeds.\n');
console.log('ride                    avg place   wins   top-3   avg beaten   energy left');
for (const ride of ['hands off', 'urge in the window', 'urge + kick', 'urge the whole way'] as Ride[]) {
  let pos = 0, wins = 0, top3 = 0, margin = 0, energy = 0;
  for (let i = 0; i < N; i++) {
    const r = run(`ag-${i}`, ride);
    pos += r.pos; margin += r.margin; energy += r.energy;
    if (r.pos === 1) wins++;
    if (r.pos <= 3) top3++;
  }
  console.log(
    `${ride.padEnd(22)}  ${(pos / N).toFixed(2).padStart(7)}  ${String(wins).padStart(4)}  ` +
    `${String(top3).padStart(5)}   ${(margin / N).toFixed(1).padStart(8)}L   ${(energy / N).toFixed(1).padStart(9)}`,
  );
}
console.log(`\n(a fair share of wins is ${(N / FIELD_SIZE).toFixed(0)}/${N})`);
