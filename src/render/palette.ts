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

export interface Coat {
  id: string;
  name: string;
  /** Main body colour. */
  body: string;
  /** Shaded underside and muscle definition. */
  shade: string;
  /** Highlight along the back and haunch. */
  light: string;
  /** Mane and tail. */
  hair: string;
  /** Lower legs, muzzle and ear tips — the "points". */
  points: string;
}

export const COATS: Record<string, Coat> = {
  bay: {
    id: 'bay',
    name: 'Bay',
    body: '#8C5A32',
    shade: '#5E3A1F',
    light: '#A9723F',
    hair: '#22150C',
    points: '#2A1A0E',
  },
  chestnut: {
    id: 'chestnut',
    name: 'Chestnut',
    body: '#A85C2E',
    shade: '#7A3F1D',
    light: '#C4783F',
    hair: '#C88A4E',
    points: '#8B4A24',
  },
  black: {
    id: 'black',
    name: 'Black',
    body: '#2F2B2C',
    shade: '#1B1819',
    light: '#463F41',
    hair: '#141213',
    points: '#181516',
  },
  grey: {
    id: 'grey',
    name: 'Grey',
    body: '#B9B7B8',
    shade: '#8E8B8D',
    light: '#D6D4D5',
    hair: '#EDECEC',
    points: '#6E6B6D',
  },
  palomino: {
    id: 'palomino',
    name: 'Palomino',
    body: '#C99A56',
    shade: '#A2763A',
    light: '#E0B879',
    hair: '#F2E7D2',
    points: '#B2843F',
  },
  buckskin: {
    id: 'buckskin',
    name: 'Buckskin',
    body: '#C29B63',
    shade: '#9C7642',
    light: '#DCBB8B',
    hair: '#241A11',
    points: '#2B2016',
  },
  roan: {
    id: 'roan',
    name: 'Strawberry Roan',
    body: '#A97F72',
    shade: '#835F55',
    light: '#C49E92',
    hair: '#6E4A40',
    points: '#7A5449',
  },
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
