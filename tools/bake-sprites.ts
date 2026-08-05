import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';
import {
  KEY,
  MATERIAL,
  MATERIAL_NAMES,
  type Material,
  chromaOf,
  hexToRgb,
  hueIn,
  materialByName,
  rgbToHsl,
} from './material-key.js';

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
 *      src/assets/racer-id.png        the same regions in the KEY colours
 *      src/assets/racer.json          grid and per-frame registration
 *
 * THE ID SHEET IS THE ESCAPE HATCH. Everything below infers a material from a
 * shaded render, and inference is fragile: seven geometric rules, every one of
 * them measured against the poses in the CURRENT sheet. `racer-id.png` is that
 * inference painted in flat key colours — an ordinary image. Open it, fix any
 * region that came out wrong, and run
 *
 *     npm run bake-flat -- src/assets/racer-id.png --out src/assets/racer-mask.png
 *
 * which reads it by colour alone. The rules below stop being the source of
 * truth and become a first draft, which is the right job for them.
 *
 * The base art is NOT rewritten. The renderer reads luminance from the original
 * and colour from the mask, so replacing the art later means re-running this
 * and nothing else.
 *
 * WHY THIS WORKS AT ALL. An earlier delivery had a bay horse in red silks, and
 * a bay coat IS a dark red — coat and silks occupied one hue band and no rule
 * could separate them. This sheet was generated from a reference recoloured
 * specifically to avoid that: grey coat, black mane/tail/points, blue silks,
 * white breeches. Measured over the whole sheet, those four bands do not touch:
 *
 *     material   lightness (p5..p95)   chroma (p5..p95)
 *     coat       0.25 .. 0.63          3 .. 16
 *     mane/tail  0.03 .. 0.22          2 .. 10
 *     points     0.01 .. 0.20          1 .. 11
 *     silks      0.22 .. 0.59          50 .. 185   (hue 200-230)
 *     breeches   0.75 .. 0.94          5 .. 13
 *
 * Keep that property if the art is ever regenerated. Note CHROMA, not HSL
 * saturation: the breeches are (246,244,248), which is a saturation of 0.22
 * — high enough to trip a saturation threshold — but a chroma of 4.
 */

const SRC = 'src/assets/racer.png';
const OUT_MASK = 'src/assets/racer-mask.png';
const OUT_ID = 'src/assets/racer-id.png';
const OUT_META = 'src/assets/racer.json';

/** Grid the sheet is laid out on. */
const COLS = 5;
const ROWS = 5;


/** Placeholder while a black pixel is waiting to be resolved by blob. */
const DARK = 7;

/** Below this the pixel is sheet background, not art. */
const ALPHA_EDGE = 1;
/** Below this the pixel is a half-transparent edge: labelled, but never a seed. */
const ALPHA_SOLID = 200;

// ---- Colour bands -----------------------------------------------------------
// All measured off the sheet; see the table above. Chroma is 0-255.

/** Coat and breeches never reach this much colour; the silks never fall below it. */
const CHROMA_TINTED = 40;
/** Skin and leather carry some colour without being silks. */
const CHROMA_WARM = 22;
/** Above this a pixel is one of the blacks. */
const L_BLACK = 0.235;
/** Above this a pixel is too light to be coat. */
const L_WHITE = 0.68;
/** Hue window the silks occupy. */
const HUE_SILKS: [number, number] = [190, 250];
/** Hue window skin occupies. Wraps zero. */
const HUE_SKIN: [number, number] = [-25, 55];

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Blob {
  n: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cell: number;
}

/** Where a blob sits inside its own frame, 0-1 on each axis. */
interface Placed {
  n: number;
  cx: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const place = (b: Blob, box: Box): Placed => {
  const w = box.x1 - box.x0 || 1;
  const h = box.y1 - box.y0 || 1;
  return {
    n: b.n,
    cx: ((b.x0 + b.x1) / 2 - box.x0) / w,
    left: (b.x0 - box.x0) / w,
    right: (b.x1 - box.x0) / w,
    top: (b.y0 - box.y0) / h,
    bottom: (b.y1 - box.y0) / h,
  };
};

function main(): void {
  const png = PNG.sync.read(readFileSync(resolve(SRC)));
  const { width: W, height: H, data } = png;
  const cw = W / COLS;
  const ch = H / ROWS;
  const N = W * H;

  const alphaAt = (p: number): number => data[p * 4 + 3]!;
  const cellOf = (p: number): number =>
    Math.floor((p / W / ch) | 0) * COLS + Math.floor((p % W) / cw);

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

  // ---- Denoise --------------------------------------------------------------
  // The sheet is a compressed render and carries chroma speckle — stray violet
  // and orange pixels along every black/grey boundary, tens of thousands of
  // them. Classified raw they scatter mane and skin ids through the coat. A
  // 3x3 median kills the speckle without moving an edge more than a pixel, and
  // it is only ever used to CHOOSE a label; the renderer still reads its
  // luminance from the untouched art.
  const med = new Uint8Array(N * 3);
  const win: number[][] = [[], [], []];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (alphaAt(p) < ALPHA_EDGE) continue;
      win[0]!.length = 0;
      win[1]!.length = 0;
      win[2]!.length = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const q = (yy * W + xx) * 4;
          if (data[q + 3]! < ALPHA_SOLID) continue;
          win[0]!.push(data[q]!);
          win[1]!.push(data[q + 1]!);
          win[2]!.push(data[q + 2]!);
        }
      }
      for (let c = 0; c < 3; c++) {
        const v = win[c]!;
        if (!v.length) {
          med[p * 3 + c] = data[p * 4 + c]!;
          continue;
        }
        v.sort((a, b) => a - b);
        med[p * 3 + c] = v[v.length >> 1]!;
      }
    }
  }

  // ---- Colour pass ----------------------------------------------------------
  // Seeds only: a half-transparent edge pixel is a blend of the art and nothing,
  // so its colour is not its material. Those are grown into from inside later.
  const lab = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (alphaAt(p) < ALPHA_SOLID) continue;
    const r = med[p * 3]!;
    const g = med[p * 3 + 1]!;
    const b = med[p * 3 + 2]!;
    const chroma = chromaOf(r, g, b);
    const [h, , l] = rgbToHsl(r, g, b);

    if (chroma >= CHROMA_TINTED && hueIn(h, HUE_SILKS)) lab[p] = MATERIAL.silks;
    else if (chroma >= CHROMA_WARM && hueIn(h, HUE_SKIN)) lab[p] = MATERIAL.fixed;
    else if (chroma >= CHROMA_TINTED) lab[p] = MATERIAL.fixed;
    else if (l < L_BLACK) lab[p] = DARK;
    else if (l > L_WHITE) lab[p] = MATERIAL.trim;
    else lab[p] = MATERIAL.body;
  }

  /** Four-connected components over the pixels matching `want`. */
  function components(want: (p: number) => boolean): { comp: Int32Array; blobs: Blob[] } {
    const comp = new Int32Array(N).fill(-1);
    const blobs: Blob[] = [];
    const stack: number[] = [];
    for (let seed = 0; seed < N; seed++) {
      if (comp[seed] !== -1 || !want(seed)) continue;
      const id = blobs.length;
      const blob: Blob = { n: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, cell: cellOf(seed) };
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
        if (x > 0 && comp[p - 1] === -1 && want(p - 1)) { comp[p - 1] = id; stack.push(p - 1); }
        if (x < W - 1 && comp[p + 1] === -1 && want(p + 1)) { comp[p + 1] = id; stack.push(p + 1); }
        if (y > 0 && comp[p - W] === -1 && want(p - W)) { comp[p - W] = id; stack.push(p - W); }
        if (y < H - 1 && comp[p + W] === -1 && want(p + W)) { comp[p + W] = id; stack.push(p + W); }
      }
      blobs.push(blob);
    }
    return { comp, blobs };
  }

  // ---- Black pixels, resolved as whole blobs ---------------------------------
  // Mane, tail, cannons, boot, saddle and bridle are all the same black, so
  // colour cannot tell them apart. What can is that the coat is grey, which
  // leaves each black region a SEPARATE connected blob — and a blob can be
  // placed by where it sits in the frame even when its pixels cannot.
  //
  // Measured across all 24 frames, the four blobs that matter never overlap:
  //
  //     tail    touches the left edge, hangs from 0.30-0.40 down to 0.61-0.70
  //     mane    upper right, top 0.06-0.15, a fifth of the frame wide or more
  //     boot    a narrow column at cx 0.50-0.56, from 0.29 down to 0.62-0.69
  //     cannons reach the ground: bottom 0.79-1.00
  //
  // The boot is the one that bites. It starts at 0.29 — just above the mane's
  // old cutoff — and sits right of centre, so a rule written for the mane
  // claims it and a whole stirrup leather tints as mane colour. Requiring the
  // mane to be WIDE separates them: the mane spans 0.20-0.29 of frame width,
  // the boot 0.11 and the goggles 0.05.
  const dark = components((p) => lab[p] === DARK);
  const darkKind: Material[] = dark.blobs.map((b) => {
    const box = boxes[b.cell];
    if (!box || b.n < 150) return MATERIAL.fixed; // goggles, straps, buckles
    const q = place(b, box);
    const wide = q.right - q.left > 0.14;
    if (wide && q.top < 0.20 && q.cx > 0.55 && q.bottom < 0.45) return MATERIAL.hair; // mane
    if (q.left < 0.12 && q.top < 0.45 && q.bottom < 0.75) return MATERIAL.hair; // tail
    if (q.bottom > 0.75) return MATERIAL.points; // cannons
    return MATERIAL.fixed; // boot, stirrup leather, saddle
  });
  for (let p = 0; p < N; p++) {
    if (lab[p] === DARK) lab[p] = darkKind[dark.comp[p]!] ?? MATERIAL.fixed;
  }

  // ---- Only the jockey wears white ------------------------------------------
  // The breeches are ~270 pixels every frame and the collar under the chin 47-97
  // wherever the head is not over it; both sit in the top 45% of the frame,
  // because that is where the rider is. Every other white is a specular pop —
  // on a hoof, on a buckle, on the cap — and both tests are needed to be rid of
  // them: size alone keeps the pop on a boot, position alone keeps the shine on
  // the cap. What is left goes back to plain grey rather than to `fixed`, so
  // the shine on a hoof rejoins the hoof in the pass below instead of stranding
  // the horn as its own untinted island.
  const white = components((p) => lab[p] === MATERIAL.trim);
  const whiteIsCloth = white.blobs.map((b) => {
    const box = boxes[b.cell];
    return !!box && b.n >= 20 && place(b, box).top < 0.45;
  });
  for (let p = 0; p < N; p++) {
    if (lab[p] === MATERIAL.trim && !whiteIsCloth[white.comp[p]!]) lab[p] = MATERIAL.body;
  }

  // ---- Grey islands are not coat --------------------------------------------
  // A hoof is pale horn ringed by the black cannon, so it reads as plain grey
  // and lands on `body` — which would tint four hooves with the coat colour on
  // every runner, and did in the mask this replaces. The coat is a couple of
  // large regions per frame (the jockey cuts the barrel off from the neck), and
  // measured over the sheet the split never goes below 1579 pixels while no
  // island goes above 97, so size alone tells them apart with room to spare.
  //
  // What an island IS gets decided by what surrounds it. A hoof is ringed by
  // cannon: it takes `points`, and the leg tints as one piece down to the
  // ground. A highlight on a boot is ringed by leather and stays `fixed`. A
  // speed line floats in open background with nothing around it at all, and
  // stays `fixed` too — it is a motion streak, not part of any horse.
  const ISLAND_MAX = 400;
  const grey = components((p) => lab[p] === MATERIAL.body);
  const ring = grey.blobs.map(() => new Map<number, number>());
  for (let p = 0; p < N; p++) {
    const id = grey.comp[p]!;
    if (id < 0 || grey.blobs[id]!.n > ISLAND_MAX) continue;
    const x = p % W;
    const y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q < 0) continue;
      const v = lab[q]!;
      if (!v || v === MATERIAL.body) continue;
      ring[id]!.set(v, (ring[id]!.get(v) ?? 0) + 1);
    }
  }
  const greyKind: Material[] = grey.blobs.map((b, i) => {
    if (b.n > ISLAND_MAX) return MATERIAL.body;
    let best = 0;
    let bestN = 0;
    for (const [v, n] of ring[i]!) if (n > bestN) { bestN = n; best = v; }
    return best === MATERIAL.points ? MATERIAL.points : MATERIAL.fixed;
  });
  for (let p = 0; p < N; p++) {
    if (lab[p] === MATERIAL.body) lab[p] = greyKind[grey.comp[p]!]!;
  }

  // ---- Fill the speckle -----------------------------------------------------
  // Pixels part-way between a black leg and the grey coat land on `body` and
  // show up as coat-coloured freckles inside a cannon. Any pixel whose
  // neighbours mostly disagree with it takes their label instead. Twice, so a
  // two-pixel-wide fringe closes as well as a one-pixel one.
  for (let pass = 0; pass < 2; pass++) {
    const src = Uint8Array.from(lab);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (!src[p]) continue;
        const tally = new Map<number, number>();
        for (const q of [p - 1, p + 1, p - W, p + W, p - W - 1, p - W + 1, p + W - 1, p + W + 1]) {
          const v = src[q]!;
          if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
        }
        let bestV = src[p]!;
        let bestN = 0;
        for (const [v, n] of tally) if (n > bestN) { bestN = n; bestV = v; }
        if (bestV !== src[p] && bestN >= 6) lab[p] = bestV;
      }
    }
  }

  // ---- Tack drawn ON the coat goes back to the coat --------------------------
  // The bridle, the noseband and the reins are dark leather lines a pixel or
  // two wide, lying across the neck and the cheek. Most of them dissolve into
  // the coat in the smoothing above; what survives is a scatter of little
  // untinted flecks that read as dirt on a tinted horse, worse than the strap
  // reading as a shadow would. So any leftover island of `fixed` that the coat
  // has all but closed around is given back to it.
  //
  // Deliberately narrow. The saddle, the boot and the stirrup leather are also
  // tack, and they stay: they are large, and they border the silks and the
  // background as much as the coat, so neither test lets them through.
  const TACK_MAX = 200;
  const TACK_ENCLOSED = 0.8;
  const tack = components((p) => lab[p] === MATERIAL.fixed);
  const tackRing = tack.blobs.map(() => ({ body: 0, other: 0 }));
  for (let p = 0; p < N; p++) {
    const id = tack.comp[p]!;
    if (id < 0 || tack.blobs[id]!.n > TACK_MAX) continue;
    const x = p % W;
    const y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q < 0) continue;
      const v = lab[q]!;
      if (!v || v === MATERIAL.fixed) continue;
      if (v === MATERIAL.body) tackRing[id]!.body++;
      else tackRing[id]!.other++;
    }
  }
  const tackIsCoat = tack.blobs.map((b, i) => {
    if (b.n > TACK_MAX) return false;
    const { body, other } = tackRing[i]!;
    return body > 0 && body / (body + other) >= TACK_ENCLOSED;
  });
  for (let p = 0; p < N; p++) {
    if (lab[p] === MATERIAL.fixed && tackIsCoat[tack.comp[p]!]) lab[p] = MATERIAL.body;
  }

  // ---- Grow into the soft edge ----------------------------------------------
  // The art is anti-aliased, so ~24k pixels around every silhouette are a
  // partly-transparent blend of the horse and nothing. Their colour is a lie —
  // a black cannon fades through grey on its way out — so they were never
  // seeded. Left unlabelled the renderer passes them through untinted and a
  // chestnut horse wears a grey halo, so each takes the label of the nearest
  // pixel that WAS seeded.
  const queue: number[] = [];
  for (let p = 0; p < N; p++) if (lab[p]) queue.push(p);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    const x = p % W;
    const y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q < 0 || lab[q] || alphaAt(q) < ALPHA_EDGE) continue;
      lab[q] = lab[p]!;
      queue.push(q);
    }
  }

  // ---- Write ----------------------------------------------------------------
  const mask = new PNG({ width: W, height: H });
  const tally: Record<number, number> = {};
  for (let p = 0; p < N; p++) {
    const v = lab[p]!;
    tally[v] = (tally[v] ?? 0) + 1;
    // Material id in red, so the file is greppable by eye in any image viewer.
    mask.data[p * 4] = v * 40;
    mask.data[p * 4 + 1] = 0;
    mask.data[p * 4 + 2] = 0;
    mask.data[p * 4 + 3] = v ? 255 : 0;
  }
  mkdirSync(dirname(resolve(OUT_MASK)), { recursive: true });
  writeFileSync(resolve(OUT_MASK), PNG.sync.write(mask));

  // The same labels, painted in the key colours, as a normal editable image.
  const swatch: Record<number, [number, number, number]> = {};
  for (const [name, { hex }] of Object.entries(KEY)) {
    const m = materialByName(name);
    if (m) swatch[m] = hexToRgb(hex);
  }
  const id = new PNG({ width: W, height: H });
  for (let p = 0; p < N; p++) {
    const c = swatch[lab[p]!];
    id.data[p * 4] = c?.[0] ?? 0;
    id.data[p * 4 + 1] = c?.[1] ?? 0;
    id.data[p * 4 + 2] = c?.[2] ?? 0;
    id.data[p * 4 + 3] = c ? 255 : 0;
  }
  writeFileSync(resolve(OUT_ID), PNG.sync.write(id));

  const frames = boxes
    .map((b, i) => (b ? { cell: i, x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 } : null))
    .filter((f): f is NonNullable<typeof f> => f !== null);
  writeFileSync(
    resolve(OUT_META),
    `${JSON.stringify({ sheet: SRC, width: W, height: H, cols: COLS, rows: ROWS, cellW: cw, cellH: ch, frames }, null, 2)}\n`,
  );

  const opaque = Object.entries(tally).reduce((a, [k, v]) => (+k ? a + v : a), 0);
  console.log(`${frames.length} frames on a ${COLS}x${ROWS} grid`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    if (!+k) continue;
    console.log(`  ${MATERIAL_NAMES[+k]!.padEnd(7)} ${String(v).padStart(7)}  ${((100 * v) / opaque).toFixed(1)}%`);
  }
  console.log(`\nwrote ${OUT_MASK}\nwrote ${OUT_ID}\nwrote ${OUT_META}`);
}

main();
