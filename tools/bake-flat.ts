import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import {
  KEY,
  MATERIAL,
  MATERIAL_NAMES,
  type Material,
  classifyByKey,
  hexToRgb,
  materialByName,
} from './material-key.js';
import { traceSvg } from './trace-mask.js';

/**
 * Bake a material mask for FLAT art, by colour alone.
 *
 * `tools/bake-sprites.ts` is 400 lines because `racer.png` is a shaded render
 * whose mane, tail, cannons and saddle are all the same black — it has to
 * recover the difference from connected-component geometry, one rule per
 * region, remeasured whenever the art changes. None of that is inherent to
 * masking. It is the cost of art that was not painted for it.
 *
 * Art painted to the material key, or to any palette where each material has
 * its own colour, needs none of it. This tool is the whole job:
 *
 *     1. seed every pixel that is close to a known material colour
 *     2. grow those labels into the anti-aliasing and the soft edge
 *     3. smooth
 *
 * No geometry, no per-asset tuning, no frame layout, nothing to break when a
 * pose changes. If you are making new art, this is the pipeline to aim at.
 *
 * Run: npm run bake-flat -- src/assets/shield-badge.png
 * Out: src/assets/shield-badge-mask.png
 *      src/assets/shield-badge-mask.svg
 *
 * SIDECAR. With no sidecar the art is read against the material key in
 * `tools/material-key.ts`. That is the target, but existing art will not always
 * match it, so `<asset>.materials.json` may declare the palette instead:
 *
 *     { "palette": { "body": ["#7f7f81"], "hair": ["#a02840", "#af153f"] } }
 *
 * List the flat colours a material is actually painted with — `npm run
 * check-art` prints them — and every shade and blend around them follows. A
 * sidecar is the escape hatch, not the goal: it pins the mask to the exact
 * colours in one file, so recolouring the art invalidates it.
 */

/** How far from a declared colour a pixel can be and still seed it. */
const SEED_TOLERANCE = 44;
/** Below this the pixel is background, not art. */
const ALPHA_EDGE = 1;
/** Below this the pixel is a blend with the background: labelled, never a seed. */
const ALPHA_SOLID = 200;
/** Neighbours that must agree before a pixel is overruled. */
const SMOOTH_AGREE = 6;
const SMOOTH_PASSES = 2;

interface Sidecar {
  note?: string;
  palette: Record<string, string[]>;
}

/** Squared RGB distance — square roots are not needed to rank. */
const dist2 = (r: number, g: number, b: number, c: [number, number, number]): number =>
  (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;

function main(): void {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: bake-flat <asset.png>');
    process.exitCode = 1;
    return;
  }

  const stem = join(dirname(src), basename(src, extname(src)));
  const outMask = `${stem}-mask.png`;
  const outSvg = `${stem}-mask.svg`;
  const sidecarPath = `${stem}.materials.json`;

  // ---- The palette this asset is read against -------------------------------
  const swatches = new Map<Material, [number, number, number][]>();
  let source: string;
  if (existsSync(resolve(sidecarPath))) {
    const sidecar = JSON.parse(readFileSync(resolve(sidecarPath), 'utf8')) as Sidecar;
    for (const [name, hexes] of Object.entries(sidecar.palette)) {
      const m = materialByName(name);
      if (!m) throw new Error(`${sidecarPath}: "${name}" is not a material`);
      swatches.set(m, hexes.map(hexToRgb));
    }
    source = `${basename(sidecarPath)}${sidecar.note ? ` — ${sidecar.note}` : ''}`;
  } else {
    for (const [name, { hex }] of Object.entries(KEY)) {
      const m = materialByName(name);
      if (m) swatches.set(m, [hexToRgb(hex)]);
    }
    source = 'the material key (no sidecar)';
  }

  /** Distance from a colour to the nearest swatch of one material. */
  const toMaterial = (m: Material, r: number, g: number, b: number): number => {
    let best = Infinity;
    for (const c of swatches.get(m) ?? []) best = Math.min(best, dist2(r, g, b, c));
    return best;
  };

  const png = PNG.sync.read(readFileSync(resolve(src)));
  const { width: W, height: H, data } = png;
  const N = W * H;
  const lab = new Uint8Array(N);

  // ---- Seed -----------------------------------------------------------------
  // A pixel only seeds if it is genuinely close to a declared colour. Blends
  // are deliberately left blank: a pixel halfway between the white field and
  // the navy border is a mid blue-grey that can sit nearer the BODY swatch than
  // to either of its actual neighbours, so classifying it by colour draws a
  // grey line around every border. Left blank, it is filled by what surrounds
  // it instead, which is right by construction.
  const tol2 = SEED_TOLERANCE ** 2;
  for (let p = 0; p < N; p++) {
    if (data[p * 4 + 3]! < ALPHA_SOLID) continue;
    const r = data[p * 4]!, g = data[p * 4 + 1]!, b = data[p * 4 + 2]!;
    let best: Material = MATERIAL.none;
    let bestD = Infinity;
    for (const m of swatches.keys()) {
      const d = toMaterial(m, r, g, b);
      if (d < bestD) { bestD = d; best = m; }
    }
    // Nothing declared is close. With a sidecar that means a colour nobody
    // listed; against the key it means skin or leather, which IS `fixed`.
    if (bestD > tol2) lab[p] = swatches.size && existsSync(resolve(sidecarPath))
      ? MATERIAL.fixed
      : classifyByKey(r, g, b);
    else lab[p] = best;
  }

  // ---- Grow into the blends and the soft edge -------------------------------
  // Multi-source flood, but a pixel takes the label of whichever LABELLED
  // NEIGHBOUR it is closest to in colour, not simply the first to reach it. On
  // a two-pixel anti-aliased border that puts the split where the eye puts it.
  const queue: number[] = [];
  for (let p = 0; p < N; p++) if (lab[p]) queue.push(p);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    const x = p % W;
    const y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q < 0 || lab[q] || data[q * 4 + 3]! < ALPHA_EDGE) continue;
      const qx = q % W;
      const qy = (q / W) | 0;
      const r = data[q * 4]!, g = data[q * 4 + 1]!, b = data[q * 4 + 2]!;
      let best: Material = lab[p] as Material;
      let bestD = Infinity;
      for (const n of [qx > 0 ? q - 1 : -1, qx < W - 1 ? q + 1 : -1, qy > 0 ? q - W : -1, qy < H - 1 ? q + W : -1]) {
        if (n < 0 || !lab[n]) continue;
        const d = toMaterial(lab[n] as Material, r, g, b);
        if (d < bestD) { bestD = d; best = lab[n] as Material; }
      }
      lab[q] = best;
      queue.push(q);
    }
  }

  // ---- Smooth ---------------------------------------------------------------
  // Single stray pixels along a boundary, same as the sprite baker.
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const prev = Uint8Array.from(lab);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (!prev[p]) continue;
        const tally = new Map<number, number>();
        for (const q of [p - 1, p + 1, p - W, p + W, p - W - 1, p - W + 1, p + W - 1, p + W + 1]) {
          const v = prev[q]!;
          if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
        }
        let bestV = prev[p]!;
        let bestN = 0;
        for (const [v, n] of tally) if (n > bestN) { bestN = n; bestV = v; }
        if (bestV !== prev[p] && bestN >= SMOOTH_AGREE) lab[p] = bestV;
      }
    }
  }

  // ---- Write ----------------------------------------------------------------
  const mask = new PNG({ width: W, height: H });
  const tally: Record<number, number> = {};
  for (let p = 0; p < N; p++) {
    const v = lab[p]!;
    tally[v] = (tally[v] ?? 0) + 1;
    mask.data[p * 4] = v * 40;
    mask.data[p * 4 + 1] = 0;
    mask.data[p * 4 + 2] = 0;
    mask.data[p * 4 + 3] = v ? 255 : 0;
  }
  writeFileSync(resolve(outMask), PNG.sync.write(mask));
  writeFileSync(resolve(outSvg), traceSvg(lab, W, H, src));

  const opaque = Object.entries(tally).reduce((a, [k, v]) => (+k ? a + v : a), 0);
  console.log(`${basename(src)}  ${W}x${H}  read against ${source}`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    if (!+k) continue;
    console.log(`  ${MATERIAL_NAMES[+k]!.padEnd(7)} ${String(v).padStart(7)}  ${((100 * v) / opaque).toFixed(1)}%`);
  }
  console.log(`\nwrote ${outMask}\nwrote ${outSvg}`);
}

main();
