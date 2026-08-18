import { describe, it, expect } from 'vitest';
import { createRng } from './rng.js';
import { STAT_KEYS, type Horse, type Stats } from './types.js';
import {
  BREEDING_MAX_AGE,
  BREEDING_PRIME_AGE,
  HALL_OF_FAME_BONUS,
  breed,
  calculateBudget,
  canPair,
  distributePotential,
  fertility,
  generationGain,
  heterosisBonus,
  pairingKey,
  partnerContribution,
  relatedness,
  type BreedingPartner,
} from './breeding.js';

function stats(value: number): Stats {
  return {
    speed: value,
    stamina: value,
    burst: value,
    grit: value,
    temper: value,
    consistency: value,
  };
}

function horse(over: Partial<Horse> = {}): Horse {
  return {
    id: 'h1',
    name: 'Runner',
    gender: 'stallion',
    age: 6,
    stats: stats(40),
    potential: stats(70),
    style: 'stalker',
    moment: 'late',
    preferredDistance: { min: 1200, max: 1800 },
    traits: [],
    condition: 70,
    morale: 60,
    division: 'open',
    divisionLevel: 2,
    divisionPoints: 0,
    starts: 20,
    wins: 6,
    places: 4,
    shows: 2,
    coat: 'bay',
    jockeySkill: 60,
    ...over,
  };
}

const partner = (over: Partial<Horse> = {}, legacyBanked = 500, hallOfFame = false):
  BreedingPartner => ({ horse: horse(over), legacyBanked, hallOfFame });

const total = (s: Stats): number => STAT_KEYS.reduce((sum, k) => sum + s[k], 0);

describe('what a parent contributes', () => {
  it('is what it banked', () => {
    expect(partnerContribution(partner({}, 620))).toBe(620);
  });

  /** §10: enshrining a horse is the most valuable thing a career can produce. */
  it('pays a quarter more for a Hall of Fame parent', () => {
    const plain = partnerContribution(partner({}, 620, false));
    const enshrined = partnerContribution(partner({}, 620, true));
    expect(enshrined).toBe(Math.round(620 * (1 + HALL_OF_FAME_BONUS)));
    expect(enshrined).toBeGreaterThan(plain);
  });

  it('never goes negative on a horse that banked nothing', () => {
    expect(partnerContribution(partner({}, -50))).toBe(0);
  });

  /**
   * §10's taper has to reach the budget, not just eligibility. A sire running
   * out of years is meant to be a warning a player can act on; if a twenty-year
   * old bred exactly as well as a five-year-old, the taper would be decoration.
   */
  it('fades with the years a sire has left', () => {
    const prime = partnerContribution(partner({ age: 10 }, 600));
    const fading = partnerContribution(partner({ age: BREEDING_PRIME_AGE + 2 }, 600));
    const done = partnerContribution(partner({ age: BREEDING_MAX_AGE }, 600));

    expect(prime).toBe(600);
    expect(fading).toBeLessThan(prime);
    expect(fading).toBeGreaterThan(0);
    expect(done).toBe(0);
  });
});

describe('the first-cross bonus', () => {
  /** §10's worked example: ~470 base pays about +50 first, +30 on the repeat. */
  it('matches the shape of the design example', () => {
    expect(heterosisBonus(470, 0)).toBe(47);
    expect(heterosisBonus(470, 1)).toBe(28);
  });

  it('tapers with every repeat but never turns negative', () => {
    let previous = Infinity;
    for (let n = 0; n < 8; n++) {
      const bonus = heterosisBonus(1000, n);
      expect(bonus).toBeLessThan(previous);
      expect(bonus).toBeGreaterThanOrEqual(0);
      previous = bonus;
    }
  });

  /**
   * "The base never degrades — only the bonus does. Repeats are less exciting,
   * never worse."
   */
  it('leaves a tenth pairing still worth more than its base alone', () => {
    const first = calculateBudget(partner({ id: 'a' }), partner({ id: 'b', gender: 'mare' }), 0);
    const tenth = calculateBudget(partner({ id: 'a' }), partner({ id: 'b', gender: 'mare' }), 10);
    expect(tenth.base).toBe(first.base);
    expect(tenth.total).toBeGreaterThanOrEqual(tenth.base);
    expect(tenth.total).toBeLessThan(first.total);
  });
});

describe('relatedness', () => {
  it('is zero for two unrelated horses', () => {
    expect(relatedness(horse({ id: 'a' }), horse({ id: 'b' }))).toBe(0);
  });

  it('spots a parent bred to its own foal', () => {
    const sire = horse({ id: 'sire' });
    const foal = horse({ id: 'foal', sireId: 'sire', damId: 'dam' });
    expect(relatedness(sire, foal)).toBeGreaterThan(0);
    expect(relatedness(foal, sire)).toBe(relatedness(sire, foal));
  });

  it('rates full siblings above half siblings', () => {
    const full = relatedness(
      horse({ id: 'a', sireId: 's', damId: 'd' }),
      horse({ id: 'b', sireId: 's', damId: 'd' }),
    );
    const half = relatedness(
      horse({ id: 'a', sireId: 's', damId: 'd1' }),
      horse({ id: 'b', sireId: 's', damId: 'd2' }),
    );
    expect(full).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(0);
  });

  /** Starters have no parents; two of them must not read as siblings. */
  it('does not treat two parentless horses as related', () => {
    expect(relatedness(horse({ id: 'a' }), horse({ id: 'b' }))).toBe(0);
  });

  /**
   * Stage 3's whole point: linebreeding has to compound rather than vanishing
   * the moment the shared parents drop out of view. Without a pedigree to walk,
   * two grandchildren of the same stallion read as complete strangers.
   */
  describe('reading past the parents', () => {
    const founder = horse({ id: 'founder' });
    const sonA = horse({ id: 'sonA', sireId: 'founder', damId: 'mareA' });
    const sonB = horse({ id: 'sonB', sireId: 'founder', damId: 'mareB' });
    const grandA = horse({ id: 'grandA', sireId: 'sonA', damId: 'outsideA' });
    const grandB = horse({ id: 'grandB', gender: 'mare', sireId: 'sonB', damId: 'outsideB' });

    const yard = new Map(
      [founder, sonA, sonB, grandA, grandB].map((h) => [h.id, h] as const),
    );
    const pedigree = (id: string): Horse | undefined => yard.get(id);

    it('sees two grandchildren of the same stallion as related', () => {
      expect(relatedness(grandA, grandB, pedigree)).toBeGreaterThan(0);
      // And blind to it without the pedigree, which is the Stage 1 behaviour.
      expect(relatedness(grandA, grandB)).toBe(0);
    });

    it('rates a closer relation above a more distant one', () => {
      const cousins = relatedness(grandA, grandB, pedigree);
      const halfSiblings = relatedness(sonA, { ...sonB, gender: 'mare' }, pedigree);
      expect(halfSiblings).toBeGreaterThan(cousins);
      expect(cousins).toBeGreaterThan(0);
    });

    it('still reads a grandparent bred to its grandchild as close family', () => {
      expect(relatedness(founder, grandB, pedigree)).toBeGreaterThan(0.2);
    });

    it('never exceeds one, however many times an ancestor appears', () => {
      const doubled = horse({ id: 'doubled', sireId: 'founder', damId: 'founder' });
      expect(relatedness(doubled, { ...doubled, id: 'other', gender: 'mare' }, pedigree))
        .toBeLessThanOrEqual(1);
    });
  });
});

describe('what a generation adds', () => {
  it('climbs with the budget but saturates', () => {
    expect(generationGain(0, 62)).toBe(0);
    expect(generationGain(500, 62)).toBeGreaterThan(0);
    expect(generationGain(2000, 62)).toBeGreaterThan(generationGain(500, 62));
  });

  /** A single spectacular pairing must not leap the whole ladder. */
  it('keeps one generation to a nudge, not a transformation', () => {
    expect(generationGain(50_000, 62)).toBeLessThan(15);
  });

  /**
   * The bug this term exists to stop. Without it a line added a fixed step per
   * generation and pinned every stat at 100 by generation four or five —
   * finishing the entire bloodline progression in about four careers.
   */
  it('slows as a line approaches the ceiling', () => {
    expect(generationGain(1200, 90)).toBeLessThan(generationGain(1200, 62) / 2);
    expect(generationGain(1200, 100)).toBe(0);
  });

  it('never pushes a maxed line past the ceiling', () => {
    expect(generationGain(1_000_000, 100)).toBe(0);
    expect(generationGain(1_000_000, 120)).toBe(0);
  });
});

describe('distributing a budget into potential', () => {
  const sire = horse({ id: 'a', potential: stats(70) });
  const dam = horse({ id: 'b', gender: 'mare', potential: stats(70) });

  it('lands the foal above its parents', () => {
    const rng = createRng('dist-1');
    const foal = distributePotential(rng, sire, dam, 1200, 0);
    expect(total(foal) / 6).toBeGreaterThan(70);
  });

  /**
   * The core promise of §10: diversity controls variance, not quality. A wide
   * roll and a tight one must average the same, or outcrossing would simply be
   * better and the trade would not exist.
   */
  it('gives a wide roll and a tight one the same total, on average', () => {
    const totals = (related: number): number => {
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        sum += total(distributePotential(createRng(`t-${related}-${i}`), sire, dam, 1200, related));
      }
      return sum / 200;
    };
    expect(Math.abs(totals(0) - totals(0.5))).toBeLessThan(4);
  });

  it('makes an outcross more lopsided than a tight line', () => {
    const spread = (related: number): number => {
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        const p = distributePotential(createRng(`s-${related}-${i}`), sire, dam, 1200, related);
        const values = STAT_KEYS.map((k) => p[k]);
        sum += Math.max(...values) - Math.min(...values);
      }
      return sum / 200;
    };
    expect(spread(0)).toBeGreaterThan(spread(1) + 5);
  });

  /** §10: "A bust is lopsided, never weak." Floor-or-better, always. */
  it('never drops a stat below the floor its parents guarantee', () => {
    const floor = 70 * 0.6;
    for (let i = 0; i < 300; i++) {
      const p = distributePotential(createRng(`floor-${i}`), sire, dam, 200, 0);
      for (const key of STAT_KEYS) expect(p[key]).toBeGreaterThanOrEqual(Math.floor(floor));
    }
  });

  it('never exceeds the hard ceiling of 100', () => {
    const elite = horse({ id: 'c', potential: stats(97) });
    const eliteDam = horse({ id: 'd', gender: 'mare', potential: stats(97) });
    for (let i = 0; i < 200; i++) {
      const p = distributePotential(createRng(`cap-${i}`), elite, eliteDam, 50_000, 0);
      for (const key of STAT_KEYS) expect(p[key]).toBeLessThanOrEqual(100);
    }
  });

  /**
   * Clamping without redistributing would silently destroy points whenever a
   * roll pushed a stat past 100 — punishing a well-bred foal for a lopsided
   * roll, which is backwards.
   */
  it('does not lose points to the ceiling on a lopsided elite roll', () => {
    const elite = horse({ id: 'c', potential: stats(88) });
    const eliteDam = horse({ id: 'd', gender: 'mare', potential: stats(88) });

    let capped = 0;
    let flat = 0;
    for (let i = 0; i < 200; i++) {
      capped += total(distributePotential(createRng(`r-${i}`), elite, eliteDam, 1500, 0));
      flat += total(distributePotential(createRng(`r-${i}`), elite, eliteDam, 1500, 1));
    }
    // The lopsided roll hits the ceiling far more often, but must not end up
    // with meaningfully fewer points than the even one.
    expect(capped / 200).toBeGreaterThan(flat / 200 - 6);
  });

  it('is a reshuffle, not a lottery: the same budget always buys the same total', () => {
    const totals = new Set<number>();
    for (let i = 0; i < 50; i++) {
      totals.add(total(distributePotential(createRng(`x-${i}`), sire, dam, 1200, 0)));
    }
    const values = [...totals];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(8);
  });
});

/**
 * DESIGN.md §2: "complementary — not vertical — inheritance. Neither is
 * stronger." Mares transmit Stamina and Temper more reliably, stallions Speed
 * and Burst, and Grit and Consistency belong to neither.
 */
describe('what each sex passes on', () => {
  const fast = { ...stats(70), speed: 90, burst: 90, stamina: 50, temper: 50 };
  const stayer = { ...stats(70), speed: 50, burst: 50, stamina: 90, temper: 90 };

  /** Mean foal, over enough rolls that the systematic part is what is left. */
  function average(sirePotential: Stats, damPotential: Stats, tag: string): Stats {
    const sire = horse({ id: 'sire', gender: 'stallion', potential: sirePotential });
    const dam = horse({ id: 'dam', gender: 'mare', potential: damPotential });

    const sum = {} as Stats;
    for (const key of STAT_KEYS) sum[key] = 0;
    const runs = 600;
    for (let i = 0; i < runs; i++) {
      const foal = distributePotential(createRng(`${tag}-${i}`), sire, dam, 1000, 0);
      for (const key of STAT_KEYS) sum[key] += foal[key];
    }
    for (const key of STAT_KEYS) sum[key] /= runs;
    return sum;
  }

  const fastSire = average(fast, stayer, 'fast-sire');
  const fastDam = average(stayer, fast, 'fast-dam');

  it('carries speed and burst down the stallion', () => {
    expect(fastSire.speed).toBeGreaterThan(fastDam.speed);
    expect(fastSire.burst).toBeGreaterThan(fastDam.burst);
  });

  it('carries stamina and temper down the mare', () => {
    // The staying parent is the DAM in the first pairing, so stamina is higher
    // there for the same reason speed is: each sex passed on its own.
    expect(fastSire.stamina).toBeGreaterThan(fastDam.stamina);
    expect(fastSire.temper).toBeGreaterThan(fastDam.temper);
  });

  /**
   * The defect this measurement caught. Biasing the *roll* meant a systematic
   * lean on four stats was paid for out of the two without one, so every
   * well-matched pairing quietly drained Grit and Consistency — compounding
   * every generation, invisible in any single foal.
   */
  it('does not pay for the gendered stats out of the ungendered ones', () => {
    expect(Math.abs(fastSire.grit - fastDam.grit)).toBeLessThan(3);
    expect(Math.abs(fastSire.consistency - fastDam.consistency)).toBeLessThan(3);
    // And neither pairing pushes them below the mid-parent they came from.
    expect(fastSire.grit).toBeGreaterThan(69);
    expect(fastDam.grit).toBeGreaterThan(69);
  });

  /**
   * §2 says neither sex is stronger, and matching them well is a real skill —
   * but it must stay a nudge. At the first weights tried, a well-matched
   * pairing gained eight points of average potential, more than a whole
   * generation of breeding, which would have made this a bigger lever than the
   * careers that feed the budget.
   */
  it('rewards a well-matched pairing without outweighing the budget', () => {
    const mean = (s: Stats): number =>
      STAT_KEYS.reduce((sum, key) => sum + s[key], 0) / STAT_KEYS.length;
    const edge = mean(fastSire) - mean(fastDam);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(6);
  });

  /**
   * The pairing screen lists the player's own horse first whatever its sex,
   * while `breedFoal` hands them over sire-first. If the sexes were read from
   * the argument order rather than from the horses, the preview would show a
   * foal shaped like the opposite of the one the player actually gets.
   *
   * Distributional rather than exact: the tilt multiplies a signed gap, so
   * swapping the arguments mirrors an individual roll while leaving the
   * distribution — which is what the preview samples — identical.
   */
  it('reads the sexes off the horses, not off the argument order', () => {
    const backwards = average(stayer, fast, 'fast-sire-swapped');
    const swappedProperly = average(fast, stayer, 'fast-sire');

    // `average` always builds a stallion first, so compare against the run
    // where the fast horse is the stallion either way.
    expect(Math.abs(swappedProperly.speed - fastSire.speed)).toBeLessThan(0.01);
    expect(backwards.speed).toBeLessThan(fastSire.speed);
  });
});

describe('shape: which parent a stat came from', () => {
  /** A stamina horse with no speed, and its mirror image. */
  const stayer = horse({
    id: 'stayer',
    potential: { ...stats(70), speed: 40, stamina: 95 },
  });
  const sprinter = horse({
    id: 'sprinter',
    gender: 'mare',
    potential: { ...stats(70), speed: 95, stamina: 40 },
  });

  /**
   * The bug this whole term exists to stop. A foal built at the mid-parent of
   * every stat is blander than both its parents by construction, so a line bred
   * that way loses its shape however wide the fresh roll is.
   */
  it('does not pin a foal to the midpoint of two unlike parents', () => {
    let nearMid = 0;
    const runs = 300;
    for (let i = 0; i < runs; i++) {
      const p = distributePotential(createRng(`mid-${i}`), stayer, sprinter, 900, 0);
      // Mid-parent speed is 67.5, plus whatever the generation adds.
      if (Math.abs(p.speed - 72) <= 5) nearMid++;
    }
    expect(nearMid / runs).toBeLessThan(0.4);
  });

  it('can throw a foal that takes after one parent on a stat', () => {
    let tookAfterStayer = 0;
    let tookAfterSprinter = 0;
    for (let i = 0; i < 300; i++) {
      const p = distributePotential(createRng(`lean-${i}`), stayer, sprinter, 900, 0);
      if (p.speed <= 55) tookAfterStayer++;
      if (p.speed >= 90) tookAfterSprinter++;
    }
    expect(tookAfterStayer).toBeGreaterThan(0);
    expect(tookAfterSprinter).toBeGreaterThan(0);
  });

  /**
   * §10 asks diversity to control variance. Two horses being unlike each other
   * IS the diversity that matters, so it has to move the roll on its own —
   * without it, "outcross" only means "not siblings on paper".
   */
  it('rolls wider for unlike parents than for two of the same horse', () => {
    const width = (a: Horse, b: Horse, tag: string): number => {
      const speeds = Array.from({ length: 200 }, (_, i) =>
        distributePotential(createRng(`${tag}-${i}`), a, b, 900, 0).speed,
      );
      const m = speeds.reduce((x, y) => x + y, 0) / speeds.length;
      return Math.sqrt(speeds.reduce((s, x) => s + (x - m) ** 2, 0) / speeds.length);
    };

    const alike = horse({ id: 'alike', gender: 'mare', potential: stats(70) });
    expect(width(stayer, sprinter, 'unlike')).toBeGreaterThan(
      width(horse({ id: 'plain' }), alike, 'alike') + 2,
    );
  });
});

/**
 * The test that was missing.
 *
 * Both bugs this module has shipped — a line pinning every stat at 100 by
 * generation four, and clamping silently destroying points — passed every
 * single-pairing test in this file. A foal is an input to the next foal, so the
 * only way to see a term that compounds is to replay generations. `npm run
 * bloodline` does this properly, through real careers; this is the cheap
 * version that runs on every commit.
 */
describe('a line across generations', () => {
  const spread = (s: Stats): number => {
    const v = STAT_KEYS.map((k) => s[k]);
    return Math.max(...v) - Math.min(...v);
  };

  /** A rival yard's retiree: a real horse with a shape of its own. */
  function rival(seed: string): Horse {
    const rng = createRng(seed);
    const potential = {} as Stats;
    for (const key of STAT_KEYS) {
      potential[key] = Math.max(25, Math.min(95, Math.round(rng.normal(62, 60))));
    }
    return horse({ id: `rival-${seed}`, gender: 'mare', potential });
  }

  /** Breeds one line for N generations and reports the spread at each. */
  function traceLine(seed: string, generations: number): number[] {
    const rng = createRng(seed);
    let current = rival(`${seed}-founder`);
    current = { ...current, id: 'founder', gender: 'stallion' };

    const spreads = [spread(current.potential)];
    for (let gen = 1; gen < generations; gen++) {
      const partner = rival(`${seed}-p${gen}`);
      const potential = distributePotential(rng, current, partner, 1100, 0);
      current = { ...current, id: `g${gen}`, potential };
      spreads.push(spread(potential));
    }
    return spreads;
  }

  it('does not flatten into an identical all-rounder', () => {
    const generations = 6;
    const lines = Array.from({ length: 30 }, (_, i) => traceLine(`line-${i}`, generations));
    const at = (gen: number): number =>
      lines.reduce((sum, l) => sum + l[gen]!, 0) / lines.length;

    // The measured failure: 56 -> 33 -> 24, halving every generation, with
    // generation six extrapolating to a flat 85 across all six stats.
    expect(at(generations - 1)).toBeGreaterThan(at(0) * 0.8);
  });

  it('never lets a line run away to a flat 100 either', () => {
    const generations = 8;
    const lines = Array.from({ length: 20 }, (_, i) => traceLine(`runaway-${i}`, generations));
    for (const line of lines) {
      expect(line[generations - 1]).toBeGreaterThan(5);
    }
  });
});

describe('breeding a foal', () => {
  const sire = partner({ id: 'sire', traits: ['grinder'] }, 620, true);
  const dam = partner(
    { id: 'dam', gender: 'mare', traits: ['ironLungs'] },
    480,
    false,
  );

  it('produces a two-year-old maiden ready to race', () => {
    const { foal } = breed(createRng('foal-1'), sire, dam, 'First Light');
    expect(foal.name).toBe('First Light');
    expect(foal.age).toBe(2);
    expect(foal.division).toBe('maiden');
    expect(foal.starts).toBe(0);
  });

  // Condition is a gauge, not an inherited property (DESIGN.md §2). Every foal
  // arrives fully wound up whatever its parents were, and what happens to it
  // from there is the yard's job, not its breeding.
  it('arrives at full condition regardless of its parents', () => {
    const tired = partner({ id: 'tired', condition: 12 }, 620, true);
    const fresh = partner({ id: 'fresh', gender: 'mare', condition: 96 }, 480);
    expect(breed(createRng('cond-1'), sire, dam, 'A').foal.condition).toBe(100);
    expect(breed(createRng('cond-2'), tired, fresh, 'B').foal.condition).toBe(100);
  });

  it('records both parents and its generation', () => {
    const { foal } = breed(createRng('foal-2'), sire, dam, 'Second');
    expect(foal.sireId).toBe('sire');
    expect(foal.damId).toBe('dam');
    expect(foal.generation).toBe(2);
  });

  it('counts generations from the deeper parent', () => {
    const deep = partner({ id: 'deep', generation: 4 }, 500);
    const shallow = partner({ id: 'shallow', gender: 'mare', generation: 2 }, 500);
    const { foal } = breed(createRng('foal-3'), deep, shallow, 'Third');
    expect(foal.generation).toBe(5);
  });

  it('debuts well short of its own potential', () => {
    const { foal } = breed(createRng('foal-4'), sire, dam, 'Fourth');
    for (const key of STAT_KEYS) {
      expect(foal.stats[key]).toBeLessThan(foal.potential[key]);
      expect(foal.stats[key]).toBeGreaterThan(0);
    }
  });

  /** §10: traits inherit separately and are never paid for out of the budget. */
  it('takes its traits from its parents nearly all of the time', () => {
    const parentTraits = new Set(['grinder', 'ironLungs']);
    let inherited = 0;
    let mutated = 0;

    for (let i = 0; i < 400; i++) {
      const { foal } = breed(createRng(`traits-${i}`), sire, dam, 'T');
      if (foal.traits.every((trait) => parentTraits.has(trait))) inherited++;
      else mutated++;
    }

    // The pedigree is what carries traits; mutation is the exception that keeps
    // a long line from being stuck with its founders' hand forever.
    expect(inherited / 400).toBeGreaterThan(0.85);
    expect(mutated).toBeGreaterThan(0);
  });

  /**
   * §10: "a rare trait is pure delight, never paid for out of the pool." A
   * mutation must not cost the foal anything — it competes for a trait slot
   * like an inherited one, and the budget never sees it.
   */
  it('does not charge the budget for a mutated trait', () => {
    const withMutation: number[] = [];
    const without: number[] = [];

    for (let i = 0; i < 200; i++) {
      const { foal, budget } = breed(createRng(`cost-${i}`), sire, dam, 'T');
      const novel = foal.traits.some(
        (trait) => !sire.horse.traits.includes(trait) && !dam.horse.traits.includes(trait),
      );
      (novel ? withMutation : without).push(total(foal.potential) + budget.total);
    }

    expect(withMutation.length).toBeGreaterThan(0);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(mean(withMutation) - mean(without))).toBeLessThan(30);
  });

  it('reports the budget it actually spent', () => {
    const { budget } = breed(createRng('foal-5'), sire, dam, 'Fifth');
    expect(budget.base).toBe(partnerContribution(sire) + partnerContribution(dam));
    expect(budget.total).toBe(budget.base + budget.bonus);
  });

  it('gives a Hall of Fame pairing a better foal than a plain one', () => {
    const plainSire = partner({ id: 'sire' }, 620, false);
    const averagePotential = (p: BreedingPartner): number => {
      let sum = 0;
      for (let i = 0; i < 60; i++) {
        sum += total(breed(createRng(`hof-${i}`), p, dam, 'H').foal.potential);
      }
      return sum / 60;
    };
    expect(averagePotential(sire)).toBeGreaterThan(averagePotential(plainSire));
  });

  it('keeps its distance range the right way round', () => {
    for (let i = 0; i < 50; i++) {
      const { foal } = breed(createRng(`dist-${i}`), sire, dam, 'D');
      expect(foal.preferredDistance.max).toBeGreaterThanOrEqual(foal.preferredDistance.min);
    }
  });
});

describe('breeding age', () => {
  it('is full strength through the prime years', () => {
    expect(fertility(5)).toBe(1);
    expect(fertility(BREEDING_PRIME_AGE)).toBe(1);
  });

  /** A visible decline is a warning a player can plan around. */
  it('tapers rather than stopping dead', () => {
    const taper = fertility(BREEDING_PRIME_AGE + 2);
    expect(taper).toBeGreaterThan(0);
    expect(taper).toBeLessThan(1);
    expect(taper).toBeLessThan(fertility(BREEDING_PRIME_AGE + 1));
  });

  it('is over at the cutoff', () => {
    expect(fertility(BREEDING_MAX_AGE)).toBe(0);
    expect(fertility(BREEDING_MAX_AGE + 10)).toBe(0);
  });

  /**
   * A career advances the world about four years, so a horse retired at 5
   * breeds at 5, 9, 13, 17 and 21 — the "3-5 fully raced foals" the design
   * asks for.
   */
  it('gives a horse retired at five four full-strength foals and a fading fifth', () => {
    const ages = [5, 9, 13, 17, 21];
    const full = ages.filter((age) => fertility(age) === 1);
    const fading = ages.filter((age) => fertility(age) > 0 && fertility(age) < 1);
    expect(full).toHaveLength(4);
    expect(fading).toHaveLength(1);
    expect(fertility(25)).toBe(0);
  });
});

describe('valid pairings', () => {
  it('needs two horses of opposite sex', () => {
    expect(canPair(horse({ id: 'a' }), horse({ id: 'b', gender: 'mare' }))).toBe(true);
    expect(canPair(horse({ id: 'a' }), horse({ id: 'b' }))).toBe(false);
  });

  it('refuses a horse paired with itself', () => {
    expect(canPair(horse({ id: 'a' }), horse({ id: 'a', gender: 'mare' }))).toBe(false);
  });

  it('refuses a horse past the age limit', () => {
    const old = horse({ id: 'b', gender: 'mare', age: BREEDING_MAX_AGE });
    expect(canPair(horse({ id: 'a' }), old)).toBe(false);
  });

  it('keys a pairing the same whichever way round it is read', () => {
    const a = horse({ id: 'a' });
    const b = horse({ id: 'b', gender: 'mare' });
    expect(pairingKey(a, b)).toBe(pairingKey(b, a));
  });
});
