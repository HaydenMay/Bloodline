import { COAT_IDS, type CoatId } from '../data/index.js';
import {
  shade,
  COATS as COAT_DATA,
  FLAXEN_HAIR,
  SILKS as SILK_DATA,
  SCENE as SCENE_DATA,
  HORSE as HORSE_DATA,
  UI as UI_DATA,
} from '../data/colors.js';
import { expressesFlaxen, genotypeOf, type CoatGenotype } from '../sim/coat.js';

/**
 * Re-export shading functions and color system from centralized colors.ts.
 *
 * All colors — UI, horses, silks, and environments — are defined in one place
 * so there is a single source of truth for the entire game.
 */
export const INK = shade.INK;
export const lite = shade.lite;

/** Pale end of the mane ramp — matches CREAM in the (former) silks demo tool. */
const CREAM = '#F2E7D2';

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const ch = (x: number, y: number): string =>
    Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
};

/**
 * Manes that could plausibly belong to THIS body colour.
 *
 * A mane has more licence than a pair of legs — flaxen on a chestnut, black on
 * a bay, and both are real — so the ramp reaches further in both directions
 * than a points ramp would. What it does not do is float free of the body:
 * every step here is the body taken toward ink or toward cream, never an
 * unrelated colour off another coat. Originally built for the (now retired)
 * `?silks-demo` colour-picker tool; `hairForHorse` below is what actually uses
 * it in play.
 */
export function hairRampFor(coatId: string): string[] {
  const { body, hair } = coatFor(coatId);
  const ramp = [hair, mix(body, INK, 0.8), mix(body, INK, 0.45), body, mix(body, CREAM, 0.5), mix(body, CREAM, 0.85)];
  return [...new Set(ramp)];
}

/**
 * Chance a horse's mane ignores its own coat's ramp entirely and draws from
 * ANOTHER coat's hair colour instead — a strawberry roan with a black mane,
 * found in play rather than derived from any real equine genetics. Same
 * order of magnitude as the game's other mutation dials
 * (`TRAIT_MUTATION_CHANCE`, `APTITUDE_MUTATION_CHANCE`, both 0.08 in
 * `sim/breeding.ts`) — common enough to occasionally surprise you, rare
 * enough that it reads as a surprise rather than the norm.
 *
 * Interim: per-instance and hashed off the horse's own id, not inherited. A
 * foal today rolls its own mane fresh rather than taking after a parent's,
 * which is the wrong shape for something this game otherwise treats as
 * genetics — logged in ongoing-decisions.md as wanting a real locus in
 * `sim/coat.ts`, the way flaxen already has one.
 */
export const HAIR_MUTATION_CHANCE = 0.08;

/**
 * A horse's own mane, chosen once and stable for its lifetime (hashed off its
 * id, not random per render). Flaxen — a real, inherited, two-copy-recessive
 * gene — always wins when it expresses. Otherwise: normally a colour from the
 * horse's own coat ramp, occasionally (`HAIR_MUTATION_CHANCE`) a colour
 * borrowed whole from a different coat's palette.
 */
function hairForHorse(horse: { id: string; coat: string; coatGenotype?: CoatGenotype }): string {
  if (expressesFlaxen(genotypeOf(horse))) return FLAXEN_HAIR;

  const roll = hashId(`${horse.id}-hair-roll`) % 1000;
  if (roll < HAIR_MUTATION_CHANCE * 1000) {
    const donor = COAT_IDS[hashId(`${horse.id}-hair-donor`) % COAT_IDS.length]!;
    return coatFor(donor).hair;
  }

  const ramp = hairRampFor(horse.coat);
  return ramp[hashId(`${horse.id}-hair-shade`) % ramp.length]!;
}
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
  /** Highlights and shine (e.g., eye reflections). */
  shine: string;
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
 * A horse's coat, with its own mane — never just the coat's flat default.
 *
 * Every named coat used to imply exactly one mane colour, which meant every
 * horse in the game shared its look with everything else of the same coat:
 * measured at 99.9% of eight-horse fields drawing at least one exact coat
 * repeat, and within that, an unvaried, coat-locked mane made even the
 * non-repeats read as the same few horses over and over. `hairForHorse`
 * (above) is what actually varies it — this is the one place `sim/render`'s
 * one-way street (`sim/` may never import from here) lets "what colour is
 * this horse" and "what does its genotype say about its mane" combine.
 */
export function coatForHorse(horse: { id: string; coat: string; coatGenotype?: CoatGenotype }): Coat {
  return { ...coatFor(horse.coat), hair: hairForHorse(horse) };
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
 * Jockey skin tones — the base skin colour is #D4A574, which gets replaced
 * with one of these selected tones when rendering.
 */
export interface SkinTone {
  hex: string;
  name: string;
}

export const SKIN_TONES: SkinTone[] = [
  { hex: '#D4A574', name: 'Medium Tan' },
  { hex: '#C9956B', name: 'Dark Tan' },
  { hex: '#E8B896', name: 'Light Tan' },
  { hex: '#9B7653', name: 'Deep Brown' },
  { hex: '#B8956A', name: 'Warm Brown' },
];

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
