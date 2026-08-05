import badgeUrl from '../assets/shield-badge.png';
import maskUrl from '../assets/shield-badge-mask.png';
import { INK, coatFor } from './palette.js';

/**
 * Shield badge for horses.
 *
 * Recoloured the same way the race sprite is: a baked MATERIAL MASK says what
 * each pixel is, and the tint keeps the art's luminance while taking hue and
 * saturation from the horse's scheme. `tools/bake-flat.ts` writes the mask; see
 * SPRITE_MASK.md.
 *
 * The badge deliberately does NOT take its mane colour from the coat genes.
 * Coat and mane are so often close in real genetics that a shield picked out in
 * both reads as one colour at icon size, so the mane takes the silks' secondary
 * instead and the badge stays legible in a pedigree tree.
 */

const MATERIAL = { body: 1, hair: 2, points: 3, silks: 4, trim: 5, fixed: 6 } as const;

interface Loaded {
  base: ImageData;
  /** One material id per pixel, or all zero if the mask failed to load. */
  mask: Uint8Array;
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
    const [baseImg, maskImg] = await Promise.all([loadImage(badgeUrl), loadImage(maskUrl)]);
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

    // Material id is stored as id * 40 in red, so the file is legible by eye.
    // No mask means no tinting rather than wrong tinting: every pixel falls to
    // 0, which the tint below passes straight through.
    const mask = new Uint8Array(W * H);
    if (maskImg) {
      const mctx = scratch(W, H);
      mctx.drawImage(maskImg, 0, 0);
      const data = mctx.getImageData(0, 0, W, H).data;
      for (let p = 0; p < W * H; p++) mask[p] = Math.round(data[p * 4]! / 40);
    }

    loaded = { base, mask, width: W, height: H };
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
  const maneColor = scheme.silks?.secondary ?? accentColor;
  const key = `${scheme.coat}|${accentColor}|${maneColor}`;
  const hit = tinted.get(key);
  if (hit) {
    // Re-insert so the map's order stays least-recently-used first.
    tinted.delete(key);
    tinted.set(key, hit);
    return hit;
  }

  const coat = coatFor(scheme.coat);
  const target: Partial<Record<number, [number, number, number]>> = {
    [MATERIAL.body]: hexToHsl(coat.body),
    [MATERIAL.hair]: hexToHsl(maneColor),
    // The badge has no legs, so `points` carries the LINE ART instead — the
    // black outline around the horse and around the shield. It is deliberately
    // NOT part of the scheme: an outline that changes colour with the silks
    // stops being an outline. Half the rival silks have a near-white secondary,
    // and drawing the outline in it gave the badge a pale halo that merged into
    // a pale mane, which at 40px is the difference between a horse and a smudge.
    [MATERIAL.points]: hexToHsl(INK),
    [MATERIAL.silks]: hexToHsl(accentColor),
    [MATERIAL.trim]: hexToHsl(maneColor),
  };

  const { width: W, height: H, base, mask } = loaded;
  const ctx = scratch(W, H);
  const out = ctx.createImageData(W, H);

  // Mean luminance per material, so the tint lands on each region's MIDTONE
  // and its modelling survives as an offset either side. Scaling the whole
  // region toward the target instead would crush a dark scheme to black.
  const sum = new Float64Array(8);
  const count = new Float64Array(8);
  for (let p = 0; p < W * H; p++) {
    const m = mask[p]!;
    if (!m || m > 7 || base.data[p * 4 + 3]! === 0) continue;
    const r = base.data[p * 4]!;
    const g = base.data[p * 4 + 1]!;
    const b = base.data[p * 4 + 2]!;
    sum[m] = sum[m]! + (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    count[m] = count[m]! + 1;
  }
  const meanL = new Float64Array(8);
  for (let m = 1; m < 8; m++) meanL[m] = count[m] ? sum[m]! / count[m]! : 0.5;

  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const a = base.data[i + 3]!;
    out.data[i + 3] = a;
    if (a === 0) continue;

    const r = base.data[i]!;
    const g = base.data[i + 1]!;
    const b = base.data[i + 2]!;
    const tint = target[mask[p]!];
    if (!tint) {
      // `fixed` and unmasked pixels — the bridle, the outline — pass through.
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      continue;
    }

    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    const lit = Math.max(0.02, Math.min(0.98, tint[2] + (l - meanL[mask[p]!]!) * 0.9));
    const [nr, ng, nb] = hslToRgb(tint[0], tint[1], lit);
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
 * Get a badge as a data URI. Waits for the badge asset to load if needed.
 * Returns a PNG data URL that can be used as an img src, or null if loading fails.
 */
export async function getBadgeDataUri(scheme: BadgeScheme): Promise<string | null> {
  await loadBadge();
  const badge = tintedBadge(scheme);
  if (!badge) return null;
  return badge.toDataURL('image/png');
}

loadBadge();
