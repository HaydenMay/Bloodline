import { createRng } from '../src/sim/rng.js';
import { createNameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import {
  DIVISIONS,
  FIELD_SIZE,
  MOMENTS,
  MOMENT_WEIGHTS_BY_STYLE,
  RUNNING_STYLES,
  type Division,
  type RunningStyle,
} from '../src/data/index.js';
import { createRace, cruiseFor, simulateRace } from '../src/sim/race/engine.js';
import { MOMENT_SHIFT, paceFactor } from '../src/sim/race/pace.js';
import {
  ABSOLUTE_SPEED_CEILING,
  HOLD_FLOOR,
  PACE_MAX,
} from '../src/sim/race/constants.js';
import type { Horse } from '../src/sim/types.js';
import type { RaceEntrant } from '../src/sim/race/types.js';

/**
 * The balance harness — Gate 1 (REBUILD.md §16).
 *
 * Nothing reconnects to the UI until this passes. That single process rule is
 * what separates this rebuild from the three attempts that failed: every one of
 * those tuned against a running game, where no change could ever be attributed
 * to a cause.
 *
 *   npm run harness            (1200 races)
 *   RACES=250 npm run harness  (fast iteration while tuning)
 */

const RACES = Number(process.env.RACES ?? 1200);
const DEFAULT_METRES = 1400;

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const checks: Check[] = [];
const report = (name: string, pass: boolean, detail: string): void => {
  checks.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(38)} ${detail}`);
};

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// Field building
// ---------------------------------------------------------------------------

/**
 * A realistic race card.
 *
 * Horses are entered for a race they are broadly suited to, with real
 * variation — some are spot on, some are stretching or dropping in trip.
 * A uniformly random field puts 700 m sprinters in a 1400 m race, where
 * DIST_FLOOR correctly buries them, and the resulting margins say more about
 * the field-building than about the simulation.
 */
function buildField(
  seed: string,
  division: Division = 'open',
  styles?: RunningStyle[],
  metres = DEFAULT_METRES,
): Horse[] {
  const rng = createRng(seed);
  const names = createNameGenerator(rng);
  return Array.from({ length: FIELD_SIZE }, (_, i) => {
    const style = styles ? styles[i % styles.length]! : RUNNING_STYLES[i % RUNNING_STYLES.length]!;
    return generateHorse(rng, names, {
      division,
      style,
      age: 4,
      distanceCentre: metres * rng.range(0.85, 1.15),
    });
  });
}

function race(field: Horse[], seed: string, metres = DEFAULT_METRES) {
  const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
  return simulateRace(entrants, { metres, going: 'good', hype: 0.5, seed });
}

// ---------------------------------------------------------------------------
// I1-I5 — invariants. Never tuned; a failure here is a bug, not a balance call.
// ---------------------------------------------------------------------------

console.log('\nINVARIANTS\n');

// I1 — determinism
{
  const field = buildField('determinism');
  const a = JSON.stringify(race(field, 'det-run'));
  const b = JSON.stringify(race(field, 'det-run'));
  report('I1 determinism', a === b, a === b ? 'byte-identical' : 'DIVERGED');
}

// I3 — Moment is zero-sum
{
  const worst = Math.max(
    ...MOMENTS.map((m) => Math.abs(MOMENT_SHIFT[m].reduce((x, y) => x + y, 0))),
  );
  report('I3 moment shift is zero-sum', worst < 0.001, `worst row sums to ${worst.toFixed(5)}`);
}

// I5 — pace bounds
{
  let lo = Infinity;
  let hi = -Infinity;
  for (const style of RUNNING_STYLES) {
    for (const moment of MOMENTS) {
      for (let t = 0; t <= 1.0001; t += 0.005) {
        const p = paceFactor(style, moment, t);
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
      }
    }
  }
  const ok = lo >= HOLD_FLOOR && hi <= PACE_MAX;
  report('I5 pace stays in bounds', ok, `${lo.toFixed(3)} .. ${hi.toFixed(3)}`);
}

// I2 + I4 — speed ceiling and tank bounds, walked tick by tick
{
  let worstSpeedRatio = 0;
  let worstOffender = '';
  let tankOk = true;

  for (let n = 0; n < 120; n++) {
    const field = buildField(`ceiling-${n}`);
    const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
    const live = createRace(entrants, {
      metres: DEFAULT_METRES,
      going: 'good',
      hype: 0.5,
      seed: `ceiling-run-${n}`,
    });
    const ceiling = new Map(
      field.map((h) => [h.id, cruiseFor(h) * live.preRaceFor(h.id)]),
    );

    while (live.step()) {
      for (const r of live.snapshot().runners) {
        const ratio = r.speed / ceiling.get(r.id)!;
        if (ratio > worstSpeedRatio) {
          worstSpeedRatio = ratio;
          worstOffender = r.name;
        }
        if (r.chargeProgress < 0 || r.chargeProgress > 1) tankOk = false;
      }
    }
  }

  const ok = worstSpeedRatio <= ABSOLUTE_SPEED_CEILING;
  report(
    'I2 speed never exceeds the ceiling',
    ok,
    `worst ${worstSpeedRatio.toFixed(4)} vs ${ABSOLUTE_SPEED_CEILING}` +
      (ok ? '' : ` — ${worstOffender}`),
  );
  report('I4 tank stays in [0,1]', tankOk, tankOk ? 'clean' : 'OUT OF BOUNDS');
}

// ---------------------------------------------------------------------------
// B1/B2 — style and moment balance
// ---------------------------------------------------------------------------

console.log('\nBALANCE\n');

/** Win rate PER HORSE, so a fair share is 1/8 = 12.5% — the historical basis. */
const FAIR = 1 / FIELD_SIZE;
/** Within ±30% relative of fair: 8.75% .. 16.25%. */
const BAR = 0.3;

{
  const styleWins: Record<string, number> = {};
  const styleRuns: Record<string, number> = {};
  const momentWins: Record<string, number> = {};
  const momentRuns: Record<string, number> = {};
  const momentRolled: Record<string, number> = {};

  for (const s of RUNNING_STYLES) {
    styleWins[s] = 0;
    styleRuns[s] = 0;
  }
  for (const m of MOMENTS) {
    momentWins[m] = 0;
    momentRuns[m] = 0;
    momentRolled[m] = 0;
  }

  for (let n = 0; n < RACES; n++) {
    const field = buildField(`balance-${n}`);
    const byId = new Map(field.map((h) => [h.id, h]));
    for (const h of field) {
      styleRuns[h.style]! += 1;
      momentRuns[h.moment]! += 1;
      momentRolled[h.moment]! += 1;
    }
    const outcome = race(field, `balance-run-${n}`);
    const winner = byId.get(outcome.results[0]!.horseId)!;
    styleWins[winner.style]! += 1;
    momentWins[winner.moment]! += 1;
  }

  const styleRates = RUNNING_STYLES.map((s) => ({
    key: s,
    rate: styleWins[s]! / styleRuns[s]!,
  }));
  const worstStyle = styleRates.reduce((a, b) =>
    Math.abs(b.rate - FAIR) > Math.abs(a.rate - FAIR) ? b : a,
  );
  report(
    'B1 style balance',
    styleRates.every((r) => Math.abs(r.rate - FAIR) / FAIR <= BAR),
    styleRates.map((r) => `${r.key} ${pct(r.rate)}`).join('  ') +
      `   (worst ${worstStyle.key})`,
  );

  const momentRates = MOMENTS.map((m) => ({
    key: m,
    rate: momentRuns[m]! > 0 ? momentWins[m]! / momentRuns[m]! : 0,
  }));
  const worstMoment = momentRates.reduce((a, b) =>
    Math.abs(b.rate - FAIR) > Math.abs(a.rate - FAIR) ? b : a,
  );
  report(
    'B2 moment balance',
    momentRates.every((r) => Math.abs(r.rate - FAIR) / FAIR <= BAR),
    momentRates.map((r) => `${r.key} ${pct(r.rate)}`).join('  ') +
      `   (worst ${worstMoment.key})`,
  );

  // Sanity, not a gate: assignment should match the weight table.
  const totalRolled = MOMENTS.reduce((s, m) => s + momentRolled[m]!, 0);
  const expected: Record<string, number> = {};
  for (const m of MOMENTS) expected[m] = 0;
  for (const s of RUNNING_STYLES) {
    for (const m of MOMENTS) expected[m]! += MOMENT_WEIGHTS_BY_STYLE[s][m] / RUNNING_STYLES.length;
  }
  const drift = Math.max(
    ...MOMENTS.map((m) => Math.abs(momentRolled[m]! / totalRolled - expected[m]!)),
  );
  report('B2b moment assignment matches weights', drift < 0.03, `worst drift ${drift.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// B3 — pace collapse. The load-bearing one.
// ---------------------------------------------------------------------------

{
  // A lone front-runner in a field of closers/stalkers gets an uncontested lead.
  let loneWins = 0;
  const LONE_RACES = Math.min(RACES, 400);
  for (let n = 0; n < LONE_RACES; n++) {
    const field = buildField(`lone-${n}`, 'open', [
      'frontRunner',
      'closer',
      'stalker',
      'midPack',
      'closer',
      'stalker',
      'midPack',
      'closer',
    ]);
    const outcome = race(field, `lone-run-${n}`);
    if (outcome.results[0]!.horseId === field[0]!.id) loneWins += 1;
  }
  const loneRate = loneWins / LONE_RACES;

  // Three front-runners duelling should burn each other out.
  let duelWins = 0;
  for (let n = 0; n < LONE_RACES; n++) {
    const field = buildField(`duel-${n}`, 'open', [
      'frontRunner',
      'frontRunner',
      'frontRunner',
      'closer',
      'stalker',
      'midPack',
      'closer',
      'stalker',
    ]);
    const outcome = race(field, `duel-run-${n}`);
    const winnerIdx = field.findIndex((h) => h.id === outcome.results[0]!.horseId);
    if (winnerIdx >= 0 && winnerIdx < 3) duelWins += 1;
  }
  const duelRate = duelWins / LONE_RACES / 3;

  report(
    'B3 a contested lead wrecks front-runners',
    loneRate > duelRate * 1.4,
    `lone ${pct(loneRate)} -> each of three ${pct(duelRate)}`,
  );
}

// ---------------------------------------------------------------------------
// B4 — the dominance curve. Flat in the middle, steep at the ends.
// ---------------------------------------------------------------------------

{
  const edgeWinRate = (edge: number): number => {
    let wins = 0;
    const N = Math.min(RACES, 400);
    for (let n = 0; n < N; n++) {
      const field = buildField(`dom-${edge}-${n}`);
      // Rotate which style carries the edge. Pinning the hero to field[0] meant
      // it was always a frontRunner, so B4 measured B1's failure instead of the
      // dominance curve — a harness bug that read as a sim result.
      const hero = field[n % field.length]!;
      for (const key of ['speed', 'stamina', 'burst', 'grit'] as const) {
        hero.stats[key] = Math.min(100, Math.round(hero.stats[key] * (1 + edge)));
      }
      const outcome = race(field, `dom-run-${edge}-${n}`);
      if (outcome.results[0]!.horseId === hero.id) wins += 1;
    }
    return wins / N;
  };

  const small = edgeWinRate(0.05);
  const large = edgeWinRate(0.4);
  report(
    'B4 dominance curve',
    small >= 0.18 && small <= 0.38 && large >= 0.7,
    `+5% edge ${pct(small)} (want 18-38%)   +40% edge ${pct(large)} (want >=70%)`,
  );
}

// ---------------------------------------------------------------------------
// B5 — division sanity. Elite racing should tighten up emergently.
// ---------------------------------------------------------------------------

{
  const marginBy: Partial<Record<Division, number>> = {};
  const N = Math.min(RACES, 300);
  for (const division of DIVISIONS) {
    let total = 0;
    for (let n = 0; n < N; n++) {
      const field = buildField(`div-${division}-${n}`, division);
      const outcome = race(field, `div-run-${division}-${n}`);
      total += outcome.results[1]?.margin ?? 0;
    }
    marginBy[division] = total / N;
  }
  const maiden = marginBy.maiden!;
  const champ = marginBy.championship!;
  report(
    'B5 elite racing is tighter',
    champ < maiden,
    DIVISIONS.map((d) => `${d.slice(0, 5)} ${marginBy[d]!.toFixed(1)}L`).join('  '),
  );
}

// ---------------------------------------------------------------------------
// B6 — margin profile. The long-open "winning margins are too wide" issue.
// ---------------------------------------------------------------------------

{
  const byPlace: number[][] = Array.from({ length: FIELD_SIZE }, () => []);
  const N = Math.min(RACES, 400);
  for (let n = 0; n < N; n++) {
    const field = buildField(`margin-${n}`);
    const outcome = race(field, `margin-run-${n}`);
    for (const r of outcome.results) byPlace[r.finishPosition - 1]!.push(r.margin);
  }
  const median = (a: number[]): number => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const tail = median(byPlace[FIELD_SIZE - 1]!);
  report(
    'B6 margin profile',
    tail <= 20,
    byPlace.map((p, i) => `${i + 1}:${median(p).toFixed(1)}L`).join(' ') + `  (8th <= 20L)`,
  );
}

// ---------------------------------------------------------------------------
// Clock sanity — informational
// ---------------------------------------------------------------------------

{
  const durations: Record<number, number> = {};
  for (const metres of [700, 1400, 1609, 2400]) {
    let total = 0;
    const N = 60;
    for (let n = 0; n < N; n++) {
      const field = buildField(`clock-${metres}-${n}`, 'open', undefined, metres);
      total += race(field, `clock-run-${metres}-${n}`, metres).results[0]!.time;
    }
    durations[metres] = total / N;
  }
  console.log(
    `\n  clock   ` +
      Object.entries(durations)
        .map(([m, t]) => `${m}m ${t.toFixed(1)}s`)
        .join('   '),
  );
}

// ---------------------------------------------------------------------------

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks pass`);
if (failed.length > 0) {
  console.log(`failing: ${failed.map((c) => c.name).join(', ')}\n`);
  process.exitCode = 1;
} else {
  console.log('Gate 1 clear.\n');
}
