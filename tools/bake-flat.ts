import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { MATERIAL, MATERIAL_NAMES, type Material, classifyByKey } from './material-key.js';

/**
 * Bake a material mask for FLAT art, by colour alone.
 *
 * `tools/bake-sprites.ts` is 400 lines because `racer.png` is a shaded render
 * whose mane, tail, cannons and saddle are all the same black — it has to
 * recover the difference from connected-component geometry, one rule per
 * region, remeasured whenever the art changes. None of that is inherent to
 * masking. It is the cost of art that was not painted for it.
 *
 * Art painted to the material key needs none of it. This tool is the whole job:
 *
 *     1. classify every solid pixel by the key
 *     2. grow those labels into the anti-aliasing and the soft edge
 *     3. smooth
 *
 * No geometry, no per-asset tuning, no frame layout, nothing to break when a
 * pose changes. If you are making new art, this is the pipeline to aim at.
 *
 * Run: npm run bake-flat -- src/assets/shield-badge.png
 * Out: src/assets/shield-badge-mask.png
 *
 * `--art` pairs the mask with a DIFFERENT image from the one being read. An ID
 * sheet is a hand-edited copy of the labels, and an editor is free to write its
 * alpha channel a little differently from the art's — LibreSprite trims the
 * outermost semi-transparent ring. Grow the labels only as far as the ID sheet
 * reaches and the art's own soft edge is left unlabelled, which the renderer
 * passes through untinted: a grey halo around every recoloured horse. With
 * `--art` the labels are grown to cover the ART's silhouette instead, which is
 * the one that has to be covered.
 *
 * The art is read against the material key in `tools/material-key.ts` and
 * nothing else — no sidecar, no per-asset palette file. An asset that does not
 * match the key is not a case to configure around, it is a repaint: `npm run
 * check-art` says which material is off and by how many degrees, and fixing it
 * there fixes it for every tool at once instead of pinning one mask to one set
 * of hex values that the next edit silently invalidates.
 *
 * WHY THE KEY'S BANDS AND NOT ITS HEX VALUES. An early version of this seeded
 * by RGB distance to each key colour, which sounds equivalent and is not. The
 * shield badge shades its blue across #3360A8, #1F346A and #153171. All three
 * are unambiguously silks — chroma over 75, hue within six degrees of each
 * other — yet the nearest of them is 55 away from the key's #1E6FD9 in RGB, so
 * a tolerance loose enough to admit them would admit half the palette. Every
 * one of them fell through to `fixed` and the badge lost its border. The bands
 * exist precisely because shading moves a colour a long way in RGB while
 * leaving its hue and chroma where they were.
 */

/** Below this the pixel is background, not art. */
const ALPHA_EDGE = 1;
/** Below this the pixel is a blend with the background: labelled, never a seed. */
const ALPHA_SOLID = 200;
/** Neighbours that must agree before a pixel is overruled. */
const SMOOTH_AGREE = 6;
const SMOOTH_PASSES = 2;

function main(): void {
  const args = process.argv.slice(2);
  // Skip the value that belongs to --out, not just the flag itself.
  const taken = new Set<number>();
  args.forEach((a, i) => { if (a === '--out' || a === '--art') taken.add(i).add(i + 1); });
  const src = args.find((a, i) => !taken.has(i) && !a.startsWith('--'));
  if (!src) {
    console.error('usage: bake-flat <asset.png> [--out <mask.png>] [--art <art.png>]');
    process.exitCode = 1;
    return;
  }
  // `--out` exists so a hand-corrected ID SHEET can write the mask its ART
  // expects: racer-id.png has to become racer-mask.png, not racer-id-mask.png.
  const outAt = args.indexOf('--out');
  const outMask = outAt >= 0 && args[outAt + 1]
    ? args[outAt + 1]!
    : `${join(dirname(src), basename(src, extname(src)))}-mask.png`;

  const png = PNG.sync.read(readFileSync(resolve(src)));
  const { width: W, height: H, data } = png;
  const N = W * H;
  const lab = new Uint8Array(N);

  // The silhouette the mask has to cover: the art's, when one is named.
  const artAt = args.indexOf('--art');
  const artPath = artAt >= 0 ? args[artAt + 1] : undefined;
  let cover = data;
  if (artPath) {
    const art = PNG.sync.read(readFileSync(resolve(artPath)));
    if (art.width !== W || art.height !== H) {
      throw new Error(`--art is ${art.width}x${art.height}, source is ${W}x${H}`);
    }
    cover = art.data;
  }
  const needsLabel = (p: number): boolean => cover[p * 4 + 3]! >= ALPHA_EDGE;

  const dist2 = (p: number, q: number): number =>
    (data[p * 4]! - data[q * 4]!) ** 2 +
    (data[p * 4 + 1]! - data[q * 4 + 1]!) ** 2 +
    (data[p * 4 + 2]! - data[q * 4 + 2]!) ** 2;

  // ---- Classify the solid pixels --------------------------------------------
  // Only the solid ones. A half-transparent pixel is a blend of the art and
  // nothing, so its colour is not its material — a navy border fades out
  // through mid grey, and mid grey is the coat.
  for (let p = 0; p < N; p++) {
    if (data[p * 4 + 3]! < ALPHA_SOLID) continue;
    lab[p] = classifyByKey(data[p * 4]!, data[p * 4 + 1]!, data[p * 4 + 2]!);
  }

  // ---- Grow into the blends and the soft edge -------------------------------
  // Every remaining pixel takes the label of whichever LABELLED NEIGHBOUR it is
  // closest to in colour. Comparing against the neighbour's ACTUAL COLOUR, not
  // against an abstract swatch, is what puts the split on a two-pixel
  // anti-aliased border where the eye puts it: a pixel seven tenths of the way
  // from the white field to the navy is nearer the navy, so it joins the navy.
  const queue: number[] = [];
  for (let p = 0; p < N; p++) if (lab[p]) queue.push(p);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    const x = p % W;
    const y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q < 0 || lab[q] || !needsLabel(q)) continue;
      const qx = q % W;
      const qy = (q / W) | 0;
      let best: Material = lab[p] as Material;
      let bestD = Infinity;
      for (const n of [qx > 0 ? q - 1 : -1, qx < W - 1 ? q + 1 : -1, qy > 0 ? q - W : -1, qy < H - 1 ? q + W : -1]) {
        if (n < 0 || !lab[n]) continue;
        const d = dist2(q, n);
        if (d < bestD) { bestD = d; best = lab[n] as Material; }
      }
      lab[q] = best;
      queue.push(q);
    }
  }

  // ---- Anything the flood could not reach -----------------------------------
  // Art can carry marks that are not connected to the figure at all — the
  // gallop sheet has speed lines trailing the jockey, detached strokes in open
  // background. If the ID sheet does not cover one, no label is adjacent to it
  // and the flood never arrives. `fixed` is the honest answer: it means leave
  // this alone, which is exactly what an unlabelled pixel does anyway, except
  // now it says so instead of being an accident.
  for (let p = 0; p < N; p++) if (!lab[p] && needsLabel(p)) lab[p] = MATERIAL.fixed;

  // ---- Smooth, but only what was guessed ------------------------------------
  // GROWN PIXELS ONLY. A solid pixel's own colour decided its material, exactly
  // and unambiguously, and no vote among its neighbours can know better than
  // that. Letting the vote run over solid pixels too — which is what the sprite
  // baker does, because there every label is an inference — quietly eats
  // one-pixel detail: a bridle strap or an outline drawn a single pixel wide
  // has six or more neighbours of some other material BY CONSTRUCTION, so the
  // majority overrules it and the strap comes out coat-coloured. It cost this
  // badge 50 pixels, scattered exactly where the art was finest.
  //
  // The fringe grown in the pass above is a different matter: those labels came
  // from a neighbour rather than from the pixel, so a stray one is a real stray
  // and voting is the right way to settle it.
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const prev = Uint8Array.from(lab);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (!prev[p] || data[p * 4 + 3]! >= ALPHA_SOLID) continue;
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
  // Nothing outside the art keeps a label: an ID sheet can overhang by a pixel
  // where the editor rounded an edge outwards, and a mask that claims pixels
  // the art does not have is a lie about the art.
  if (artPath) for (let p = 0; p < N; p++) if (!needsLabel(p)) lab[p] = 0;

  const mask = new PNG({ width: W, height: H });
  const tally: Record<number, number> = {};
  for (let p = 0; p < N; p++) {
    const v = lab[p]!;
    tally[v] = (tally[v] ?? 0) + 1;
    // Material id in red, so the file is legible by eye in any image viewer.
    mask.data[p * 4] = v * 40;
    mask.data[p * 4 + 1] = 0;
    mask.data[p * 4 + 2] = 0;
    mask.data[p * 4 + 3] = v ? 255 : 0;
  }
  writeFileSync(resolve(outMask), PNG.sync.write(mask));

  const opaque = Object.entries(tally).reduce((a, [k, v]) => (+k ? a + v : a), 0);
  console.log(`${basename(src)}  ${W}x${H}  read against the material key`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    if (!+k) continue;
    console.log(`  ${MATERIAL_NAMES[+k]!.padEnd(7)} ${String(v).padStart(7)}  ${((100 * v) / opaque).toFixed(1)}%`);
  }
  console.log(`\nwrote ${outMask}`);
}

main();
