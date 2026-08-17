import type { Horse } from '../sim/types.js';
import type { Pedigree } from '../sim/breeding.js';
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

/** Every horse the yard knows about — its own bloodstock plus the world. */
export function allKnownHorses(stable: Stable): Horse[] {
  return [...stable.bloodstock.map((entry) => entry.horse), ...(stable.world ?? [])];
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
 * with (`releaseAsRival`). Presence in `world` plus a recorded parent is
 * exactly that distinction, and it needs no extra field on the horse.
 */
export function isSoldFoal(horse: Horse, stable: Stable): boolean {
  if (!horse.sireId && !horse.damId) return false;
  if (stable.bloodstock.some((entry) => entry.horse.id === horse.id)) return false;
  return (stable.world ?? []).some((w) => w.id === horse.id);
}

/** The bloodstock record for a horse in the tree, if the yard ever retired it. */
export function retiredRecordOf(horse: Horse, stable: Stable): RetiredHorse | undefined {
  return stable.bloodstock.find((entry) => entry.horse.id === horse.id);
}
