import { describe, it, expect } from 'vitest';
import type { Horse, Stats } from '../sim/types.js';
import { createStable, type RetiredHorse, type Stable } from './career.js';
import { pedigreeOf } from './studBook.js';
import {
  allKnownHorses,
  buildAncestry,
  carriesAllele,
  isArchivedWorld,
  isSoldFoal,
  notableAllele,
  retiredRecordOf,
  rowsOf,
  siblingsOf,
} from './archiveTree.js';

function stats(value: number): Stats {
  return { speed: value, stamina: value, burst: value, grit: value, temper: value, consistency: value };
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

function retired(h: Horse, legacyBanked = 500): RetiredHorse {
  return {
    horse: h,
    legacyPeak: legacyBanked,
    legacyBanked,
    retirementReason: 'sound',
    wins: h.wins,
    starts: h.starts,
    earnings: 40_000,
    hallOfFame: false,
    retiredByInjury: false,
    retiredAt: Date.now(),
    careerNumber: 1,
  };
}

function emptyYard(over: Partial<Stable> = {}): Stable {
  const stable = createStable('archiveTree-1');
  stable.world = [];
  stable.bloodstock = [];
  return Object.assign(stable, over);
}

describe('buildAncestry / rowsOf', () => {
  const paternalGrandsire = horse({ id: 'pgs', name: 'Paternal Grandsire' });
  const paternalGranddam = horse({ id: 'pgd', name: 'Paternal Granddam', gender: 'mare' });
  const sire = horse({ id: 'sire', name: 'Sire', sireId: 'pgs', damId: 'pgd', generation: 2 });

  const maternalGrandsire = horse({ id: 'mgs', name: 'Maternal Grandsire' });
  const dam = horse({
    id: 'dam',
    name: 'Dam',
    gender: 'mare',
    sireId: 'mgs',
    // No damId recorded — an outside mare whose own dam was never tracked.
    generation: 2,
  });

  const root = horse({ id: 'root', name: 'Root', sireId: 'sire', damId: 'dam', generation: 3 });

  function pedigree(id: string): Horse | undefined {
    return [paternalGrandsire, paternalGranddam, sire, maternalGrandsire, dam, root].find(
      (h) => h.id === id,
    );
  }

  it('walks both parent lines and stops where a parent is unrecorded', () => {
    const tree = buildAncestry(root, pedigree);
    expect(tree.horse.id).toBe('root');
    expect(tree.sire?.horse.id).toBe('sire');
    expect(tree.dam?.horse.id).toBe('dam');
    expect(tree.sire?.sire?.horse.id).toBe('pgs');
    expect(tree.sire?.dam?.horse.id).toBe('pgd');
    expect(tree.dam?.sire?.horse.id).toBe('mgs');
    expect(tree.dam?.dam).toBeUndefined();
    expect(tree.dam?.damUnknown).toBe(false); // no damId at all is not "unknown", just absent
  });

  it('flags a recorded id that pedigree cannot resolve as unknown, not absent', () => {
    const orphan = horse({ id: 'orphan', sireId: 'ghost' });
    const tree = buildAncestry(orphan, () => undefined);
    expect(tree.sire).toBeUndefined();
    expect(tree.sireUnknown).toBe(true);
  });

  it('lays out rows in standard pedigree-chart order: paternal side before maternal', () => {
    const tree = buildAncestry(root, pedigree);
    const rows = rowsOf(tree);
    expect(rows[0]!.map((n) => n.horse.id)).toEqual(['root']);
    expect(rows[1]!.map((n) => n.horse.id)).toEqual(['sire', 'dam']);
    expect(rows[2]!.map((n) => n.horse.id)).toEqual(['pgs', 'pgd', 'mgs']);
  });

  it('gives every node a distinct path even when a horse repeats through linebreeding', () => {
    // A tight linebreed: root's sire and dam share the same grandsire.
    const sharedGrandsire = horse({ id: 'shared' });
    const inbredSire = horse({ id: 'is', sireId: 'shared' });
    const inbredDam = horse({ id: 'id', gender: 'mare', sireId: 'shared' });
    const inbredRoot = horse({ id: 'ir', sireId: 'is', damId: 'id' });
    const ped = (id: string): Horse | undefined =>
      [sharedGrandsire, inbredSire, inbredDam, inbredRoot].find((h) => h.id === id);

    const tree = buildAncestry(inbredRoot, ped);
    const rows = rowsOf(tree);
    const grandparentRow = rows[2]!;
    expect(grandparentRow.map((n) => n.horse.id)).toEqual(['shared', 'shared']);
    expect(new Set(grandparentRow.map((n) => n.path)).size).toBe(2);
  });

  it('never recurses past maxDepth, guarding a malformed save', () => {
    const tree = buildAncestry(root, pedigree, 1);
    expect(tree.sire?.horse.id).toBe('sire');
    expect(tree.sire?.sire).toBeUndefined();
    expect(tree.sire?.sireUnknown).toBe(false); // depth cap, not an unresolved id
  });
});

describe('siblingsOf', () => {
  const sire = horse({ id: 's' });
  const dam = horse({ id: 'd', gender: 'mare' });
  const foalA = horse({ id: 'a', sireId: 's', damId: 'd' });
  const foalB = horse({ id: 'b', sireId: 's', damId: 'd' });
  const halfSibling = horse({ id: 'c', sireId: 's', damId: 'other-dam' });
  const unrelated = horse({ id: 'z' });

  it('finds full siblings from the same pairing, excluding the horse itself', () => {
    const siblings = siblingsOf(foalA, [sire, dam, foalA, foalB, halfSibling, unrelated]);
    expect(siblings.map((h) => h.id)).toEqual(['b']);
  });

  it('is empty for a horse with no recorded parents', () => {
    expect(siblingsOf(unrelated, [sire, dam, foalA])).toEqual([]);
  });
});

describe('allKnownHorses', () => {
  it('combines bloodstock, world and worldArchive', () => {
    const bloodstockHorse = horse({ id: 'b1' });
    const worldHorse = horse({ id: 'w1' });
    const archivedHorse = horse({ id: 'a1' });
    const stable = emptyYard({
      bloodstock: [retired(bloodstockHorse)],
      world: [worldHorse],
      worldArchive: [archivedHorse],
    });
    expect(allKnownHorses(stable).map((h) => h.id).sort()).toEqual(['a1', 'b1', 'w1']);
  });

  it('agrees with pedigreeOf on what it can resolve', () => {
    const bloodstockHorse = horse({ id: 'b1' });
    const worldHorse = horse({ id: 'w1' });
    const archivedHorse = horse({ id: 'a1' });
    const stable = emptyYard({
      bloodstock: [retired(bloodstockHorse)],
      world: [worldHorse],
      worldArchive: [archivedHorse],
    });
    const pedigree = pedigreeOf(stable);
    for (const h of allKnownHorses(stable)) {
      expect(pedigree(h.id)?.id).toBe(h.id);
    }
  });
});

/**
 * The whole reason ageWorld (sim/worldRacing.ts) moves a rival to
 * worldArchive rather than deleting it: an ancestor a foal was bred from
 * must stay resolvable and identifiable forever, even after it ages out of
 * active racing.
 */
describe('isArchivedWorld', () => {
  it('is true for a horse only present in worldArchive', () => {
    const agedOut = horse({ id: 'aged-out' });
    const stable = emptyYard({ worldArchive: [agedOut] });
    expect(isArchivedWorld(agedOut, stable)).toBe(true);
  });

  it('is false for a horse still actively racing in world', () => {
    const active = horse({ id: 'active' });
    const stable = emptyYard({ world: [active] });
    expect(isArchivedWorld(active, stable)).toBe(false);
  });

  it('still resolves an archived ancestor through pedigreeOf', () => {
    const agedOut = horse({ id: 'aged-out' });
    const stable = emptyYard({ worldArchive: [agedOut] });
    expect(pedigreeOf(stable)('aged-out')?.id).toBe('aged-out');
  });
});

describe('isSoldFoal', () => {
  it('is true for a world horse with a recorded parent', () => {
    const sold = horse({ id: 'sold', sireId: 'someone' });
    const stable = emptyYard({ world: [sold] });
    expect(isSoldFoal(sold, stable)).toBe(true);
  });

  it('is false for a world horse the game seeded with no recorded parents', () => {
    const rival = horse({ id: 'rival' });
    const stable = emptyYard({ world: [rival] });
    expect(isSoldFoal(rival, stable)).toBe(false);
  });

  it('is false for a horse still in your own bloodstock, even with recorded parents', () => {
    const foal = horse({ id: 'kept', sireId: 'someone' });
    const stable = emptyYard({ bloodstock: [retired(foal)] });
    expect(isSoldFoal(foal, stable)).toBe(false);
  });
});

describe('retiredRecordOf', () => {
  it('finds the bloodstock entry for a horse in the tree', () => {
    const h = horse({ id: 'r1' });
    const stable = emptyYard({ bloodstock: [retired(h, 900)] });
    expect(retiredRecordOf(h, stable)?.legacyBanked).toBe(900);
  });

  it('is undefined for a horse the yard never retired', () => {
    const h = horse({ id: 'never' });
    expect(retiredRecordOf(h, emptyYard())).toBeUndefined();
  });
});

describe('notableAllele', () => {
  const EXTENSION = ['E', 'e'];
  const AGOUTI = ['A', 't', 'a'];

  it('is null for a pair homozygous on the top-dominance allele — nothing hides', () => {
    expect(notableAllele(['E', 'E'], EXTENSION)).toBeNull();
    expect(notableAllele(['A', 'A'], AGOUTI)).toBeNull();
  });

  it('surfaces the non-expressing allele when heterozygous', () => {
    expect(notableAllele(['E', 'e'], EXTENSION)).toBe('e');
    expect(notableAllele(['e', 'E'], EXTENSION)).toBe('e'); // order in the pair does not matter
    expect(notableAllele(['A', 't'], AGOUTI)).toBe('t');
    expect(notableAllele(['A', 'a'], AGOUTI)).toBe('a');
  });

  it('surfaces the shared allele when homozygous on anything but the top one', () => {
    expect(notableAllele(['e', 'e'], EXTENSION)).toBe('e');
    expect(notableAllele(['t', 't'], AGOUTI)).toBe('t');
    expect(notableAllele(['a', 'a'], AGOUTI)).toBe('a');
  });

  it('surfaces the more-recessive allele between two non-top alleles', () => {
    // t beats a in dominance, so t is what shows — a is still hidden beneath it.
    expect(notableAllele(['t', 'a'], AGOUTI)).toBe('a');
    expect(notableAllele(['a', 't'], AGOUTI)).toBe('a');
  });
});

describe('carriesAllele', () => {
  it('is true when a horse\'s recorded genotype carries the allele, however it expresses', () => {
    const bayCarrier = horse({
      id: 'carrier',
      coat: 'bay',
      coatGenotype: {
        extension: ['E', 'e'],
        agouti: ['A', 'A'],
        cream: ['n', 'n'],
        grey: ['n', 'n'],
        roan: ['n', 'n'],
        flaxen: ['F', 'F'],
      },
    });
    expect(carriesAllele(bayCarrier, 'extension', 'e')).toBe(true);
    expect(carriesAllele(bayCarrier, 'extension', 'E')).toBe(true);
    expect(carriesAllele(bayCarrier, 'agouti', 't')).toBe(false);
  });

  it('falls back to a derived genotype for a horse recorded before Stage 3, without throwing', () => {
    const preStage3 = horse({ id: 'old-timer', coat: 'chestnut' });
    expect(() => carriesAllele(preStage3, 'extension', 'e')).not.toThrow();
    // A chestnut horse is ee by definition, derived genotype or not.
    expect(carriesAllele(preStage3, 'extension', 'e')).toBe(true);
  });
});
