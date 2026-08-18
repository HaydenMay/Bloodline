import { describe, it, expect } from 'vitest';
import { STAT_KEYS, type Horse, type Stats } from '../sim/types.js';
import { pairingKey } from '../sim/breeding.js';
import { seedLegacyFromRecord } from '../data/legacy.js';
import { createStable, type RetiredHorse, type Stable } from './career.js';
import {
  breedFoal,
  outsideStuds,
  partnersFor,
  projectFoal,
  recordPairing,
  timesBred,
  toPartner,
} from './studBook.js';

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
    age: 5,
    stats: stats(60),
    potential: stats(75),
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

function retired(over: Partial<Horse> = {}, legacyBanked = 500): RetiredHorse {
  return {
    horse: horse(over),
    legacyPeak: legacyBanked,
    legacyBanked,
    retirementReason: 'sound',
    wins: 6,
    starts: 20,
    earnings: 40_000,
    hallOfFame: false,
    retiredByInjury: false,
    retiredAt: Date.now(),
    careerNumber: 1,
  };
}

/** A yard with no world horses, so partner sources can be tested one at a time. */
function emptyYard(over: Partial<Stable> = {}): Stable {
  const stable = createStable();
  stable.world = [];
  return Object.assign(stable, over);
}

describe('counting repeats', () => {
  const a = horse({ id: 'a' });
  const b = horse({ id: 'b', gender: 'mare' });

  it('starts every pairing as a first cross', () => {
    expect(timesBred(emptyYard(), a, b)).toBe(0);
  });

  it('counts a pairing the same whichever horse is named first', () => {
    const stable = emptyYard();
    recordPairing(stable, a, b);
    recordPairing(stable, b, a);
    expect(timesBred(stable, a, b)).toBe(2);
    expect(stable.pairings[pairingKey(a, b)]).toBe(2);
  });

  /**
   * The count is a fact about two horses, not about one career. If it reset
   * between careers the first-cross bonus would be farmable by simply retiring.
   */
  it('survives a yard being reloaded from its saved form', () => {
    const stable = emptyYard();
    recordPairing(stable, a, b);

    const reloaded = JSON.parse(JSON.stringify(stable)) as Stable;
    expect(timesBred(reloaded, a, b)).toBe(1);
  });

  it('reads a yard saved before breeding existed as never having bred', () => {
    const old = emptyYard();
    delete (old as Partial<Stable>).pairings;
    expect(timesBred(old, a, b)).toBe(0);
  });
});

describe('who a yard can breed to', () => {
  it('offers your own retirees of the opposite sex', () => {
    const stable = emptyYard();
    stable.bloodstock = [retired({ id: 'mare-1', gender: 'mare' }), retired({ id: 'colt-1' })];

    const options = partnersFor(stable, horse({ id: 'mine' }));
    expect(options.map((o) => o.partner.horse.id)).toEqual(['mare-1']);
    expect(options[0]!.source).toBe('bloodstock');
  });

  /**
   * The dead end the roadmap's decision table exists to prevent: bloodstock is
   * only what you retired, so two colts in a row would otherwise leave a player
   * unable to breed at all.
   */
  it('still offers partners to a yard holding nothing but colts', () => {
    const stable = createStable();
    stable.bloodstock = [retired({ id: 'colt-1' }), retired({ id: 'colt-2' })];

    const options = partnersFor(stable, horse({ id: 'mine', gender: 'stallion' }));
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => o.partner.horse.gender === 'mare')).toBe(true);
    expect(options.some((o) => o.source === 'outside')).toBe(true);
  });

  it('never offers a horse paired with itself', () => {
    const stable = emptyYard();
    const mine = horse({ id: 'mine' });
    stable.bloodstock = [retired({ id: 'mine', gender: 'mare' })];
    // Same id, opposite gender on the record: the id is what settles it.
    expect(partnersFor(stable, mine).some((o) => o.partner.horse.id === 'mine')).toBe(false);
  });

  /** §10 gates higher-calibre partners behind standing. */
  it('opens better studs to a yard with prestige than to an unknown one', () => {
    const classOf = (points: number): string[] => {
      const stable = createStable();
      stable.legacy.archivedPoints = points;
      return outsideStuds(stable, horse({ id: 'mine' }), 8).map((p) => p.horse.division);
    };

    const novice = classOf(0);
    const legend = classOf(9000);
    expect(novice.every((d) => d === 'novice' || d === 'maiden')).toBe(true);
    expect(legend.some((d) => d === 'stakes' || d === 'championship')).toBe(true);
  });

  /**
   * An outside stud never raced for you, so the career you did not watch stands
   * in for banked legacy — its **record and its class together**, through
   * `seedLegacyFromRecord`.
   *
   * This used to pass a hard `0` for earnings, and nothing recorded a rival's
   * wins either, so two of that function's three terms were always dead and
   * every stud of a division was worth exactly the same. `sim/worldRacing.ts`
   * and `generateHorse`'s prior record fixed the inputs; this is the contract
   * that they are actually read.
   */
  it('prices an outside stud off the career it actually had', () => {
    const stable = createStable();
    stable.legacy.archivedPoints = 9000;
    const studs = outsideStuds(stable, horse({ id: 'mine' }), 8);

    expect(studs.length).toBeGreaterThan(0);
    for (const stud of studs) {
      expect(stud.legacyBanked).toBe(
        seedLegacyFromRecord(stud.horse.wins ?? 0, stud.horse.earnings ?? 0, stud.horse.division),
      );
      expect(stud.hallOfFame).toBe(false);
    }
    // And a yard this well known is reaching horses with a record behind them.
    expect(studs.some((stud) => stud.legacyBanked > 0)).toBe(true);
  });

  /**
   * The defect that prompted the change, as a test: a screen full of outside
   * studs all reading the same figure told a player nothing, and sent them
   * choosing on stud fee instead.
   */
  it('does not price every stud of a division identically', () => {
    const stable = createStable();
    stable.legacy.archivedPoints = 9000;
    const studs = outsideStuds(stable, horse({ id: 'mine' }), 8);
    const figures = new Set(studs.map((stud) => stud.legacyBanked));

    expect(figures.size).toBeGreaterThan(1);
  });
});

describe('the projected foal', () => {
  const sire = toPartner(retired({ id: 'sire', potential: stats(70) }, 600));
  const dam = toPartner(retired({ id: 'dam', gender: 'mare', potential: stats(70) }, 600));

  it('previews the same pairing identically every time it is asked', () => {
    const first = projectFoal(sire, dam);
    const second = projectFoal(sire, dam);
    expect(second).toEqual(first);
  });

  it('gives every stat a range that contains its own low and high', () => {
    const projection = projectFoal(sire, dam);
    for (const key of STAT_KEYS) {
      expect(projection[key].high).toBeGreaterThanOrEqual(projection[key].low);
      expect(projection[key].low).toBeGreaterThan(0);
      expect(projection[key].high).toBeLessThanOrEqual(100);
    }
  });

  /**
   * §10's whole information policy rests on this: "ranges are naturally wider
   * for unrelated pairs and narrower for close family, so the mechanic is felt
   * without a rating". If the bands did not differ, the screen would be lying
   * about a choice that has no visible consequence.
   */
  it('shows a wider band for an outcross than for a parent bred to its foal', () => {
    const foal = toPartner(
      retired({ id: 'foal', gender: 'mare', potential: stats(70), sireId: 'sire', damId: 'x' }, 600),
    );

    const width = (p: ReturnType<typeof projectFoal>): number =>
      STAT_KEYS.reduce((sum, key) => sum + (p[key].high - p[key].low), 0);

    expect(width(projectFoal(sire, dam))).toBeGreaterThan(width(projectFoal(sire, foal)));
  });
});

describe('breeding a foal', () => {
  it('records the pairing so the next foal is a repeat', () => {
    const stable = emptyYard();
    const mine = toPartner(retired({ id: 'sire' }, 600));
    const partner = toPartner(retired({ id: 'dam', gender: 'mare' }, 600));

    breedFoal(stable, mine, partner);
    expect(timesBred(stable, mine.horse, partner.horse)).toBe(1);

    // §10: the base never degrades, only the bonus does.
    const first = breedFoal(stable, mine, partner);
    expect(timesBred(stable, mine.horse, partner.horse)).toBe(2);
    expect(first.budget.total).toBeGreaterThanOrEqual(first.budget.base);
  });

  /**
   * A pedigree cannot be corrected after the horses are gone.
   *
   * `breed` writes `sireId` from whichever partner it is handed first, so
   * picking a mare from your own yard recorded her as the sire — and Stage 3's
   * linebreeding and Stage 4's tree read those two fields as fact. The screen
   * lists your horse first whatever its sex, so the ordering has to be settled
   * here rather than by how a player happened to click.
   */
  it('records the stallion as the sire however the pairing was picked', () => {
    const stable = emptyYard();
    const myMare = toPartner(retired({ id: 'my-mare', gender: 'mare' }, 600));
    const outsideStallion = toPartner(retired({ id: 'his-stallion' }, 400));

    const { foal } = breedFoal(stable, myMare, outsideStallion);
    expect(foal.sireId).toBe('his-stallion');
    expect(foal.damId).toBe('my-mare');
  });

  it('writes both parents onto the foal', () => {
    const stable = emptyYard();
    const mine = toPartner(retired({ id: 'sire' }, 600));
    const partner = toPartner(retired({ id: 'dam', gender: 'mare' }, 600));

    const { foal } = breedFoal(stable, mine, partner);
    expect(foal.sireId).toBe('sire');
    expect(foal.damId).toBe('dam');
    expect(foal.generation).toBe(2);
    expect(foal.age).toBe(2);
    expect(foal.starts).toBe(0);
  });

  it('does not name a foal after a horse already in the yard', () => {
    const stable = emptyYard();
    stable.bloodstock = [retired({ id: 'sire', name: 'Storm Lantern' }, 600)];
    const mine = toPartner(stable.bloodstock[0]!);
    const partner = toPartner(retired({ id: 'dam', gender: 'mare', name: 'Brash Tide' }, 600));

    const { foal } = breedFoal(stable, mine, partner);
    expect(foal.name).not.toBe('Storm Lantern');
    expect(foal.name).not.toBe('Brash Tide');
  });
});
