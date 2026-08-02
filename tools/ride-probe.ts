import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from '../src/data/index.js';
import { createAiController } from '../src/sim/race/ai.js';
import { simulateRace } from '../src/sim/race/engine.js';
import * as K from '../src/sim/race/constants.js';
import type { ControlInput, RaceEntrant } from '../src/sim/race/types.js';
import type { Horse } from '../src/sim/types.js';

/**
 * Does riding the horse actually change the result?
 *
 * Gate 2 asks whether racing is fun, and the answer depends entirely on
 * whether the player's input matters. Under the kick-charge economy that
 * means TIMING, not effort — every ride here rides the same flat cruise
 * effort the real race screen does; the only variable is when (and how
 * often) the kick charge gets spent.
 *
 * What the numbers have to show, or the controls are decoration:
 *   - hands off must be well BELOW a fair share of wins
 *   - a well-timed kick must be ABOVE a fair share
 *   - a well-timed kick must beat a mistimed one, and beat spamming every
 *     charge on offer regardless of moment — or timing means nothing
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

type Ride = 'hands off' | 'kick mistimed' | 'kick in window' | 'spam every charge';

function run(seed: string, ride: Ride): { pos: number; margin: number; kicksLeft: number } {
  const { field: f, playerId } = field(seed);
  const me = f.find((h) => h.id === playerId)!;
  const [windowLo, windowHi] = K.MOMENT_WINDOWS[me.moment];
  const entrants: RaceEntrant[] = f.map((horse) => {
    if (horse.id !== playerId) return { horse };
    const base = createAiController(horse);
    let tapped = false;
    return {
      horse,
      // Rides the AI's own establish/hold/commit curve, exactly like the real
      // race screen with no input — see raceScreen.ts's mountRaceScreen.
      controller: (self, race): ControlInput => {
        const b = base(self, race);
        const inWindow = race.progress >= windowLo && race.progress <= windowHi;
        let kick = false;
        if (ride === 'kick mistimed' && !tapped && race.progress >= K.ESTABLISH_UNTIL) {
          kick = true;
          tapped = true;
        } else if (ride === 'kick in window' && !tapped && inWindow) {
          kick = true;
          tapped = true;
        } else if (ride === 'spam every charge' && self.kicksRemaining > 0) {
          kick = true;
        }
        return { effort: b.effort, kick, targetLane: b.targetLane };
      },
    };
  });
  const out = simulateRace(entrants, { furlongs: 8, going: 'good', hype: 0.65, seed: `${seed}-run` });
  const r = out.results.find((x) => x.horseId === playerId)!;
  return { pos: r.finishPosition, margin: r.margin, kicksLeft: r.kicksLeft };
}

const N = 150;
console.log('Does riding the horse change the result?  150 races each, same seeds.\n');
console.log('ride                    avg place   wins   top-3   avg beaten   charges left');
for (const ride of ['hands off', 'kick mistimed', 'kick in window', 'spam every charge'] as Ride[]) {
  let pos = 0, wins = 0, top3 = 0, margin = 0, kicksLeft = 0;
  for (let i = 0; i < N; i++) {
    const r = run(`ag-${i}`, ride);
    pos += r.pos; margin += r.margin; kicksLeft += r.kicksLeft;
    if (r.pos === 1) wins++;
    if (r.pos <= 3) top3++;
  }
  console.log(
    `${ride.padEnd(22)}  ${(pos / N).toFixed(2).padStart(7)}  ${String(wins).padStart(4)}  ` +
    `${String(top3).padStart(5)}   ${(margin / N).toFixed(1).padStart(8)}L   ${(kicksLeft / N).toFixed(1).padStart(10)}`,
  );
}
console.log(`\n(a fair share of wins is ${(N / FIELD_SIZE).toFixed(0)}/${N})`);
