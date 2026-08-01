import type { Rng } from './rng.js';
import type { Aptitudes, Gender, Horse, Stats } from './types.js';
import { STAT_KEYS } from './types.js';
import { COAT_IDS, DISTANCE_BANDS, type DistanceBand, type Division, RUNNING_STYLES, type RunningStyle } from '../data/index.js';
import { RACING_TRAIT_IDS, TRAITS, type TraitId } from '../data/traits.js';
import type { NameGenerator } from '../data/names.js';

/**
 * Quality band per division.
 *
 * Horses are GENERATED to match their division — a Championship horse is rolled
 * as a Championship-quality animal, not a random horse handed a division label.
 * The emergent-chaos design depends entirely on this (DESIGN.md §2, §9):
 * because elite fields carry high Consistency, elite racing becomes precise on
 * its own, with no hardcoded "less randomness up here" rule.
 */
interface DivisionBand {
  core: [number, number];
  consistency: [number, number];
  jockey: [number, number];
}

const DIVISION_BANDS: Record<Division, DivisionBand> = {
  maiden: { core: [24, 40], consistency: [22, 46], jockey: [30, 60] },
  novice: { core: [33, 50], consistency: [34, 58], jockey: [38, 68] },
  open: { core: [43, 60], consistency: [46, 68], jockey: [46, 76] },
  stakes: { core: [53, 70], consistency: [58, 80], jockey: [55, 85] },
  championship: { core: [63, 82], consistency: [70, 92], jockey: [65, 95] },
};

const clamp100 = (v: number): number => Math.min(100, Math.max(1, Math.round(v)));

function rollStats(rng: Rng, band: DivisionBand): Stats {
  const [lo, hi] = band.core;
  const mid = (lo + hi) / 2;
  const spread = (hi - lo) / 2;

  const stat = (): number => clamp100(rng.normal(mid, spread * 1.6));

  return {
    speed: stat(),
    stamina: stat(),
    burst: stat(),
    grit: stat(),
    temper: stat(),
    consistency: clamp100(
      rng.normal(
        (band.consistency[0] + band.consistency[1]) / 2,
        (band.consistency[1] - band.consistency[0]) / 2,
      ),
    ),
  };
}

/** Hidden ceilings, always at or above current stats. */
function rollPotential(rng: Rng, stats: Stats, generosity = 1): Stats {
  const out = {} as Stats;
  for (const key of STAT_KEYS) {
    const headroom = rng.range(8, 45) * generosity;
    out[key] = clamp100(stats[key] + headroom);
  }
  return out;
}

/**
 * Aptitudes. One band is clearly best, the neighbouring band is decent, and the
 * far band is weak — so horses have a real distance identity without needing a
 * trait to say so (TRAITS.md rule 5).
 */
function rollAptitudes(rng: Rng, primary: DistanceBand): Aptitudes {
  const order: DistanceBand[] = ['sprint', 'mile', 'route'];
  const primaryIndex = order.indexOf(primary);

  const out = {} as Aptitudes;
  for (const band of DISTANCE_BANDS) {
    const distance = Math.abs(order.indexOf(band) - primaryIndex);
    const base = distance === 0 ? rng.range(74, 96) : distance === 1 ? rng.range(48, 72) : rng.range(22, 46);
    out[band] = clamp100(base);
  }
  return out;
}

/**
 * Traits: 2-4, with a third and fourth becoming likelier as legacy rises, so
 * generations of breeding work pay off visibly at the moment a foal is born.
 */
export function rollTraits(rng: Rng, legacy = 0, pool: TraitId[] = RACING_TRAIT_IDS): TraitId[] {
  const bonus = Math.min(0.45, legacy / 200);
  let count = 2;
  if (rng.chance(0.22 + bonus)) count = 3;
  if (count === 3 && rng.chance(0.06 + bonus * 0.4)) count = 4;

  const chosen: TraitId[] = [];
  const available = rng.shuffle(pool);
  for (const id of available) {
    if (chosen.length >= count) break;
    // Avoid pairing traits that flatly contradict each other.
    if (conflicts(chosen, id)) continue;
    chosen.push(id);
  }
  return chosen;
}

const CONFLICTS: [TraitId, TraitId][] = [
  ['railHugger', 'wideRunner'],
  ['herdAnimal', 'loner'],
  ['bigGame', 'stageFright'],
  ['earlyBloomer', 'lateBloomer'],
  ['hardKnocker', 'needsTime'],
  ['mudder', 'firmSpecialist'],
  ['mudder', 'allWeather'],
  ['firmSpecialist', 'allWeather'],
  ['fastGate', 'coiled'],
  ['alert', 'gateRusher'],
  ['turnOfFoot', 'relentless'],
  ['turnOfFoot', 'grinder'],
  ['relentless', 'grinder'],
  ['ironHorse', 'glassCannon'],
  ['bulldozer', 'highlyStrung'],
];

function conflicts(chosen: readonly TraitId[], candidate: TraitId): boolean {
  return CONFLICTS.some(
    ([a, b]) =>
      (candidate === a && chosen.includes(b)) || (candidate === b && chosen.includes(a)),
  );
}

export interface GenerateOptions {
  division: Division;
  age?: number;
  style?: RunningStyle;
  primaryBand?: DistanceBand;
  gender?: Gender;
  /** Starter horses roll deliberately weak so growth is felt (DESIGN.md §2). */
  starter?: boolean;
  legacy?: number;
}

export function generateHorse(rng: Rng, names: NameGenerator, opts: GenerateOptions): Horse {
  const band = DIVISION_BANDS[opts.division];
  const stats = rollStats(rng, band);

  if (opts.starter) {
    // 18-34 across the board, per the design. Potential is what makes them
    // differ, and that stays masked at selection.
    for (const key of STAT_KEYS) {
      stats[key] = clamp100(rng.range(18, 34));
    }
  }

  const style = opts.style ?? rng.pick(RUNNING_STYLES);
  const primaryBand = opts.primaryBand ?? rng.pick(DISTANCE_BANDS);

  return {
    // Derived purely from the rng so identity is reproducible from a seed.
    // A module-global counter here would silently break determinism.
    id: `h${Math.floor(rng.next() * 0xffffffff).toString(36)}`,
    name: names.next(),
    gender: opts.gender ?? (rng.chance(0.5) ? 'stallion' : 'mare'),
    age: opts.age ?? rng.int(2, 5),
    stats,
    potential: rollPotential(rng, stats, opts.starter ? 1.35 : 1),
    style,
    aptitudes: rollAptitudes(rng, primaryBand),
    traits: rollTraits(rng, opts.legacy ?? 0),
    condition: opts.starter ? 70 : clamp100(rng.range(58, 88)),
    morale: 60,
    division: opts.division,
    starts: opts.starter ? 0 : rng.int(0, 14),
    wins: 0,
    places: 0,
    shows: 0,
    // Rolled HERE, not by the caller. The demo harness used to overwrite this
    // afterwards, which meant every horse any other caller made was bay — and
    // Phase 3 generates seventy of them.
    coat: rng.pick(COAT_IDS),
    jockeySkill: clamp100(rng.range(band.jockey[0], band.jockey[1])),
  };
}

/**
 * The six starters (DESIGN.md §13).
 *
 * Guaranteed archetype spread — all four running styles covered, mixed distance
 * aptitudes, no duplicated traits across the six — so the opening choice is
 * always a real, legible one rather than six near-identical horses.
 */
export function generateStarterSix(rng: Rng, names: NameGenerator, legacy = 0): Horse[] {
  const styles: RunningStyle[] = [
    ...RUNNING_STYLES,
    rng.pick(RUNNING_STYLES),
    rng.pick(RUNNING_STYLES),
  ];
  const bands: DistanceBand[] = rng.shuffle([
    'sprint',
    'sprint',
    'mile',
    'mile',
    'route',
    'route',
  ] as DistanceBand[]);

  const seen = new Set<TraitId>();
  const horses: Horse[] = [];

  rng.shuffle(styles).forEach((style, i) => {
    const horse = generateHorse(rng, names, {
      division: 'maiden',
      age: 2,
      style,
      primaryBand: bands[i]!,
      starter: true,
      legacy,
    });

    // No duplicated traits across the six, so every option reads as distinct.
    horse.traits = horse.traits.filter((t) => !seen.has(t));
    while (horse.traits.length < 2) {
      const candidate = rng.pick(RACING_TRAIT_IDS);
      if (!seen.has(candidate) && !horse.traits.includes(candidate)) horse.traits.push(candidate);
    }
    horse.traits.forEach((t) => seen.add(t));

    horses.push(horse);
  });

  return horses;
}

/** Populates the living world, pyramid-weighted across divisions (DESIGN.md §9). */
export function generateWorld(
  rng: Rng,
  names: NameGenerator,
  population: Record<Division, number>,
): Horse[] {
  const world: Horse[] = [];
  for (const [division, count] of Object.entries(population) as [Division, number][]) {
    for (let i = 0; i < count; i++) {
      world.push(generateHorse(rng, names, { division }));
    }
  }
  return world;
}

export const traitName = (id: TraitId): string => TRAITS[id].name;
