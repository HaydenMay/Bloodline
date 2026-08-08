/**
 * Centralized color system.
 *
 * All colors in the game — UI, horses, jockey silks, and environments — are
 * defined here so there is a single source of truth. Changes propagate
 * everywhere automatically.
 */

/**
 * Utility functions for color manipulation.
 */
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

/**
 * Shading functions.
 */
export const shade = {
  /** Warm dark used for all shading and line art. */
  INK: '#262126',
  /** Toward white. */
  lite: (c: string, amount: number): string => mix(c, '#FFFFFF', amount),
  /** Toward the warm ink, never toward black. */
  dark: (c: string, amount: number): string => mix(c, '#262126', amount),
};

/**
 * UI / Interface colors.
 */
export const UI = {
  bg: '#0e1218',
  bgOverlay72: 'rgba(14, 18, 24, 0.72)',
  bgOverlay82: 'rgba(14, 18, 24, 0.82)',
  bgOverlay90: 'rgba(14, 18, 24, 0.9)',
  panel: '#161c25',
  line: '#26303d',
  text: '#e8edf4',
  textMuted: '#c7d0dc',
  textVariant: 'rgba(233, 238, 245, 0.92)',
  muted: '#8b98a9',
  mutedDim: 'rgba(139, 152, 169, 0.25)',
  mutedVeryDim: 'rgba(139, 152, 169, 0.22)',
  mutedStrong: 'rgba(139, 152, 169, 0.9)',
  mutedSubtle: 'rgba(139, 152, 169, 0.75)',
  mutedFaint: 'rgba(139, 152, 169, 0.45)',
  accent: '#f2c14e',
  accentBright: '#ffd700',
  accentFaint: 'rgba(242, 193, 78, 0.1)',
  accentLighter: 'rgba(242, 193, 78, 0.13)',
  accentLight: 'rgba(242, 193, 78, 0.15)',
  accentBorder: 'rgba(242, 193, 78, 0.25)',
  accentMedium: 'rgba(242, 193, 78, 0.4)',
  accentMediumStrong: 'rgba(242, 193, 78, 0.45)',
  accentGlow: 'rgba(242, 193, 78, 0.6)',
  accentGlowStrong: 'rgba(242, 193, 78, 0.9)',
  accentGlowVeryStrong: 'rgba(242, 193, 78, 0.95)',
  accentGlowShadow: 'rgba(242, 193, 78, 0.85)',
  accentBrightGlow: 'rgba(255, 215, 0, 0.5)',
  accentDim: 'rgba(242, 193, 78, 0.28)',
  ok: '#4ec9a0',
  okLight: 'rgba(78, 201, 160, 0.15)',
  okLighter: 'rgba(78, 201, 160, 0.35)',
  warning: '#ff6b7a',
  warningLight: 'rgba(255, 107, 122, 0.15)',
  draft: '#6fb3e0',
  condition: {
    good: '#6fe39b',
    fair: '#f2c14e',
    poor: '#d9534f',
  },
} as const;

/**
 * Horse coat colors. Three materials per coat: body, hair (mane/tail), and
 * points (lower legs, muzzle, ear tips). Light and dark tones are derived at
 * draw time rather than hand-specified.
 *
 * Coats are data, not hand-drawn assets (DESIGN.md §10). A foal's appearance
 * comes from genes, so it must be expressible as a handful of numbers that tint
 * layered shapes.
 */
export const COATS = {
  bay: { body: '#8C5A32', hair: '#221509', points: '#2A1A0E', fixed: '#000000' },
  chestnut: { body: '#A85C2E', hair: '#C88A4E', points: '#8B4A24', fixed: '#000000' },
  black: { body: '#37312F', hair: '#191617', points: '#1F1B1B', fixed: '#000000' },
  grey: { body: '#B9B7B8', hair: '#EDECEC', points: '#6E6B6D', fixed: '#000000' },
  palomino: { body: '#C99A56', hair: '#F2E7D2', points: '#B2843F', fixed: '#000000' },
  buckskin: { body: '#C29B63', hair: '#241A11', points: '#2B2016', fixed: '#000000' },
  roan: { body: '#A97F72', hair: '#6E4A40', points: '#7A5449', fixed: '#000000' },
  darkBay: { body: '#5C3A22', hair: '#1B1210', points: '#211611', fixed: '#000000' },
} as const;

/**
 * Jockey silks. Distinct, colourblind-safe hues for AI runners.
 * Stable colours drive silks, tack and grooming from a single choice
 * (DESIGN.md §11), so a horse is instantly findable in a pack of eight.
 */
export const SILKS = [
  { primary: '#2F7FD1', secondary: '#F2F4F7' },
  { primary: '#E0533C', secondary: '#2B2320' },
  { primary: '#3FA678', secondary: '#F2F4F7' },
  { primary: '#8C6BD6', secondary: '#F7EFCF' },
  { primary: '#E8A33D', secondary: '#2B2320' },
  { primary: '#4B5563', secondary: '#F2F4F7' },
  { primary: '#D64C8E', secondary: '#F7EFCF' },
  { primary: '#2AA8B8', secondary: '#12222B' },
] as const;

/**
 * Scene and environment colors. Track, sky, turf, crowd, etc.
 */
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
  minimapOval: 'rgba(255, 255, 255, 0.2)',
  minimapPlayerMarker: '#f5f5f5',
} as const;

/**
 * Horse rendering details: eyes, boots, shadows.
 */
export const HORSE = {
  eye: '#120C08',
  boot: '#2C2522',
  shadowBlack: '#000',
} as const;

/**
 * Defaults and fallbacks used when rendering or in save compatibility.
 */
export const DEFAULTS = {
  playerSilksDefault: { primary: '#1a1a2e', secondary: '#e94560' },
  demoSilksDefault: { primary: '#A8DADC', secondary: '#12222B' },
  stableColorsDefault: { primary: '#1F6FB2', secondary: '#F2C14E' },
  badgeAccentColor: '#6B8FA3',
} as const;
