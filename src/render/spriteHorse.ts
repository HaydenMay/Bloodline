import sheetUrl from '../assets/racer.png';
import maskUrl from '../assets/racer-mask.png';
import meta from '../assets/racer.json';
import { coatFor, type Silks } from './palette.js';

/**
 * The sprite horse.
 *
 * Draws the delivered gallop sheet, recoloured per runner. The art ships as a
 * single grey horse in blue silks; everything else is made at runtime, because
 * Bloodline breeds its horses — a foal's coat comes from its genes, and eight
 * identically-dressed runners would be unplayable.
 *
 * HOW THE RECOLOUR WORKS. tools/bake-sprites.ts writes a mask with one material
 * id per pixel. For a tinted pixel we keep the ART'S LUMINANCE and take hue and
 * saturation from the coat or silks, so all the modelling the artist put in
 * survives the tint — a lit flank stays lit whatever colour it becomes. Only
 * the offset from that material's mean luminance is preserved, which is what
 * stops a dark coat crushing to black and a pale one blowing out to white.
 *
 * Tinting is done ONCE per colour scheme, into an offscreen sheet that is then
 * blitted like any other image. Per-pixel work every frame, for eight runners
 * at sixty frames a second, would not survive contact with a phone.
 */

const MATERIAL = { body: 1, hair: 2, points: 3, silks: 4, trim: 5, fixed: 6 } as const;

interface Frame {
  cell: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Meta {
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  frames: Frame[];
}

const META = meta as Meta;

/** Frames in the delivered cycle. */
export const FRAME_COUNT = META.frames.length;

/** A frame's top edge, relative to the top of its own cell. */
const topInCell = (f: Frame): number => f.y - Math.floor(f.cell / META.cols) * META.cellH;

/** A frame's bottom edge, relative to the top of its own cell. */
const bottomInCell = (f: Frame): number => topInCell(f) + f.h;

/**
 * The shared ground line, in cell coordinates.
 *
 * The lowest a hoof ever reaches across the whole cycle — which is the frame
 * where the horse is fully weighted. Every other frame is lifted off it by
 * however much the figure has gathered, and that difference is the gallop.
 */
const GROUND_IN_CELL = META.frames.reduce((m, f) => Math.max(m, bottomInCell(f)), 0);

interface Loaded {
  base: ImageData;
  mask: Uint8Array;
  /** Mean luminance per material, so a tint can be applied as an offset. */
  meanL: Float64Array;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`failed to load ${src}`));
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

/** Load the sheet and its mask, once. */
export function loadSprites(): Promise<Loaded> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;
  loading = (async () => {
    const [baseImg, maskImg] = await Promise.all([loadImage(sheetUrl), loadImage(maskUrl)]);
    const { width: W, height: H } = META;

    const bctx = scratch(W, H);
    bctx.drawImage(baseImg, 0, 0);
    const base = bctx.getImageData(0, 0, W, H);

    const mctx = scratch(W, H);
    mctx.drawImage(maskImg, 0, 0);
    const maskData = mctx.getImageData(0, 0, W, H).data;

    const mask = new Uint8Array(W * H);
    const sum = new Float64Array(8);
    const count = new Float64Array(8);
    for (let p = 0; p < W * H; p++) {
      const m = Math.round(maskData[p * 4]! / 40);
      mask[p] = m;
      if (!m || m > 7) continue;
      const r = base.data[p * 4]!;
      const g = base.data[p * 4 + 1]!;
      const b = base.data[p * 4 + 2]!;
      sum[m] = sum[m]! + (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
      count[m] = count[m]! + 1;
    }
    const meanL = new Float64Array(8);
    for (let m = 1; m < 8; m++) meanL[m] = count[m] ? sum[m]! / count[m]! : 0.5;

    loaded = { base, mask, meanL };
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

export interface Scheme {
  coat: string;
  silks: Silks;
}

/**
 * Recoloured sheets, most recently used last.
 *
 * CAPPED, because each entry is a full-size canvas — 1280x1280 RGBA is 6.25 MB.
 * Coats are drawn at random per race and silks vary by runner, so an uncapped
 * cache climbs toward every coat crossed with every set of silks and takes
 * hundreds of megabytes with it. A field is eight, so a cap of ten holds a
 * whole race and still lets consecutive races share anything in common.
 */
const tinted = new Map<string, HTMLCanvasElement>();
const TINT_CACHE_MAX = 10;

/**
 * Build — or reuse — a whole sheet recoloured for one runner.
 *
 * Keyed by the colour scheme rather than by horse, so a field of eight that
 * happens to share a coat only pays for it once.
 */
export function tintedSheet(scheme: Scheme): HTMLCanvasElement | null {
  if (!loaded) return null;
  const key = `${scheme.coat}|${scheme.silks.primary}|${scheme.silks.secondary}`;
  const hit = tinted.get(key);
  if (hit) {
    // Re-insert so the map's order stays least-recently-used first.
    tinted.delete(key);
    tinted.set(key, hit);
    return hit;
  }

  const coat = coatFor(scheme.coat);
  const target: Record<number, [number, number, number]> = {
    [MATERIAL.body]: hexToHsl(coat.body),
    [MATERIAL.hair]: hexToHsl(coat.hair),
    [MATERIAL.points]: hexToHsl(coat.points),
    [MATERIAL.silks]: hexToHsl(scheme.silks.primary),
    [MATERIAL.trim]: hexToHsl(scheme.silks.secondary),
  };

  const { width: W, height: H } = META;
  const ctx = scratch(W, H);
  const out = ctx.createImageData(W, H);
  const { base, mask, meanL } = loaded;

  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const a = base.data[i + 3]!;
    out.data[i + 3] = a;
    if (a === 0) continue;

    const m = mask[p]!;
    const r = base.data[i]!;
    const g = base.data[i + 1]!;
    const b = base.data[i + 2]!;
    const tint = target[m];
    if (!tint) {
      // Untinted materials — skin, leather, hoof horn — pass straight through.
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      continue;
    }

    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    // Shading survives as an OFFSET from this material's mean, so the tint
    // lands on the midtone instead of the whole thing being scaled toward it.
    const lit = Math.max(0.02, Math.min(0.98, tint[2] + (l - meanL[m]!) * 0.9));
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
    // Collapsing the canvas releases its backing store immediately rather than
    // leaving several megabytes for the collector to find on its own schedule.
    if (stale) {
      stale.width = 0;
      stale.height = 0;
    }
  }
  return ctx.canvas;
}

export interface DrawSpriteOptions extends Scheme {
  /** 0-1 through the stride cycle. */
  phase: number;
  /** Pixels per sprite pixel. */
  scale: number;
  faded?: boolean;
}

/**
 * Draw one frame, anchored at the hooves.
 *
 * Frames are registered on the BOTTOM CENTRE of their own bounds rather than on
 * the cell, because the figure rises and falls through the stride — the sheet's
 * bottom edge moves by 20-odd pixels across a cycle. Anchoring on the cell
 * would plant that bounce on the ground and the horse would appear to sink.
 */
export function drawSpriteHorse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: DrawSpriteOptions,
): boolean {
  const sheet = tintedSheet(opts);
  if (!sheet) return false;

  const n = META.frames.length;
  const f = META.frames[((Math.floor(opts.phase * n) % n) + n) % n]!;

  const w = f.w * opts.scale;
  const h = f.h * opts.scale;
  const dx = x - w / 2;
  // Map this frame's own top edge onto the shared ground line. Anchoring each
  // frame on its own bottom would flatten the gallop — the figure's lowest
  // point moves through the stride, and that movement IS the gather.
  const dy = y + (topInCell(f) - GROUND_IN_CELL) * opts.scale;

  ctx.save();
  if (opts.faded) ctx.globalAlpha = 0.5;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, f.x, f.y, f.w, f.h, dx, dy, w, h);
  ctx.restore();
  return true;
}
