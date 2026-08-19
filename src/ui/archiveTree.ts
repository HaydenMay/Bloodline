import { toGrade, type Grade, type Horse, type StatKey } from '../sim/types.js';
import type { Pedigree } from '../sim/breeding.js';
import { genotypeOf, type CoatGenotype } from '../sim/coat.js';
import type { RetiredHorse, Stable } from './career.js';

/**
 * The pedigree tree's data layer — DOM-free, like `studBook.ts` next to it.
 *
 * `sim/breeding.ts` already gives us `pedigreeOf` (bloodstock + world, indexed
 * by id) and every foal's `sireId`/`damId`/`generation` since Stage 1
 * (ROADMAP.md, "What Stage 1 must record"). This module turns that into a
 * tree the screen can walk and draw: the direct ancestor chart NEXT_PLAN.md
 * Step 1 asks for, plus the sibling and "sold foal" lookups its settings need.
 */

/** One card's place in the chart. Same horse can appear twice — that is linebreeding. */
export interface AncestorNode {
  horse: Horse;
  /** 0 at the root, 1 for parents, 2 for grandparents, and so on. */
  depth: number;
  /** Unique per position in the chart, even when the same horse repeats. */
  path: string;
  sire?: AncestorNode;
  dam?: AncestorNode;
  /** Had a `sireId`/`damId` that no known horse resolves to — pedigree ends here, unrecorded. */
  sireUnknown: boolean;
  damUnknown: boolean;
}

/**
 * Walks the ancestor chart from `horse` upward.
 *
 * Stops a branch the moment it runs out of recorded parents — either the
 * horse is a starter or outside horse (no `sireId`/`damId` at all), or an id
 * is recorded but `pedigree` cannot resolve it (an ancestor the yard never
 * had anything to do with). `maxDepth` is a backstop against a malformed
 * save with a cycle in it; real pedigrees end long before it matters.
 */
export function buildAncestry(
  horse: Horse,
  pedigree: Pedigree,
  maxDepth = 12,
  depth = 0,
  path = '0',
): AncestorNode {
  const node: AncestorNode = { horse, depth, path, sireUnknown: false, damUnknown: false };
  if (depth >= maxDepth) return node;

  if (horse.sireId) {
    const sire = pedigree(horse.sireId);
    if (sire) node.sire = buildAncestry(sire, pedigree, maxDepth, depth + 1, `${path}s`);
    else node.sireUnknown = true;
  }
  if (horse.damId) {
    const dam = pedigree(horse.damId);
    if (dam) node.dam = buildAncestry(dam, pedigree, maxDepth, depth + 1, `${path}d`);
    else node.damUnknown = true;
  }
  return node;
}

/**
 * Flattens the chart into generational rows, root last.
 *
 * A full sire-subtree-then-dam-subtree walk puts each row in the standard
 * pedigree-chart order on its own — paternal grandsire, paternal granddam,
 * maternal grandsire, maternal granddam — with no separate sort needed.
 */
export function rowsOf(root: AncestorNode): AncestorNode[][] {
  const rows: AncestorNode[][] = [];
  const walk = (node: AncestorNode): void => {
    (rows[node.depth] ??= []).push(node);
    if (node.sire) walk(node.sire);
    if (node.dam) walk(node.dam);
  };
  walk(root);
  return rows;
}

/** Every horse the yard knows about — its own bloodstock plus the world, active or archived. */
export function allKnownHorses(stable: Stable): Horse[] {
  return [
    ...stable.bloodstock.map((entry) => entry.horse),
    ...(stable.world ?? []),
    ...(stable.worldArchive ?? []),
  ];
}

/** Other foals of the same pairing — full siblings only; a pairing is one sire and one dam. */
export function siblingsOf(horse: Horse, allHorses: Horse[]): Horse[] {
  if (!horse.sireId && !horse.damId) return [];
  return allHorses.filter(
    (candidate) =>
      candidate.id !== horse.id &&
      candidate.sireId === horse.sireId &&
      candidate.damId === horse.damId,
  );
}

/**
 * A foal that was bred here and sold on, rather than a rival the world was
 * seeded with.
 *
 * The world is seeded once with horses that have no recorded parents
 * (`generateWorld`); a sold foal keeps the `sireId`/`damId` it was born
 * with (`releaseAsRival`). Presence in `world` (still racing) or
 * `worldArchive` (aged out, `sim/worldRacing.ts`) plus a recorded parent is
 * exactly that distinction, and it needs no extra field on the horse.
 */
export function isSoldFoal(horse: Horse, stable: Stable): boolean {
  if (!horse.sireId && !horse.damId) return false;
  if (stable.bloodstock.some((entry) => entry.horse.id === horse.id)) return false;
  return (
    (stable.world ?? []).some((w) => w.id === horse.id) ||
    (stable.worldArchive ?? []).some((w) => w.id === horse.id)
  );
}

/** A rival, sold foal or otherwise, that has aged out of racing and is no longer in `world`. */
export function isArchivedWorld(horse: Horse, stable: Stable): boolean {
  return (stable.worldArchive ?? []).some((w) => w.id === horse.id);
}

/** The bloodstock record for a horse in the tree, if the yard ever retired it. */
export function retiredRecordOf(horse: Horse, stable: Stable): RetiredHorse | undefined {
  return stable.bloodstock.find((entry) => entry.horse.id === horse.id);
}

/* ---------------------------------------------------------------------------
   The inheritance map (Step 3) — coat genetics only.

   `sim/coat.ts`'s own comment names Extension, Agouti and Flaxen the loci
   that actually hide something: a single copy of Cream, Grey or Roan already
   shows, so nothing there ever hides and there is no "surfaced from two
   unseen carriers" story to tell about them. Only these three loci are worth
   surfacing here — and Flaxen needs nothing else added when it lands, since
   `notableAllele`/`carriesAllele` below both work generically off whatever
   is in this list.
   ------------------------------------------------------------------------ */

export interface CoatLocusInfo {
  key: keyof CoatGenotype;
  label: string;
  /** Most dominant first. */
  dominance: readonly string[];
}

export const COAT_LOCI: readonly CoatLocusInfo[] = [
  { key: 'extension', label: 'Extension', dominance: ['E', 'e'] },
  { key: 'agouti', label: 'Agouti', dominance: ['A', 't', 'a'] },
  { key: 'flaxen', label: 'Flaxen', dominance: ['F', 'f'] },
];

/**
 * The one allele at a locus worth surfacing — the one a dominant allele
 * would otherwise keep unseen. `null` when the pair is homozygous for the
 * top-dominance allele: nothing there is hiding anything.
 *
 * Heterozygous → the non-expressing allele is the hidden one. Homozygous on
 * anything but the top allele → both copies are that one, which is itself
 * the story: two unseen carriers met to produce what is now visible.
 */
export function notableAllele(pair: readonly [string, string], dominance: readonly string[]): string | null {
  const rank = (allele: string): number => dominance.indexOf(allele);
  const [top, other] = [...pair].sort((a, b) => rank(a) - rank(b)) as [string, string];
  if (top === other) return rank(top) === 0 ? null : top;
  return other;
}

/** Whether a horse's own genotype carries a given allele at a locus, expressed or not. */
export function carriesAllele(horse: Horse, locus: keyof CoatGenotype, allele: string): boolean {
  const pair = genotypeOf(horse)[locus] as unknown as readonly [string, string];
  return pair[0] === allele || pair[1] === allele;
}

/* ---------------------------------------------------------------------------
   The potential trace — same shape as the allele tracer above, for a stat's
   grade rather than a coat locus.
   ------------------------------------------------------------------------ */

const GRADE_RANK: Record<Grade, number> = { D: 0, C: 1, B: 2, A: 3, X: 4 };

/** Whether a horse's potential in `stat` grades at or above `floor`. */
export function meetsPotentialFloor(horse: Horse, stat: StatKey, floor: Grade): boolean {
  const value = horse.potential?.[stat];
  if (value === undefined) return false;
  return GRADE_RANK[toGrade(value)] >= GRADE_RANK[floor];
}

/**
 * Whether the player has actually been shown this horse's potential
 * anywhere — their own bloodstock or the horse currently in training, or
 * any horse ever bred to. The breeding screen's stud-card grades show a
 * partner's ceiling before it is even chosen, own yard or an outside hire
 * alike, so both count. A rival never bred to keeps its ceiling masked,
 * per DESIGN.md §3 — its card has nothing honest to check here.
 */
export function potentialKnown(horse: Horse, stable: Stable, root: Horse): boolean {
  const isLivingRoot = horse.id === root.id && !retiredRecordOf(root, stable);
  if (isLivingRoot || retiredRecordOf(horse, stable)) return true;

  const pairings = stable.pairings ?? {};
  return Object.keys(pairings).some((key) => key.split('~').includes(horse.id));
}
