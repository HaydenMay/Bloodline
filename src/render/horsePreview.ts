import horseUrl from '../assets/horse-reference.png';
import { coatFor } from './palette.js';
import type { Silks } from './palette.js';

/**
 * Horse preview renderer for the silks demo.
 * Uses color-region detection similar to shield badge:
 * - Grey pixels → body (tinted with coat color)
 * - Red/magenta pixels → mane (tinted with mane color)
 * - Blue pixels → outline (tinted with silks color)
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
    img.onerror = () => res(null);
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

export function loadHorsePreview(): Promise<Loaded> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;
  loading = (async () => {
    const baseImg = await loadImage(horseUrl);
    const W = 256;
    const H = 256;

    const bctx = scratch(W, H);
    if (baseImg) {
      bctx.drawImage(baseImg, 0, 0);
    } else {
      bctx.fillStyle = '#F5F5DC';
      bctx.fillRect(0, 0, W, H);

      bctx.fillStyle = '#808080';
      bctx.beginPath();
      bctx.ellipse(128, 100, 35, 45, 0, 0, Math.PI * 2);
      bctx.fill();

      bctx.fillStyle = '#CC3333';
      bctx.fillRect(115, 50, 26, 50);

      bctx.fillStyle = '#0052CC';
      bctx.strokeStyle = '#0052CC';
      bctx.lineWidth = 8;
      bctx.beginPath();
      bctx.ellipse(128, 100, 35, 45, 0, 0, Math.PI * 2);
      bctx.stroke();

      bctx.fillStyle = '#808080';
      bctx.fillRect(105, 150, 12, 80);
      bctx.fillRect(145, 150, 12, 80);
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

function detectRegion(r: number, g: number, b: number, tolerance: number = 20): string {
  // Grey body (neutral grey)
  if (Math.abs(r - g) < tolerance && Math.abs(g - b) < tolerance && Math.abs(r - b) < tolerance && r > 100) {
    return 'body';
  }
  // Red/Dark red mane (high red, lower green and blue)
  if (r > g + 30 && r > b + 30 && r > 100) {
    return 'mane';
  }
  // Blue outline/silks (high blue, low red)
  if (b > g + 30 && b > r + 30) {
    return 'outline';
  }
  return 'fixed';
}

export interface HorsePreviewScheme {
  coat: string;
  silks: Silks;
}

const tinted = new Map<string, HTMLCanvasElement>();
const TINT_CACHE_MAX = 20;

/**
 * Render a horse preview with coat and silks colors.
 */
export function tintedHorsePreview(scheme: HorsePreviewScheme): HTMLCanvasElement | null {
  if (!loaded) return null;
  const key = `${scheme.coat}|${scheme.silks.primary}|${scheme.silks.secondary}`;
  const hit = tinted.get(key);
  if (hit) {
    tinted.delete(key);
    tinted.set(key, hit);
    return hit;
  }

  const coat = coatFor(scheme.coat);
  const bodyHsl = hexToHsl(coat.body);
  const maneHsl = hexToHsl(scheme.silks.secondary);
  const silksHsl = hexToHsl(scheme.silks.primary);

  const { width: W, height: H } = loaded;
  const ctx = scratch(W, H);
  const out = ctx.createImageData(W, H);
  const { base } = loaded;

  // Calculate mean luminance for each region
  const regionMeans: Record<string, number> = { body: 0, mane: 0, outline: 0, fixed: 0 };
  const regionCounts: Record<string, number> = { body: 0, mane: 0, outline: 0, fixed: 0 };

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

  // Tint pixels
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
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      continue;
    }

    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    let tintHsl: [number, number, number];
    if (region === 'body') {
      tintHsl = bodyHsl;
    } else if (region === 'mane') {
      tintHsl = maneHsl;
    } else {
      tintHsl = silksHsl;
    }
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

/**
 * Get horse preview as data URI for embedding in HTML.
 */
export async function getHorsePreviewDataUri(scheme: HorsePreviewScheme): Promise<string | null> {
  await loadHorsePreview();
  const canvas = tintedHorsePreview(scheme);
  if (!canvas) return null;
  return canvas.toDataURL('image/png');
}
