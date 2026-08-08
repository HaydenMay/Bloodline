import { COAT_IDS, type CoatId } from '../data/index.js';
import {
  shade,
  COATS as COAT_DATA,
  SILKS as SILK_DATA,
  SCENE as SCENE_DATA,
  HORSE as HORSE_DATA,
  UI as UI_DATA,
} from '../data/colors.js';

/**
 * Re-export shading functions and color system from centralized colors.ts.
 *
 * All colors — UI, horses, silks, and environments — are defined in one place
 * so there is a single source of truth for the entire game.
 */
export const INK = shade.INK;
export const lite = shade.lite;
export const dark = shade.dark;

// Re-export all color groups
export const UI = UI_DATA;
export const SCENE = SCENE_DATA;
export const HORSE = HORSE_DATA;

/**
 * A coat is three MATERIALS, each just a base colour. Light and dark tones are
 * derived at draw time rather than hand-specified, so any colour genetics
 * produces in Phase 5 shades correctly without needing a hand-authored palette
 * entry for every possible outcome.
 */
export interface Coat {
  id: string;
  name: string;
  /** Main body colour. */
  body: string;
  /** Mane and tail. */
  hair: string;
  /** Lower legs, muzzle and ear tips — the "points". */
  points: string;
  /** Borders, eyes, and other fixed features. */
  fixed: string;
}

export const COATS: Record<CoatId, Coat> = {
  bay: { id: 'bay', name: 'Bay', ...COAT_DATA.bay },
  chestnut: { id: 'chestnut', name: 'Chestnut', ...COAT_DATA.chestnut },
  black: { id: 'black', name: 'Black', ...COAT_DATA.black },
  grey: { id: 'grey', name: 'Grey', ...COAT_DATA.grey },
  palomino: { id: 'palomino', name: 'Palomino', ...COAT_DATA.palomino },
  buckskin: { id: 'buckskin', name: 'Buckskin', ...COAT_DATA.buckskin },
  roan: { id: 'roan', name: 'Strawberry Roan', ...COAT_DATA.roan },
  darkBay: { id: 'darkBay', name: 'Dark Bay', ...COAT_DATA.darkBay },
};

/**
 * Re-exported so render code has one import for colour work. The list itself is
 * game data — a coat is a gene before it is a colour — and typing COATS against
 * it means adding a gene without giving it colours fails to compile rather than
 * silently rendering as bay.
 */
export { COAT_IDS };

/**
 * Takes a plain string rather than a CoatId on purpose: coats arrive from save
 * files and, later, from breeding, so an unknown one has to degrade to a
 * sensible horse instead of throwing in the middle of a race.
 */
export function coatFor(id: string): Coat {
  return COATS[id as CoatId] ?? COATS.bay;
}

/**
 * Stable colours drive silks, tack and grooming from a single choice
 * (DESIGN.md §11), so a horse is instantly findable in a pack of eight.
 */
export interface Silks {
  primary: string;
  secondary: string;
}

/** Distinct, colourblind-safe hues for the AI runners. */
export const RIVAL_SILKS = SILK_DATA as unknown as Silks[];

/**
 * A deterministic FNV-1a hash, so a horse's colour follows from its id rather
 * than from wherever it happens to be drawn.
 */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
