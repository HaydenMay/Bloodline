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
  it('takes its traits from its parents', () => {
    const parentTraits = new Set(['grinder', 'ironLungs']);
    for (let i = 0; i < 40; i++) {
      const { foal } = breed(createRng(`traits-${i}`), sire, dam, 'T');
      for (const trait of foal.traits) expect(parentTraits.has(trait)).toBe(true);
    }
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
