import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';

/**
 * Bake the delivered sprite sheet into material masks.
 *
 * The art arrives as one horse in one colour scheme, but Bloodline breeds its
 * horses — a foal's coat comes from its genes, and every runner in a field
 * needs its own silks or you cannot tell which one is yours. So the sheet has
 * to be split into MATERIALS that the renderer tints at runtime.
 *
 * Run: npm run bake-sprites
 * In:  src/assets/racer.png           the delivered sheet, untouched
 * Out: src/assets/racer-mask.png      one material id per pixel
 *      src/assets/racer.json          grid and per-frame registration
 *
 * The base art is NOT rewritten. The renderer reads luminance from the original
 * and colour from the mask, so replacing the art later means re-running this
 * and nothing else.
 *
 * WHY THIS WORKS AT ALL. An earlier delivery had a bay horse in red silks, and
 * a bay coat IS a dark red — coat and silks occupied one hue band and no rule
 * could separate them. This sheet was generated from a reference recoloured
 * specifically to avoid that: grey coat, black mane/tail/points, blue silks.
 * Every material now sits in its own corner of colour space. Keep that property
 * if the art is ever regenerated.
 */

const SRC = 'src/assets/racer.png';
const OUT_MASK = 'src/assets/racer-mask.png';
const OUT_META = 'src/assets/racer.json';

/** Grid the sheet is laid out on. */
const COLS = 5;
const ROWS = 5;

export const MATERIAL = {
  none: 0,
  /** The coat. Tinted by the body gene. */
  body: 1,
  /** Mane and tail. Tinted by the hair gene. */
  hair: 2,
  /** Cannons and hooves. Tinted by the points gene. */
  points: 3,
  /** Jacket, cap and saddle cloth. Tinted by the runner's silks. */
  silks: 4,
  /** Breeches and collar. Tinted by the silks' secondary colour. */
  trim: 5,
  /** Skin, leather, hoof horn — never tinted. */
  fixed: 6,
} as const;

type Material = (typeof MATERIAL)[keyof typeof MATERIAL];

/** Placeholder while a dark pixel is waiting to be resolved by blob. */
const DARK = 7;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
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

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function main(): void {
  const png = PNG.sync.read(readFileSync(resolve(SRC)));
  const { width: W, height: H, data } = png;
  const cw = W / COLS;
  const ch = H / ROWS;

  const alphaAt = (p: number): number => data[p * 4 + 3]!;

  // ---- Per-frame bounds -----------------------------------------------------
  // A cell can be empty; the sheet delivers 24 frames on a 25-cell grid.
  const boxes: (Box | null)[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let y = r * ch; y < (r + 1) * ch; y++) {
        for (let x = c * cw; x < (c + 1) * cw; x++) {
          if (alphaAt(y * W + x) > 100) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      boxes.push(x1 < 0 ? null : { x0, y0, x1, y1 });
    }
  }

  // ---- Colour pass ----------------------------------------------------------
  const lab = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (alphaAt(p) < 100) continue;
      const box = boxes[Math.floor(y / ch) * COLS + Math.floor(x / cw)];
      if (!box) continue;
      const fy = (y - box.y0) / (box.y1 - box.y0);
      const [h, s, l] = rgbToHsl(data[p * 4]!, data[p * 4 + 1]!, data[p * 4 + 2]!);

      if (h >= 195 && h <= 245 && s > 0.25) lab[p] = MATERIAL.silks;
      else if (s < 0.18 && l > 0.72 && fy < 0.55) lab[p] = MATERIAL.trim;
      else if (l < 0.22) lab[p] = DARK;
      else if (fy > 0.93 && l > 0.55) lab[p] = MATERIAL.fixed;
      else if (s < 0.2) lab[p] = MATERIAL.body;
      else lab[p] = MATERIAL.fixed;
    }
  }

  // ---- Dark pixels, resolved as whole blobs ---------------------------------
  // Mane, tail and points are all black, so colour cannot tell them apart, and
  // nor can position alone: the tail and the trailing hind leg occupy the same
  // corner of the frame. What separates them is that the coat is grey, so each
  // black region is a SEPARATE connected blob — and a whole blob can be placed
  // even when its individual pixels cannot.
  const comp = new Int32Array(W * H).fill(-1);
  const blobs: { n: number; x0: number; y0: number; x1: number; y1: number; cell: number }[] = [];
  const stack: number[] = [];
  for (let seed = 0; seed < W * H; seed++) {
    if (lab[seed] !== DARK || comp[seed] !== -1) continue;
    const id = blobs.length;
    const blob = { n: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, cell: -1 };
    comp[seed] = id;
    stack.push(seed);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % W;
      const y = (p / W) | 0;
      blob.n++;
      if (x < blob.x0) blob.x0 = x;
      if (x > blob.x1) blob.x1 = x;
      if (y < blob.y0) blob.y0 = y;
      if (y > blob.y1) blob.y1 = y;
      if (blob.cell < 0) blob.cell = Math.floor(y / ch) * COLS + Math.floor(x / cw);
      if (x > 0 && lab[p - 1] === DARK && comp[p - 1] === -1) { comp[p - 1] = id; stack.push(p - 1); }
      if (x < W - 1 && lab[p + 1] === DARK && comp[p + 1] === -1) { comp[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && lab[p - W] === DARK && comp[p - W] === -1) { comp[p - W] = id; stack.push(p - W); }
      if (y < H - 1 && lab[p + W] === DARK && comp[p + W] === -1) { comp[p + W] = id; stack.push(p + W); }
    }
    blobs.push(blob);
  }

  const blobKind: Material[] = blobs.map((b) => {
    const box = boxes[b.cell];
    if (!box || b.n < 40) return MATERIAL.fixed;
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    const cx = ((b.x0 + b.x1) / 2 - box.x0) / w;
    const top = (b.y0 - box.y0) / h;
    const bottom = (b.y1 - box.y0) / h;
    if (cx < 0.42 && top < 0.5) return MATERIAL.hair; // tail, hung from the dock
    if (top < 0.32 && cx > 0.45) return MATERIAL.hair; // mane along the crest
    if (bottom > 0.72) return MATERIAL.points; // cannons and hooves
    return MATERIAL.fixed; // boots, saddle, bridle
  });
  for (let p = 0; p < W * H; p++) if (lab[p] === DARK) lab[p] = blobKind[comp[p]!] ?? MATERIAL.fixed;

  // ---- Fill the speckle -----------------------------------------------------
  // Pixels part-way between a black leg and the grey coat land on `body` and
  // show up as coat-coloured freckles inside a cannon. Any pixel whose
  // neighbours mostly disagree with it takes their label instead.
  const smoothed = Uint8Array.from(lab);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!lab[p] || alphaAt(p) < 100) continue;
      const tally = new Map<number, number>();
      for (const q of [p - 1, p + 1, p - W, p + W, p - W - 1, p - W + 1, p + W - 1, p + W + 1]) {
        const v = lab[q]!;
        if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
      }
      let bestV = lab[p]!;
      let bestN = 0;
      for (const [v, n] of tally) if (n > bestN) { bestN = n; bestV = v; }
      if (bestV !== lab[p] && bestN >= 6) smoothed[p] = bestV;
    }
  }

  // ---- Write ----------------------------------------------------------------
  const mask = new PNG({ width: W, height: H });
  const tally: Record<number, number> = {};
  for (let p = 0; p < W * H; p++) {
    const v = smoothed[p]!;
    tally[v] = (tally[v] ?? 0) + 1;
    // Material id in red, so the file is greppable by eye in any image viewer.
    mask.data[p * 4] = v * 40;
    mask.data[p * 4 + 1] = 0;
    mask.data[p * 4 + 2] = 0;
    mask.data[p * 4 + 3] = v ? 255 : 0;
  }
  mkdirSync(dirname(resolve(OUT_MASK)), { recursive: true });
  writeFileSync(resolve(OUT_MASK), PNG.sync.write(mask));

  const frames = boxes
    .map((b, i) => (b ? { cell: i, x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 } : null))
    .filter((f): f is NonNullable<typeof f> => f !== null);
  writeFileSync(
    resolve(OUT_META),
    `${JSON.stringify({ sheet: SRC, width: W, height: H, cols: COLS, rows: ROWS, cellW: cw, cellH: ch, frames }, null, 2)}\n`,
  );

  const NAMES = ['none', 'body', 'hair', 'points', 'silks', 'trim', 'fixed'];
  const opaque = Object.entries(tally).reduce((a, [k, v]) => (+k ? a + v : a), 0);
  console.log(`${frames.length} frames on a ${COLS}x${ROWS} grid`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    if (!+k) continue;
    console.log(`  ${NAMES[+k]!.padEnd(7)} ${String(v).padStart(7)}  ${((100 * v) / opaque).toFixed(1)}%`);
  }
  console.log(`\nwrote ${OUT_MASK}\nwrote ${OUT_META}`);
}

main();
