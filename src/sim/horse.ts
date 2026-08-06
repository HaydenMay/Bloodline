import type { Rng } from './rng.js';
import type { DistancePreference, Gender, Horse, Stats } from './types.js';
import { STAT_KEYS } from './types.js';
import {
  COAT_IDS,
  type Division,
  type Moment,
  MOMENT_WEIGHTS_BY_STYLE,
  MOMENTS,
  RUNNING_STYLES,
  type RunningStyle,
} from '../data/index.js';
import {
  DIST_CENTRE_MAX,
  DIST_CENTRE_MIN,
  DIST_WIDTH_MAX,
  DIST_WIDTH_MIN,
} from './race/constants.js';
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
 * The distances a horse wants, in metres (REBUILD.md §7).
 *
 * Rolled as a centre and a width. The width matters as much as the centre: a
 * narrow range is a specialist that peaks higher and falls off a cliff outside
 * it, a wide one handles anything without ever being sharp. Neither is strictly
 * better, which is what keeps it a trade rather than a tier (TRAITS.md rule 5).
 *
 * Rounded to 25 m so the label reads as a distance a racecourse would post.
 */
function rollPreferredDistance(rng: Rng, centre?: number): DistancePreference {
  const mid = centre ?? rng.range(DIST_CENTRE_MIN, DIST_CENTRE_MAX);
  const width = rng.range(DIST_WIDTH_MIN, DIST_WIDTH_MAX);
  return {
    min: Math.round((mid - width / 2) / 25) * 25,
    max: Math.round((mid + width / 2) / 25) * 25,
  };
}

/**
 * WHEN a horse spends, weighted by its running style.
 *
 * Weighted rather than fixed so archetypes stay sensible without being
 * uniform — a closer almost always rolls `late`, but not quite always, and two
 * front-runners in the same field can genuinely differ.
 */
export function rollMoment(rng: Rng, style: RunningStyle): Moment {
  const weights = MOMENT_WEIGHTS_BY_STYLE[style];
  const total = MOMENTS.reduce((sum, m) => sum + weights[m], 0);
  let roll = rng.next() * total;
  for (const moment of MOMENTS) {
    roll -= weights[moment];
    if (roll <= 0) return moment;
  }
  return MOMENTS[MOMENTS.length - 1]!;
}

/**
 * Traits: 2-4, with a third and fourth becoming likelier as legacy rises, so
 * generations of breeding work pay off visibly at the moment a foal is born.
 */
export function rollTraits(rng: Rng, legacy = 0, pool: TraitId[] = RACING_TRAIT_IDS): TraitId[] {
  let count = 2;
  // Starters (legacy=0) always have exactly 2 traits. Bred horses can get 3 or 4.
  if (legacy > 0) {
    const bonus = Math.min(0.45, legacy / 200);
    if (rng.chance(0.22 + bonus)) count = 3;
    if (count === 3 && rng.chance(0.06 + bonus * 0.4)) count = 4;
  }

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
  moment?: Moment;
  /** Centre of the preferred distance range, in metres. Rolled if absent. */
  distanceCentre?: number;
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
  const moment = opts.moment ?? rollMoment(rng, style);

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
    moment,
    preferredDistance: rollPreferredDistance(rng, opts.distanceCentre),
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
  // Two short, two middle, two long — so the opening choice always spans the
  // whole distance ladder rather than offering six horses that want the same
  // trip. Metres, matching the preferred-length label the player actually sees.
  const centres: number[] = rng.shuffle([800, 950, 1400, 1600, 2000, 2300]);

  const seen = new Set<TraitId>();
  const horses: Horse[] = [];

  rng.shuffle(styles).forEach((style, i) => {
    const horse = generateHorse(rng, names, {
      division: 'maiden',
      age: 2,
      style,
      distanceCentre: centres[i]!,
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
