/**
 * Frame-based animation rendering using spritesheets.
 *
 * Loads a spritesheet image and extracts frames in a 3x3 grid layout
 * (92x92 pixels per frame, 276x276 total).
 *
 * Frames are recolored using a mask-based tinting system, same as the sprite horse.
 */

import type { Silks, Coat } from './palette.js';
import { coatFor } from './palette.js';

const MATERIAL = { body: 1, hair: 2, points: 3, silks: 4, trim: 5, fixed: 6, shine: 7 } as const;

interface FrameSequence {
  name: string;
  frames: HTMLImageElement[];
  maskData: MaskData | undefined;
}

interface MaskData {
  mask: Uint8Array;
  meanL: Float64Array;
  width: number;
  height: number;
}

export interface Scheme {
  coat: string | Coat;
  silks: Silks;
}

const sequences = new Map<string, FrameSequence>();
const loadingPromises = new Map<string, Promise<FrameSequence>>();
const tintedFrameCache = new Map<string, HTMLCanvasElement>();
const TINT_CACHE_MAX = 50;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`failed to load ${src}`));
    img.src = src;
  });

const loadMaskData = async (
  maskSrc: string,
  spritesheet: HTMLImageElement,
  width: number,
  height: number,
): Promise<MaskData> => {
  try {
    const maskImg = await loadImage(maskSrc);
    const mctx = scratch(width, height);
    mctx.drawImage(maskImg, 0, 0);
    const maskImageData = mctx.getImageData(0, 0, width, height);
    const maskPixels = maskImageData.data;

    const mask = new Uint8Array(width * height);
    for (let p = 0; p < width * height; p++) {
      const m = Math.round(maskPixels[p * 4]! / 40);
      mask[p] = m;
    }

    // Calculate mean luminance per material from the spritesheet
    const bctx = scratch(width, height);
    bctx.drawImage(spritesheet, 0, 0);
    const baseImageData = bctx.getImageData(0, 0, width, height);
    const basePixels = baseImageData.data;

    const sum = new Float64Array(8);
    const count = new Float64Array(8);
    for (let p = 0; p < width * height; p++) {
      const m = mask[p]!;
      if (!m || m > 7 || basePixels[p * 4 + 3]! === 0) continue;
      const r = basePixels[p * 4]!;
      const g = basePixels[p * 4 + 1]!;
      const b = basePixels[p * 4 + 2]!;
      sum[m] = sum[m]! + (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
      count[m] = count[m]! + 1;
    }

    const meanL = new Float64Array(8);
    for (let m = 1; m < 8; m++) {
      meanL[m] = count[m] ? sum[m]! / count[m]! : 0.5;
    }

    return { mask, meanL, width, height };
  } catch (e) {
    console.warn('Failed to load mask:', maskSrc, e);
    const mask = new Uint8Array(width * height);
    const meanL = new Float64Array(8);
    for (let m = 1; m < 8; m++) meanL[m] = 0.5;
    return { mask, meanL, width, height };
  }
};

const spritesheetNames: Record<string, string> = {
  'east-run': 'east-run.png',
  'southwest-idle': 'idle-horse.png',
};

const maskNames: Record<string, string> = {
  'east-run': 'east-run-mask.png',
  'southwest-idle': 'idle-horse-mask.png',
};

function scratch(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  return ctx;
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

const extractFramesFromSpritesheet = async (
  spritesheet: HTMLImageElement,
  frameCount: number,
): Promise<HTMLImageElement[]> => {
  const FRAME_WIDTH = 92;
  const FRAME_HEIGHT = 92;
  const GRID_COLS = 3;

  const frames: HTMLImageElement[] = [];

  for (let i = 0; i < frameCount; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);

    const canvas = document.createElement('canvas');
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(
      spritesheet,
      col * FRAME_WIDTH,
      row * FRAME_HEIGHT,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      0,
      0,
      FRAME_WIDTH,
      FRAME_HEIGHT,
    );

    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const image = new Image();
      image.onload = () => res(image);
      image.onerror = () => rej(new Error(`Failed to create frame ${i}`));
      image.src = canvas.toDataURL();
    });

    frames.push(img);
  }

  return frames;
};

/**
 * Load a frame sequence from a spritesheet.
 * Sequence name maps to src/assets/horse-positions/{name}/ directory.
 * Also loads the mask PNG for tinting support.
 */
export async function loadFrameSequence(
  name: string,
  frameCount: number,
): Promise<FrameSequence> {
  const cached = sequences.get(name);
  if (cached) return cached;

  const pending = loadingPromises.get(name);
  if (pending) return pending;

  const promise = (async () => {
    const spritesheetName = spritesheetNames[name];
    if (!spritesheetName) {
      throw new Error(`Unknown sequence: ${name}`);
    }

    const spritesheetSrc = new URL(
      `../assets/horse-positions/${name}/${spritesheetName}`,
      import.meta.url,
    ).href;

    const maskName = maskNames[name];
    const maskSrc = maskName
      ? new URL(
          `../assets/horse-positions/${name}/${maskName}`,
          import.meta.url,
        ).href
      : '';

    const spritesheet = await loadImage(spritesheetSrc);
    const frames = await extractFramesFromSpritesheet(spritesheet, frameCount);

    let maskData: MaskData | undefined;
    if (maskSrc) {
      maskData = await loadMaskData(maskSrc, spritesheet, 276, 276);
    }

    const sequence: FrameSequence = { name, frames, maskData };
    sequences.set(name, sequence);
    loadingPromises.delete(name);
    return sequence;
  })();

  loadingPromises.set(name, promise);
  return promise;
}

export interface DrawFrameOptions {
  /** 0-1 through animation cycle */
  phase: number;
  /** Pixels per sprite pixel */
  scale: number;
  faded?: boolean;
  /** Optional color scheme for tinting */
  scheme?: Scheme;
}

type TintedSource = HTMLCanvasElement | HTMLImageElement;

function tintFrame(
  frame: HTMLImageElement,
  frameIndex: number,
  scheme: Scheme,
  maskData: MaskData,
): TintedSource {
  if (!maskData || !maskData.mask) return frame;

  const coat = typeof scheme.coat === 'string' ? coatFor(scheme.coat) : scheme.coat;
  const key = `frame-${frameIndex}|${coat.body}|${coat.hair}|${coat.points}|${coat.fixed}|${coat.shine}|${scheme.silks.primary}|${scheme.silks.secondary}`;

  const cached = tintedFrameCache.get(key);
  if (cached) {
    tintedFrameCache.delete(key);
    tintedFrameCache.set(key, cached);
    return cached;
  }

  const target: Record<number, [number, number, number]> = {
    [MATERIAL.body]: hexToHsl(coat.body),
    [MATERIAL.hair]: hexToHsl(coat.hair),
    [MATERIAL.points]: hexToHsl(coat.points),
    [MATERIAL.silks]: hexToHsl(scheme.silks.primary),
    [MATERIAL.trim]: hexToHsl(scheme.silks.secondary),
    [MATERIAL.fixed]: hexToHsl(coat.fixed),
    [MATERIAL.shine]: hexToHsl(coat.shine),
  };

  const ctx = scratch(92, 92);
  ctx.drawImage(frame, 0, 0);
  const imageData = ctx.getImageData(0, 0, 92, 92);
  const out = ctx.createImageData(92, 92);
  const { data } = imageData;
  const { mask, meanL } = maskData;

  // Calculate the offset of this frame in the 276x276 spritesheet (3x3 grid)
  const col = frameIndex % 3;
  const row = Math.floor(frameIndex / 3);
  const offsetX = col * 92;
  const offsetY = row * 92;
  const maskStride = 276;

  for (let y = 0; y < 92; y++) {
    for (let x = 0; x < 92; x++) {
      const p = y * 92 + x;
      const i = p * 4;
      const a = data[i + 3]!;
      out.data[i + 3] = a;
      if (a === 0) continue;

      const maskPixel = (offsetY + y) * maskStride + (offsetX + x);
      const m = mask[maskPixel]!;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      // Skip tinting pure black and white only for fixed (borders) and shine (eyes)
      const isPureBlack = r === 0 && g === 0 && b === 0;
      const isPureWhite = r === 255 && g === 255 && b === 255;
      if ((isPureBlack && m === MATERIAL.fixed) || (isPureWhite && m === MATERIAL.shine)) {
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
        continue;
      }

      const tint = target[m];

      if (!tint) {
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
        continue;
      }

      const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
      const lit = Math.max(0.02, Math.min(0.98, tint[2] + (l - meanL[m]!) * 0.9));
      const [nr, ng, nb] = hslToRgb(tint[0], tint[1], lit);
      out.data[i] = nr;
      out.data[i + 1] = ng;
      out.data[i + 2] = nb;
    }
  }

  ctx.putImageData(out, 0, 0);
  tintedFrameCache.set(key, ctx.canvas);

  while (tintedFrameCache.size > TINT_CACHE_MAX) {
    const oldest = tintedFrameCache.keys().next().value;
    if (oldest === undefined) break;
    const stale = tintedFrameCache.get(oldest);
    tintedFrameCache.delete(oldest);
    if (stale) {
      stale.width = 0;
      stale.height = 0;
    }
  }

  return ctx.canvas;
}

/**
 * Draw a frame from a loaded sequence, anchored at the center bottom (hooves).
 * If a scheme is provided, applies tinting based on the mask.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sequence: FrameSequence,
  opts: DrawFrameOptions,
): boolean {
  if (!sequence.frames.length) return false;

  const frameIndex = Math.floor(opts.phase * sequence.frames.length) % sequence.frames.length;
  const frame = sequence.frames[frameIndex]!;

  if (!frame.complete) return false;

  let source: TintedSource = frame;
  if (opts.scheme && sequence.maskData) {
    source = tintFrame(frame, frameIndex, opts.scheme, sequence.maskData);
  }

  const w = source.width * opts.scale;
  const h = source.height * opts.scale;
  const dx = x - w / 2;
  const dy = y - h;

  ctx.save();
  if (opts.faded) ctx.globalAlpha = 0.5;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, dx, dy, w, h);
  ctx.restore();
  return true;
}
