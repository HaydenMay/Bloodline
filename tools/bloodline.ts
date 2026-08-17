import { createRng, type Rng } from '../src/sim/rng.js';
import { createNameGenerator, type NameGenerator } from '../src/data/names.js';
import { generateHorse } from '../src/sim/horse.js';
import { FIELD_SIZE } from '../src/data/index.js';
import { simulateRace } from '../src/sim/race/engine.js';
import { STAT_KEYS, type Horse, type Stats } from '../src/sim/types.js';
import { applyTrainedStat, advanceSeasonIfDue, getAgeTrainingFactor } from '../src/sim/growth.js';
import { updateAIDivisionProgression } from '../src/sim/division.js';
import {
  applyRaceToHorseLegacy,
  createHorseLegacy,
  getRetirementValue,
} from '../src/data/legacy.js';
import {
  breed,
  distributePotential,
  type BreedingPartner,
  type InheritanceBudget,
  type Pedigree,
} from '../src/sim/breeding.js';
import type { RaceEntrant } from '../src/sim/race/types.js';

/**
 * The bloodline trace — Phase 5's generational measurement.
 *
 * The balance harness measures one race. This measures one *line*: a starter is
 * campaigned through a real career, retired, bred, and its foal campaigned in
 * turn, for as many generations as asked. Nothing here is modelled — the races
 * are the race engine, the legacy is the legacy curve, the foals are
 * `sim/breeding.ts`.
 *
 * It exists because both bugs this module has produced — a line pinning every
 * stat at 100 by generation four, and clamping silently destroying points —
 * passed every unit test and were visible only by replaying generations. A foal
 * is an input to the next foal, so a term that reads as small compounds, and a
 * term that is fair on one pairing can still collapse a line over five.
 *
 *   npm run bloodline                    (24 yards, 6 generations)
 *   LINES=60 GENS=8 npm run bloodline    (a fuller sample)
 *   STARTS=18 npm run bloodline
 *
 * Read the **spread** column: the gap between a horse's best and worst
 * potential, which is how much shape it has. Breeding is meant to start roughly
 * uniform and grow more distinctive as a player breeds for a shape, so spread
 * should hold or widen down the generations. A spread column that halves every
 * generation is a world converging on one identical all-rounder, whatever the
 * averages say.
 *
 * Read **carry** beside it: how much of the founder's shape a descendant still
 * has, as a correlation against its own generation-1 ancestor. Spread says the
 * horse is distinctive; carry says it is distinctive *in the family's way*.
 * Both matter, and they can move independently.
 */

/** Yards traced in parallel. In `rival` they are each other's partners. */
const LINES = Number(process.env.LINES ?? 24);
const GENS = Number(process.env.GENS ?? 6);
/** Starts per career. §8's full career is 18-20. */
const STARTS = Number(process.env.STARTS ?? 18);

/**
 * Who a yard breeds to. All three are pairings the game offers, and they fail
 * in different ways, so the module has to hold up in all three.
 *
 *   rival    a neighbouring yard's retiree — a horse bred, raced and retired
 *            exactly as yours was. The ordinary outcross.
 *   outside  a stud rolled fresh by `generateHorse` at the class the line has
 *            reached. What an outside partner is, until Stage 2 prices them.
 *   own      the line bred back into itself, parent to foal. The tight line,
 *            which §10 wants safe and dull rather than broken.
 */
type PartnerMode = 'rival' | 'outside' | 'own';
const MODES: PartnerMode[] = ['rival', 'outside', 'own'];

// ---------------------------------------------------------------------------
// Measuring a horse
// ---------------------------------------------------------------------------

const values = (s: Stats): number[] => STAT_KEYS.map((k) => s[k]);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Best stat minus worst — how much shape a horse has. */
const spreadOf = (s: Stats): number => {
  const v = values(s);
  return Math.max(...v) - Math.min(...v);
};

/** Standard deviation across the six stats: a less spiky read than the range. */
const shapeSd = (s: Stats): number => {
  const v = values(s);
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};

/**
 * How alike two horses' shapes are, -1 to 1, ignoring how good either is.
 *
 * A line that climbs 20 points but keeps its stamina-over-speed character
 * correlates near 1. A line that has been averaged into an all-rounder
 * correlates near 0 — which is the failure this trace is looking for, and it is
 * invisible in the averages.
 */
function shapeCarry(a: Stats, b: Stats): number {
  const av = values(a);
  const bv = values(b);
  const am = mean(av);
  const bm = mean(bv);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < av.length; i++) {
    const x = av[i]! - am;
    const y = bv[i]! - bm;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/**
 * How much the same pairing varies from foal to foal.
 *
 * §10's central trade lives here: an outcross is a wide roll, boom or bust, and
 * a tight line is a narrow one, safe and dull. If this column does not fall as
 * a pairing gets closer, choosing an outcross over a tight line means nothing.
 *
 * Probed on its own seeds so the measurement never perturbs the line it is
 * measuring — the foal the yard actually keeps is the one bred from the yard's
 * own stream.
 */
function rollWidth(
  sire: Horse,
  dam: Horse,
  budget: InheritanceBudget,
  tag: string,
): number {
  const probes = Array.from({ length: 12 }, (_, n) =>
    distributePotential(createRng(`probe-${tag}-${n}`), sire, dam, budget.total, budget.relatedness),
  );
  return mean(
    STAT_KEYS.map((key) => {
      const xs = probes.map((p) => p[key]);
      const m = mean(xs);
      return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    }),
  );
}

// ---------------------------------------------------------------------------
// One career, raced for real
// ---------------------------------------------------------------------------

interface CareerOutcome {
  banked: number;
  hallOfFame: boolean;
  wins: number;
  division: string;
  peak: number;
}

const centreOf = (horse: Horse): number =>
  (horse.preferredDistance.min + horse.preferredDistance.max) / 2;

/**
 * A training block between two races.
 *
 * Deliberately even-handed rather than optimised: every stat gets the same
 * steady push toward its ceiling, so what a horse ends its career with is
 * decided by the potential it was born with rather than by a training strategy
 * this tool invented. `applyTrainedStat` supplies the real ceiling and the real
 * diminishing returns before it.
 */
function train(rng: Rng, horse: Horse): void {
  const factor = getAgeTrainingFactor(horse.age);
  for (const key of STAT_KEYS) {
    applyTrainedStat(horse, key, rng.range(1.5, 3.5) * factor);
  }
}

/**
 * Campaign a horse from its debut to retirement and bank what it earned.
 *
 * Promotion uses `updateAIDivisionProgression`, which applies the same points
 * ladder the player climbs without stopping for the promotion race the UI runs.
 * That gate is a single race on a horse that has already earned +5, so leaving
 * it out shifts a career by a race or two rather than by a division.
 */
function campaign(rng: Rng, names: NameGenerator, horse: Horse): CareerOutcome {
  const legacy = createHorseLegacy();

  for (let start = 0; start < STARTS; start++) {
    train(rng, horse);

    const metres = Math.round(centreOf(horse) * rng.range(0.95, 1.05));
    const field: Horse[] = [horse];
    for (let i = 1; i < FIELD_SIZE; i++) {
      field.push(
        generateHorse(rng, names, {
          division: horse.division,
          isAI: true,
          age: rng.int(2, 5),
          distanceCentre: metres * rng.range(0.9, 1.1),
        }),
      );
    }

    const entrants: RaceEntrant[] = field.map((h) => ({ horse: h }));
    const outcome = simulateRace(entrants, {
      metres,
      going: 'good',
      hype: 0.5,
      seed: `${horse.id}-r${start}`,
    });

    const position =
      outcome.results.find((r) => r.horseId === horse.id)?.finishPosition ?? FIELD_SIZE;

    horse.starts += 1;
    if (position === 1) horse.wins += 1;
    else if (position === 2) horse.places += 1;
    else if (position === 3) horse.shows += 1;

    const levelBefore = horse.divisionLevel;
    updateAIDivisionProgression(horse, position);
    const promoted = horse.divisionLevel > levelBefore;
    const demoted = horse.divisionLevel < levelBefore;

    applyRaceToHorseLegacy(legacy, position, horse.division, {
      promoted,
      demoted,
      newDivisionLevel: horse.divisionLevel,
    });

    advanceSeasonIfDue(horse, horse.starts);
  }

  const retirement = getRetirementValue(legacy);
  return {
    banked: retirement.banked,
    hallOfFame: legacy.hallOfFame,
    wins: horse.wins,
    division: horse.division,
    peak: legacy.peak,
  };
}

// ---------------------------------------------------------------------------
// The yards, generation by generation
// ---------------------------------------------------------------------------

interface GenerationRecord {
  generation: number;
  name: string;
  potential: Stats;
  avg: number;
  spread: number;
  sd: number;
  carry: number;
  budget: number;
  /** How much the pairing this horse was bred FROM varies foal to foal. */
  roll: number;
  banked: number;
  peak: number;
  hallOfFame: boolean;
  wins: number;
  division: string;
}

interface Yard {
  rng: Rng;
  names: NameGenerator;
  /** Every horse this line has produced, so relatedness can read grandparents. */
  archive: Map<string, Horse>;
  /** The horse currently in training. */
  horse: Horse;
  founder: Stats;
  records: GenerationRecord[];
  /** Set once its career is run, and read when a neighbour breeds to it. */
  retired?: BreedingPartner;
  /** The generation before it, which is what `own` breeds back to. */
  previous?: BreedingPartner | undefined;
}

/**
 * Every yard runs in lockstep, so a rival's retiree is available the moment
 * yours is — which is what the game does between careers.
 */
function traceWorld(mode: PartnerMode): Yard[] {
  const yards: Yard[] = Array.from({ length: LINES }, (_, i) => {
    const rng = createRng(`yard-${i}`);
    const names = createNameGenerator(rng);
    // Generation 1 is a starter, by definition (§1): it inherits nothing.
    const horse = generateHorse(rng, names, { division: 'maiden', age: 2, starter: true });
    horse.generation = 1;
    return {
      rng,
      names,
      horse,
      founder: { ...horse.potential },
      records: [],
      archive: new Map([[horse.id, horse]]),
    };
  });

  for (let gen = 1; gen <= GENS; gen++) {
    for (const yard of yards) {
      // Potential is read BEFORE the career: ageing erodes it from five onward,
      // so reading it after would measure the decline arc, not the breeding.
      const born: Stats = { ...yard.horse.potential };
      const racer: Horse = {
        ...yard.horse,
        stats: { ...yard.horse.stats },
        potential: { ...yard.horse.potential },
      };
      const career = campaign(yard.rng, yard.names, racer);

      yard.records.push({
        generation: gen,
        name: racer.name,
        potential: born,
        avg: mean(values(born)),
        spread: spreadOf(born),
        sd: shapeSd(born),
        carry: gen === 1 ? 1 : shapeCarry(yard.founder, born),
        budget: 0,
        roll: 0,
        banked: career.banked,
        peak: career.peak,
        hallOfFame: career.hallOfFame,
        wins: career.wins,
        division: career.division,
      });

      yard.previous = yard.retired;  // undefined in generation 1: nothing to breed back to yet
      yard.retired = {
        horse: racer,
        legacyBanked: career.banked,
        hallOfFame: career.hallOfFame,
      };
    }

    if (gen === GENS) break;

    for (let i = 0; i < yards.length; i++) {
      const yard = yards[i]!;
      const mine = yard.retired!;
      const partner = choosePartner(mode, yard, yards[(i + 1) % yards.length]!);
      const lookup: Pedigree = (id) =>
        yard.archive.get(id) ?? yards.find((y) => y.archive.has(id))?.archive.get(id);
      const { foal, budget } = breed(yard.rng, mine, partner, yard.names.next(), 0, lookup);
      yard.archive.set(foal.id, foal);
      const record = yard.records[yard.records.length - 1]!;
      record.budget = budget.total;
      record.roll = rollWidth(mine.horse, partner.horse, budget, `${mode}-${i}-${gen}`);
      yard.horse = foal;
    }
  }

  return yards;
}

/**
 * The other half of the pairing.
 *
 * `own` falls back to the neighbour for the first foal because a yard with one
 * starter has nothing of its own to breed to yet — the tight line can only
 * begin once there are two generations in the stable.
 */
function choosePartner(mode: PartnerMode, yard: Yard, neighbour: Yard): BreedingPartner {
  const mine = yard.retired!;

  if (mode === 'own' && yard.previous) return yard.previous;

  if (mode === 'outside') {
    const horse = generateHorse(yard.rng, yard.names, {
      division: mine.horse.division,
      age: 5,
      gender: mine.horse.gender === 'stallion' ? 'mare' : 'stallion',
    });
    // An outside stud that never raced for you has no career of yours to
    // carry, so it is priced at the class it comes from rather than a record.
    return { horse, legacyBanked: Math.round(mine.legacyBanked * 0.75), hallOfFame: false };
  }

  return neighbour.retired!;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pad = (s: string | number, n: number): string => String(s).padStart(n);
const DIVISION_ORDER = ['maiden', 'novice', 'open', 'stakes', 'championship'];

console.log(`\nBLOODLINE TRACE — ${LINES} yards, ${GENS} generations, ${STARTS} starts a career\n`);

const verdicts: string[] = [];

for (const mode of MODES) {
  const yards = traceWorld(mode);

  console.log(`\n${'='.repeat(78)}\nPARTNER: ${mode.toUpperCase()}\n`);

  if (mode === 'rival') {
    console.log('One line, horse by horse (yard-0). Columns SPD / STA / BRS / GRT / TMP / CON.\n');
    for (const r of yards[0]!.records) {
      const cells = values(r.potential)
        .map((v) => pad(Math.round(v), 4))
        .join('');
      console.log(
        `  GEN ${r.generation}  ${r.name.padEnd(16)}${cells}   ` +
          `avg ${pad(r.avg.toFixed(1), 5)}   spread ${pad(r.spread, 3)}   ` +
          `${r.wins} wins in ${r.division}, banked ${r.banked}`,
      );
    }
    console.log('');
  }

  console.log(
    '  gen    avg   spread     sd   carry   roll    budget   banked    peak   HoF   best div\n' +
      '  ---  -----   ------   ----   -----   ----   -------   ------   -----   ---   --------',
  );

  const perGen: { spread: number; carry: number; roll: number }[] = [];

  for (let gen = 1; gen <= GENS; gen++) {
    const rows = yards.map((yard) => yard.records[gen - 1]!).filter(Boolean);
    const avg = mean(rows.map((r) => r.avg));
    const spread = mean(rows.map((r) => r.spread));
    const sd = mean(rows.map((r) => r.sd));
    const carry = mean(rows.map((r) => r.carry));
    const roll = mean(rows.map((r) => r.roll));
    const budget = mean(rows.map((r) => r.budget));
    const banked = mean(rows.map((r) => r.banked));
    const peak = mean(rows.map((r) => r.peak));
    const hof = rows.filter((r) => r.hallOfFame).length / rows.length;
    const bestDiv =
      DIVISION_ORDER[Math.max(...rows.map((r) => DIVISION_ORDER.indexOf(r.division)))];

    perGen.push({ spread, carry, roll });
    console.log(
      `  ${pad(gen, 3)}  ${pad(avg.toFixed(1), 5)}   ${pad(spread.toFixed(1), 6)}   ` +
        `${pad(sd.toFixed(1), 4)}   ${pad(carry.toFixed(2), 5)}   ${pad(roll.toFixed(1), 4)}   ` +
        `${pad(Math.round(budget), 7)}   ` +
        `${pad(Math.round(banked), 6)}   ${pad(Math.round(peak), 5)}   ` +
        `${pad(`${Math.round(hof * 100)}%`, 3)}   ${bestDiv}`,
    );
  }

  // The verdict the roadmap asks for: does shape survive the generations?
  const first = perGen[0]!;
  const last = perGen[perGen.length - 1]!;
  const ratio = last.spread / first.spread;
  // A tight line is MEANT to narrow — §10 sells it as safe and dull. What it
  // must not do is flatten, so it is judged against a lower bar than an
  // outcross, and its carry has to stay high to be worth the trade at all.
  const bar = mode === 'own' ? 0.6 : 0.85;
  const held = ratio >= bar;

  const verdict =
    `  ${pad(mode, 7)}  spread ${first.spread.toFixed(1)} → ${last.spread.toFixed(1)} ` +
    `(${((ratio - 1) * 100).toFixed(0)}%)   carry ${last.carry.toFixed(2)}   ` +
    `roll ${mean(perGen.slice(0, -1).map((g) => g.roll)).toFixed(1)}   ` +
    `${held ? 'HOLDS' : 'CONVERGES'}`;
  verdicts.push(verdict);

  console.log(
    `\n  spread gen 1 ${first.spread.toFixed(1)} → gen ${GENS} ${last.spread.toFixed(1)} ` +
      `(${((ratio - 1) * 100).toFixed(0)}%) — ${
        held ? 'HOLDS' : 'CONVERGES toward an identical all-rounder'
      }`,
  );
}

console.log(`\n${'='.repeat(78)}\nVERDICT\n`);
for (const line of verdicts) console.log(line);
console.log('');
