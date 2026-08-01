/**
 * Coat colours, and the palette the whole game draws from.
 *
 * Coats are data, not hand-drawn assets — which is the entire reason we build
 * our own art (DESIGN.md §10). A foal's appearance comes from its genes, so it
 * has to be expressible as a handful of numbers that tint layered shapes.
 *
 * Phase 5 replaces `coatFor` with real dominant/recessive genetics. The shape
 * of what it returns will not change.
 */

/**
 * Warm dark used for all shading and line art.
 *
 * Shading toward a warm near-black rather than pure black is what stops
 * shadows reading as grubby grey — a technique worth stealing outright.
 */
export const INK = '#262126';

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
};

/** Toward white. */
export const lite = (c: string, amount: number): string => mix(c, '#FFFFFF', amount);
/** Toward the warm ink, never toward black. */
export const dark = (c: string, amount: number): string => mix(c, INK, amount);

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
}

export const COATS: Record<string, Coat> = {
  bay: { id: 'bay', name: 'Bay', body: '#8C5A32', hair: '#221509', points: '#2A1A0E' },
  chestnut: { id: 'chestnut', name: 'Chestnut', body: '#A85C2E', hair: '#C88A4E', points: '#8B4A24' },
  black: { id: 'black', name: 'Black', body: '#37312F', hair: '#191617', points: '#1F1B1B' },
  grey: { id: 'grey', name: 'Grey', body: '#B9B7B8', hair: '#EDECEC', points: '#6E6B6D' },
  palomino: { id: 'palomino', name: 'Palomino', body: '#C99A56', hair: '#F2E7D2', points: '#B2843F' },
  buckskin: { id: 'buckskin', name: 'Buckskin', body: '#C29B63', hair: '#241A11', points: '#2B2016' },
  roan: { id: 'roan', name: 'Strawberry Roan', body: '#A97F72', hair: '#6E4A40', points: '#7A5449' },
  darkBay: { id: 'darkBay', name: 'Dark Bay', body: '#5C3A22', hair: '#1B1210', points: '#211611' },
};

export const COAT_IDS = Object.keys(COATS);

export function coatFor(id: string): Coat {
  return COATS[id] ?? COATS['bay']!;
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
export const RIVAL_SILKS: Silks[] = [
  { primary: '#2F7FD1', secondary: '#F2F4F7' },
  { primary: '#E0533C', secondary: '#2B2320' },
  { primary: '#3FA678', secondary: '#F2F4F7' },
  { primary: '#8C6BD6', secondary: '#F7EFCF' },
  { primary: '#E8A33D', secondary: '#2B2320' },
  { primary: '#4B5563', secondary: '#F2F4F7' },
  { primary: '#D64C8E', secondary: '#F7EFCF' },
  { primary: '#2AA8B8', secondary: '#12222B' },
];

/** Track and environment. */
export const SCENE = {
  skyTop: '#1A2536',
  skyBottom: '#3E4E63',
  distantHills: '#2B3A46',
  crowdBack: '#232C38',
  crowdFront: '#2C3745',
  railPost: '#D8DDE4',
  railShadow: '#9AA4B0',
  turfFar: '#3D6B3A',
  turfNear: '#4A7E44',
  turfStripe: '#43743E',
  dirt: '#8A6A47',
  dirtShade: '#6F5438',
  furlongPost: '#E8E4DA',
} as const;
