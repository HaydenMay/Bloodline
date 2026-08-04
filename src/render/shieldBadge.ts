import badgeUrl from '../assets/shield-badge.png';
import { coatFor } from './palette.js';

/**
 * Shield badge for horses — mockup implementation.
 *
 * Uses color-region detection on the badge PNG itself:
 * - Grey pixels → body (tinted with coat color)
 * - Red/magenta pixels → mane (tinted with accent color)
 * - Magenta pixels → legs (tinted with accent color)
 * - Blue pixels → outline (kept as accent or tinted)
 * - White/transparent → background (untouched)
 */

interface Loaded {
  base: ImageData;
  width: number;
  height: number;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null); // Graceful fallback if image doesn't exist
    img.src = src;
  });

function scratch(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  return ctx;
}

export function loadBadge(): Promise<Loaded> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;
  loading = (async () => {
    const baseImg = await loadImage(badgeUrl);
    const W = 256;
    const H = 256;

    const bctx = scratch(W, H);
    if (baseImg) {
      bctx.drawImage(baseImg, 0, 0);
    } else {
      // Fallback: draw a simple shield shape for testing
      bctx.fillStyle = '#A0A0A0';
      bctx.beginPath();
      bctx.moveTo(128, 32);
      bctx.lineTo(200, 72);
      bctx.lineTo(200, 160);
      bctx.quadraticCurveTo(128, 220, 128, 220);
      bctx.quadraticCurveTo(56, 220, 56, 160);
      bctx.lineTo(56, 72);
      bctx.closePath();
      bctx.fill();

      bctx.strokeStyle = '#0052CC';
      bctx.lineWidth = 6;
      bctx.stroke();

      // Simple horse head
      bctx.fillStyle = '#808080';
      bctx.beginPath();
      bctx.ellipse(128, 120, 25, 30, 0, 0, Math.PI * 2);
      bctx.fill();

      // Mane (red for later tinting)
      bctx.fillStyle = '#CC3333';
      bctx.fillRect(120, 80, 16, 40);

      // Legs (magenta for detection)
      bctx.fillStyle = '#FF00FF';
      bctx.fillRect(100, 155, 8, 35);
      bctx.fillRect(130, 155, 8, 35);
    }
    const base = bctx.getImageData(0, 0, W, H);

    loaded = { base, width: W, height: H };
    return loaded;
  })();
  return loading;
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

// Detect which region a pixel belongs to based on color.
// Tolerance allows for slight variations in the source PNG.
function detectRegion(r: number, g: number, b: number, tolerance: number = 20): string {
  // Grey body (neutral grey)
  if (Math.abs(r - g) < tolerance && Math.abs(g - b) < tolerance && Math.abs(r - b) < tolerance && r > 100) {
    return 'body';
  }
  // Red/Dark red mane (high red, lower green and blue)
  if (r > g + 30 && r > b + 30 && r > 100) {
    return 'mane';
  }
  // Magenta legs (high red and blue, low green)
  if (r > 150 && b > 150 && g < 100) {
    return 'legs';
  }
  // Blue outline (high blue, low red)
  if (b > g + 30 && b > r + 30) {
    return 'outline';
  }
  return 'fixed';
}

export interface Silks {
  primary: string;
  secondary: string;
}

export interface BadgeScheme {
  coat: string;
  /** Jockey silks — primary color is used as the accent for mane/legs/outline. */
  silks?: Silks;
  /** Fallback accent color if silks not provided. */
  accentColor?: string;
}

const tinted = new Map<string, HTMLCanvasElement>();
const TINT_CACHE_MAX = 20;
const DEFAULT_ACCENT = '#6B8FA3'; // Muted blue-grey (subtle accent)

/**
 * Recolor a badge for the given coat and accent color.
 * Accent color comes from silks primary (jockey shirt) if provided, otherwise uses accentColor fallback.
 */
export function tintedBadge(scheme: BadgeScheme): HTMLCanvasElement | null {
  if (!loaded) return null;
  const accentColor = scheme.silks?.primary ?? scheme.accentColor ?? DEFAULT_ACCENT;
  const key = `${scheme.coat}|${accentColor}`;
  const hit = tinted.get(key);
  if (hit) {
    tinted.delete(key);
    tinted.set(key, hit);
    return hit;
  }

  const coat = coatFor(scheme.coat);
  const bodyHsl = hexToHsl(coat.body);
  const accentHsl = hexToHsl(accentColor);

  const { width: W, height: H } = loaded;
  const ctx = scratch(W, H);
  const out = ctx.createImageData(W, H);
  const { base } = loaded;

  // Calculate mean luminance for each region to preserve shading
  const regionMeans: Record<string, number> = {
    body: 0,
    mane: 0,
    legs: 0,
    outline: 0,
    fixed: 0,
  };
  const regionCounts: Record<string, number> = {
    body: 0,
    mane: 0,
    legs: 0,
    outline: 0,
    fixed: 0,
  };

  // First pass: calculate mean luminance per region
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const a = base.data[i + 3]!;
    if (a === 0) continue;

    const r = base.data[i]!;
    const g = base.data[i + 1]!;
    const b = base.data[i + 2]!;
    const region = detectRegion(r, g, b);
    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;

    regionMeans[region] = (regionMeans[region] ?? 0) + l;
    regionCounts[region] = (regionCounts[region] ?? 0) + 1;
  }
  for (const region of Object.keys(regionMeans)) {
    if (regionCounts[region]! > 0) {
      regionMeans[region] = regionMeans[region]! / regionCounts[region]!;
    } else {
      regionMeans[region] = 0.5;
    }
  }

  // Second pass: tint pixels
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const a = base.data[i + 3]!;
    out.data[i + 3] = a;
    if (a === 0) continue;

    const r = base.data[i]!;
    const g = base.data[i + 1]!;
    const b = base.data[i + 2]!;
    const region = detectRegion(r, g, b);

    if (region === 'fixed') {
      // Untinted regions pass through
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      continue;
    }

    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    const tintHsl = region === 'body' ? bodyHsl : accentHsl;
    const meanL = regionMeans[region] ?? 0.5;
    const lit = Math.max(0.02, Math.min(0.98, tintHsl[2] + (l - meanL) * 0.9));
    const [nr, ng, nb] = hslToRgb(tintHsl[0], tintHsl[1], lit);
    out.data[i] = nr;
    out.data[i + 1] = ng;
    out.data[i + 2] = nb;
  }

  ctx.putImageData(out, 0, 0);
  tinted.set(key, ctx.canvas);
  while (tinted.size > TINT_CACHE_MAX) {
    const oldest = tinted.keys().next().value;
    if (oldest === undefined) break;
    const stale = tinted.get(oldest);
    tinted.delete(oldest);
    if (stale) {
      stale.width = 0;
      stale.height = 0;
    }
  }
  return ctx.canvas;
}

export interface DrawBadgeOptions extends BadgeScheme {
  scale?: number;
  opacity?: number;
}

/**
 * Draw a badge at the given position.
 */
export function drawShieldBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: DrawBadgeOptions,
): boolean {
  const badge = tintedBadge(opts);
  if (!badge) return false;

  const scale = opts.scale ?? 1;
  const w = badge.width * scale;
  const h = badge.height * scale;
  const dx = x - w / 2;
  const dy = y - h / 2;

  ctx.save();
  if (opts.opacity !== undefined) ctx.globalAlpha = opts.opacity;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(badge, 0, 0, badge.width, badge.height, dx, dy, w, h);
  ctx.restore();
  return true;
}

/**
 * Get a badge as a data URI synchronously (for embedding in HTML).
 * Returns a PNG data URL that can be used as an img src, or null if badge not loaded yet.
 */
export function getBadgeDataUri(scheme: BadgeScheme): string | null {
  const badge = tintedBadge(scheme);
  if (!badge) return null;
  return badge.toDataURL('image/png');
}
