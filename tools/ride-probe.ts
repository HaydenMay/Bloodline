import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from '../src/data/index.js';
import { createRace } from '../src/sim/race/engine.js';
import { KICK_PLAN } from '../src/sim/race/rider.js';
import type { RunningStyle } from '../src/data/index.js';
import type { PlayerInput, RaceEntrant } from '../src/sim/race/types.js';

/**
 * Player parity — REBUILD.md §16.3.
 *
 * Gate 1 asks whether AI vs AI is fair. This asks the different and more
 * important question: CAN A HUMAN COMPETE AT ALL? The owner's own play history
 * against the previous build was roughly fifty manual races, zero wins, best
 * result second, and "beaten a distance" about 80% of the time. A simulation
 * that passes every balance check and still cannot be won by hand has not
 * passed anything that matters.
 *
 * Each persona is a simple, human-plausible way to ride — none of them attempt
 * the AI's own precise cadence, because a person tapping a screen from
 * real-time feedback cannot.
 *
 *   npm run ride-probe
 */

const RACES = Number(process.env.RACES ?? 150);
const METRES = 1400;

type Persona = {
  name: string;
  /** Called every tick. Mutates `input` in place. */
  ride(
    input: PlayerInput,
    ctx: { progress: number; charges: number; style: RunningStyle },
  ): void;
};

const PERSONAS: Persona[] = [
  {
    // No input at all. Measures whether the shared autopilot is competent —
    // condition 3 below. A player who looks away must not be destroyed.
    name: 'hands off',
    ride() {},
  },
  {
    name: 'spam',
    ride(input, ctx) {
      input.kickPending = ctx.charges >= 1;
    },
  },
  {
    name: 'save late',
    ride(input, ctx) {
      input.takingBack = ctx.progress < 0.7;
      input.kickPending = ctx.progress >= 0.75 && ctx.charges >= 1;
    },
  },
  {
    name: 'spend early',
    ride(input, ctx) {
      input.kickPending = ctx.progress < 0.4 && ctx.charges >= 1;
    },
  },
  {
    // No holding at all — let the base ride settle the horse — and simply push
    // the charges into the business end of the race.
    name: 'late push',
    ride(input, ctx) {
      input.kickPending = ctx.progress >= 0.6 && ctx.charges >= 1;
    },
  },
  {
    name: 'finish only',
    ride(input, ctx) {
      input.kickPending = ctx.progress >= 0.8 && ctx.charges >= 1;
    },
  },
  {
    // Four kicks, evenly spread through the second half of the race. This is
    // what a player who has learned the game would actually do: not hoard, not
    // mash, just space them sensibly through the business end.
    name: 'spread',
    ride(input, ctx) {
      const points = [0.45, 0.62, 0.78, 0.92];
      input.kickPending = ctx.charges >= 1 && points.some((p) => ctx.progress >= p && ctx.progress < p + 0.02);
    },
  },
  {
    // Rides to the horse's OWN style, which the HUD tells the player. This is
    // the informed ride: a front-runner asserted early and defended late, a
    // closer held together and produced at the end. It should beat the
    // autopilot, because the autopilot's own schedule is degraded by jockey
    // error (jitter, a wasted kick) and this one is not.
    name: 'rides to style',
    ride(input, ctx) {
      const points = KICK_PLAN[ctx.style];
      input.kickPending =
        ctx.charges >= 1 && points.some((p) => ctx.progress >= p && ctx.progress < p + 0.02);
    },
  },
  {
    // THE CANONICAL GOOD RIDE, and the one the gate below is measured against.
    //
    // A player who has understood the game: let the jockey settle the horse
    // early, then spend every charge through the business end of the race,
    // where a kick's fatigue bill has the least race left to come due in. No
    // hoarding, no mashing, no holding for its own sake.
    name: 'well ridden',
    ride(input, ctx) {
      input.kickPending = ctx.progress >= 0.55 && ctx.charges >= 1;
    },
  },
];

interface Tally {
  wins: number;
  top3: number;
  places: number;
  beaten: number;
  kicks: number;
  left: number;
}

const results = new Map<string, Tally>();
for (const p of PERSONAS) {
  results.set(p.name, { wins: 0, top3: 0, places: 0, beaten: 0, kicks: 0, left: 0 });
}

for (const persona of PERSONAS) {
  const tally = results.get(persona.name)!;

  for (let n = 0; n < RACES; n++) {
    const rng = createRng(`ride-${n}`);
    const names = createNameGenerator(rng);
    const field = Array.from({ length: FIELD_SIZE }, (_, i) =>
      generateHorse(rng, names, {
        division: 'open',
        style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
        age: 4,
        distanceCentre: METRES * rng.range(0.85, 1.15),
      }),
    );

    // The same horse every time, so personas are compared on the RIDE.
    const playerHorse = field[n % field.length]!;
    const playerId = playerHorse.id;
    const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
    const race = createRace(entrants, {
      metres: METRES,
      going: 'good',
      hype: 0.5,
      seed: `ride-run-${n}`,
    });

    const input: PlayerInput = { takingBack: false, kickPending: false };
    race.setPlayer(playerId, input);

    let kicks = 0;
    while (race.step()) {
      const snap = race.snapshot();
      const me = snap.runners.find((r) => r.id === playerId)!;
      if (me.finished) continue;
      const before = me.kicksRemaining;
      persona.ride(input, {
        progress: me.distance / METRES,
        charges: me.kicksRemaining,
        style: playerHorse.style,
      });
      if (input.kickPending && before >= 1) kicks += 1;
    }

    const outcome = race.outcome();
    const me = outcome.results.find((r) => r.horseId === playerId)!;
    tally.places += me.finishPosition;
    tally.beaten += me.margin;
    tally.left += me.kicksLeft;
    tally.kicks += kicks;
    if (me.finishPosition === 1) tally.wins += 1;
    if (me.finishPosition <= 3) tally.top3 += 1;
  }
}

const FAIR = RACES / FIELD_SIZE;

console.log(`\n${RACES} races, ${METRES} m. Fair share of wins is ${FAIR.toFixed(0)}.\n`);
console.log('ride              avg place   wins   win%   top-3   avg beaten   charges left');
for (const p of PERSONAS) {
  const t = results.get(p.name)!;
  console.log(
    `${p.name.padEnd(18)}` +
      `${(t.places / RACES).toFixed(2).padStart(6)}` +
      `${String(t.wins).padStart(8)}` +
      `${((t.wins / RACES) * 100).toFixed(1).padStart(7)}%` +
      `${String(t.top3).padStart(7)}` +
      `${(t.beaten / RACES).toFixed(1).padStart(11)}L` +
      `${(t.left / RACES).toFixed(1).padStart(12)}`,
  );
}

// ---- The four pass conditions (REBUILD.md §16.3) ---------------------------

const rate = (name: string): number => results.get(name)!.wins / RACES;
const beaten = (name: string): number => results.get(name)!.beaten / RACES;

const wellRidden = rate('well ridden');
const spam = rate('spam');
const handsOff = rate('hands off');
const worstBeaten = Math.max(...PERSONAS.map((p) => beaten(p.name)));

const checks: [string, boolean, string][] = [
  ['a good ride earns a fair share', wellRidden >= 0.125, `${(wellRidden * 100).toFixed(1)}% (want >=12.5%)`],
  [
    'timing beats mashing',
    wellRidden - spam >= 0.03,
    `well ridden ${(wellRidden * 100).toFixed(1)}% vs spam ${(spam * 100).toFixed(1)}% (want +3pts)`,
  ],
  // The jockey does not kick, so a player who never taps leaves every charge
  // unspent. Riding has to beat not riding — this used to assert the opposite,
  // back when the autopilot kicked for you.
  [
    'riding beats not riding',
    wellRidden - handsOff >= 0.03,
    `ridden ${(wellRidden * 100).toFixed(1)}% vs hands off ${(handsOff * 100).toFixed(1)}% (want +3pts)`,
  ],
  ['nobody is blown out', worstBeaten <= 20, `worst ${worstBeaten.toFixed(1)}L (want <=20L)`],
];

console.log('');
for (const [name, pass, detail] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${detail}`);
}

const failed = checks.filter(([, pass]) => !pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks pass`);
if (failed.length > 0) process.exitCode = 1;
console.log('');
