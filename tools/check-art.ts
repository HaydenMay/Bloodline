import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PNG } from 'pngjs';
import {
  CHROMA_KEY,
  HUE_HAIR,
  HUE_SILKS,
  KEY,
  L_BODY_MAX,
  L_BODY_MIN,
  L_POINTS_MAX,
  L_TRIM_MIN,
  MATERIAL,
  MATERIAL_NAMES,
  chromaOf,
  classifyByKey,
  paletteGpl,
  rgbToHex,
  rgbToHsl,
} from './material-key.js';

/**
 * Tell me whether this art can be masked, before I build anything on it.
 *
 * Masking is inference: it looks at a pixel and decides what material it is.
 * That inference is only as good as the art's colour separation, and when the
 * separation is bad NOTHING downstream can fix it — an earlier delivery had a
 * bay horse in red silks, and a bay coat IS a dark red, so coat and silks
 * occupied one hue band and no rule could tell them apart. The sheet had to be
 * regenerated. This tool exists so that verdict costs five seconds instead of
 * an afternoon.
 *
 * Run: npm run check-art -- src/assets/shield-badge.png
 *      npm run check-art -- src/assets/racer.png --mask src/assets/racer-mask.png
 *      npm run check-art -- --write-palette material-key.gpl
 *
 * What it reports, and why each part matters:
 *
 *   PALETTE   the flat colours the art is built from. A small number means the
 *             art can be masked by lookup and nothing else (see bake-flat.ts);
 *             a large number means it is a shaded render and needs the band
 *             rules, or a hand-written sidecar.
 *
 *   BANDS     every pixel classified by the material key, with the spread of
 *             lightness, chroma and hue inside each material. This is the table
 *             to compare against SPRITE_MASK.md §4 when art is replaced.
 *
 *   MARGINS   how close each material's pixels sit to the threshold that would
 *             flip them. THIS IS THE REAL VERDICT. Two materials can both be
 *             classified correctly today and still be one regeneration away
 *             from colliding, and a margin of two points is how that looks
 *             before it breaks.
 */

/** A pixel this close to a threshold is one resave away from flipping. */
const RISK_CHROMA = 6;
const RISK_L = 0.03;
const RISK_HUE = 8;

/** Ignore colours rarer than this when listing the palette. */
const PALETTE_MIN_SHARE = 0.004;

/** How many of the top colours have to cover the art before it counts as flat. */
const FLAT_TOP_N = 16;
const FLAT_COVERAGE = 0.9;

/**
 * Is this art painted in flat regions, or shaded?
 *
 * NOT by counting distinct colours, which is the obvious test and the wrong
 * one: `racer.png` is a photoreal render and still has only 201 of them,
 * because it was compressed. What separates them is how the art is DISTRIBUTED
 * across those colours. Flat art puts nearly everything on a handful of them —
 * the shield badge is 100% on five. A shaded render spreads itself down a ramp,
 * and its top sixteen colours cover barely a fifth of it.
 *
 * The distinction decides whether the key applies at all, so getting it wrong
 * means telling someone to hand-fix fifty thousand correct pixels.
 */
function isFlat(counts: Map<string, number>, total: number): { flat: boolean; coverage: number } {
  const top = [...counts.values()].sort((a, b) => b - a).slice(0, FLAT_TOP_N);
  const coverage = top.reduce((a, v) => a + v, 0) / (total || 1);
  return { flat: coverage >= FLAT_COVERAGE, coverage };
}

const pct = (n: number, of: number): string => `${((100 * n) / (of || 1)).toFixed(1)}%`;

const quantile = (sorted: number[], f: number): number =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]! : 0;

/** Shortest angular distance from `h` to either edge of a hue window. */
function hueMargin(h: number, [lo, hi]: [number, number]): number {
  const t = ((h % 360) + 360) % 360;
  const gap = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
  };
  return Math.min(gap(t, lo), gap(t, hi));
}

interface Sample {
  material: number;
  l: number;
  chroma: number;
  hue: number;
  /** Distance to the nearest decision that would relabel this pixel. */
  margin: number;
  /** Which threshold that is, for the report. */
  edge: string;
}

/**
 * How far this pixel is from being classified as something else.
 *
 * Expressed in "risk units": 1.0 means it is exactly at the threshold's risk
 * distance, above 1.0 means comfortable. Normalising lets lightness, chroma and
 * hue margins be compared and mixed in one column.
 */
function measure(r: number, g: number, b: number): Sample {
  const chroma = chromaOf(r, g, b);
  const [hue, , l] = rgbToHsl(r, g, b);
  const material = classifyByKey(r, g, b);

  // Every pixel is first sorted onto an axis by chroma, so that is always a
  // candidate for the nearest threshold.
  let margin = Math.abs(chroma - CHROMA_KEY) / RISK_CHROMA;
  let edge = 'chroma/axis';

  const consider = (d: number, unit: number, name: string): void => {
    const m = d / unit;
    if (m < margin) {
      margin = m;
      edge = name;
    }
  };

  if (chroma >= CHROMA_KEY) {
    const window = material === MATERIAL.silks ? HUE_SILKS
      : material === MATERIAL.hair ? HUE_HAIR
        : null;
    if (window) consider(hueMargin(hue, window), RISK_HUE, 'hue window');
    else {
      // Falls through to `fixed`: the risk is drifting INTO a window.
      consider(Math.min(hueMargin(hue, HUE_SILKS), hueMargin(hue, HUE_HAIR)), RISK_HUE, 'hue window');
    }
  } else {
    const edges: [number, string][] = [
      [Math.abs(l - L_POINTS_MAX), 'L points/body'],
      [Math.abs(l - L_BODY_MIN), 'L points/body'],
      [Math.abs(l - L_BODY_MAX), 'L body/trim'],
      [Math.abs(l - L_TRIM_MIN), 'L body/trim'],
    ];
    for (const [d, name] of edges) consider(d, RISK_L, name);
  }

  return { material, l, chroma, hue, margin, edge };
}

function reportPalette(counts: Map<string, number>, total: number): void {
  const flats = [...counts].sort((a, b) => b[1] - a[1]).filter(([, n]) => n / total >= PALETTE_MIN_SHARE);
  const { flat, coverage } = isFlat(counts, total);
  console.log(`\nPALETTE  ${counts.size} distinct colours in ${total} opaque pixels`);
  console.log(`  top ${FLAT_TOP_N} cover ${(100 * coverage).toFixed(1)}% of the art`);
  if (flat) {
    console.log('  Flat art — this can be masked by colour lookup alone (tools/bake-flat.ts).');
  } else {
    console.log('  Shaded art — the key does not apply to it directly; masking needs');
    console.log('  the measured band rules and the geometry in tools/bake-sprites.ts.');
  }
  console.log('\n  colour     share   hue  chroma     L  reads as');
  for (const [hex, n] of flats.slice(0, 16)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const { material, hue, chroma, l } = measure(r, g, b);
    console.log(
      `  ${hex}  ${pct(n, total).padStart(6)}  ${chroma < CHROMA_KEY ? '   —' : hue.toFixed(0).padStart(4)}` +
      `  ${String(chroma).padStart(6)}  ${l.toFixed(2)}  ${MATERIAL_NAMES[material]}`,
    );
  }
  const shown = flats.slice(0, 16).reduce((a, [, n]) => a + n, 0);
  console.log(`  (${pct(shown, total)} of the art; the rest is anti-aliasing)`);
}

function reportBands(samples: Sample[]): void {
  console.log('\nBANDS  every pixel classified by the material key');
  console.log('\n  material   pixels   share      L p5/50/95      chroma p5/50/95   hue p5/50/95');
  for (let m = 1; m <= 6; m++) {
    const s = samples.filter((x) => x.material === m);
    if (!s.length) continue;
    const ls = s.map((x) => x.l).sort((a, b) => a - b);
    const cs = s.map((x) => x.chroma).sort((a, b) => a - b);
    const hs = s.map((x) => x.hue).sort((a, b) => a - b);
    const q3 = (arr: number[], dp: number): string =>
      [0.05, 0.5, 0.95].map((f) => quantile(arr, f).toFixed(dp)).join('/');
    console.log(
      `  ${MATERIAL_NAMES[m]!.padEnd(8)} ${String(s.length).padStart(8)}  ${pct(s.length, samples.length).padStart(6)}` +
      `  ${q3(ls, 2).padStart(14)}   ${q3(cs, 0).padStart(15)}   ${cs[Math.floor(cs.length / 2)]! < CHROMA_KEY ? '—' : q3(hs, 0)}`,
    );
  }
}

function reportMargins(samples: Sample[]): number {
  console.log('\nMARGINS  how close each material sits to flipping');
  console.log('\n  material   at risk   share    worst edge');
  let worst = Infinity;
  for (let m = 1; m <= 6; m++) {
    const s = samples.filter((x) => x.material === m);
    if (!s.length) continue;
    const risky = s.filter((x) => x.margin < 1);
    const min = s.reduce((a, x) => Math.min(a, x.margin), Infinity);
    const edge = s.reduce((a, x) => (x.margin < a.margin ? x : a), s[0]!).edge;
    if (m !== MATERIAL.fixed) worst = Math.min(worst, risky.length / s.length);
    console.log(
      `  ${MATERIAL_NAMES[m]!.padEnd(8)} ${String(risky.length).padStart(8)}  ${pct(risky.length, s.length).padStart(6)}` +
      `    ${edge} (closest ${min.toFixed(2)} risk units)`,
    );
  }
  console.log(
    `\n  A risk unit is ${RISK_CHROMA} of chroma, ${RISK_L} of lightness or ${RISK_HUE}° of hue.` +
    '\n  Pixels at risk are almost all anti-aliasing between two materials, which is' +
    '\n  expected and harmless. A whole material sitting at risk is not.',
  );
  return worst;
}

function reportVerdict(samples: Sample[]): void {
  console.log('\nVERDICT');
  const present = new Set(samples.map((s) => s.material));
  const share = (m: number): number => samples.filter((s) => s.material === m).length / samples.length;

  let problems = 0;
  const say = (ok: boolean, msg: string): void => {
    console.log(`  ${ok ? 'ok  ' : 'WARN'}  ${msg}`);
    if (!ok) problems++;
  };

  for (const m of [MATERIAL.body, MATERIAL.hair, MATERIAL.points, MATERIAL.silks, MATERIAL.trim]) {
    if (!present.has(m)) {
      console.log(`  --    no ${MATERIAL_NAMES[m]} in this asset (fine if it has none)`);
      continue;
    }
    const s = samples.filter((x) => x.material === m);
    const risky = s.filter((x) => x.margin < 1).length / s.length;
    say(risky < 0.25, `${MATERIAL_NAMES[m]} — ${pct(risky * s.length, s.length)} of it sits near a threshold`);
  }

  const fixedShare = share(MATERIAL.fixed);
  say(fixedShare < 0.35, `fixed is ${pct(fixedShare * samples.length, samples.length)} of the art`);

  // The most common real mistake: a material painted a colour that lands in no
  // hue window, so it silently falls through to `fixed` and never gets tinted.
  // Skin and leather land there legitimately, but they are a wide, muddy spread
  // of hues — a deliberate flat fill is a tight, saturated cluster. Say which
  // window it is nearest and how far it has to move, because that is the fix.
  const off = samples.filter((s) => s.material === MATERIAL.fixed && s.chroma >= CHROMA_KEY);
  if (off.length / samples.length >= 0.02) {
    const hues = off.map((s) => s.hue).sort((a, b) => a - b);
    const spread = quantile(hues, 0.95) - quantile(hues, 0.05);
    const mid = quantile(hues, 0.5);
    if (spread < 30) {
      const toSilks = hueMargin(mid, HUE_SILKS);
      const toHair = hueMargin(mid, HUE_HAIR);
      const near = toSilks < toHair ? 'silks' : 'hair';
      say(
        false,
        `${pct(off.length, samples.length)} of the art is a saturated flat at hue ~${mid.toFixed(0)}` +
        ` that matches no window, so it will never be tinted.` +
        `\n        If that is the ${near}, repaint it toward ${KEY[near]!.hex}` +
        ` (${Math.min(toSilks, toHair).toFixed(0)}° away), or declare it in a sidecar.`,
      );
    }
  }

  if (!problems) {
    console.log('\n  This art can be masked as-is.');
  } else {
    console.log(
      `\n  ${problems} thing(s) to look at. Anything reading as \`fixed\` that should be` +
      '\n  tinted needs repainting to the key, or a sidecar — see SPRITE_MASK.md §11.',
    );
  }
}

function reportMask(artPng: PNG, maskPath: string, flat: boolean): void {
  const mask = PNG.sync.read(readFileSync(resolve(maskPath)));
  console.log(`\nMASK  ${basename(maskPath)}`);
  if (mask.width !== artPng.width || mask.height !== artPng.height) {
    console.log(`  WARN  ${mask.width}x${mask.height} does not match the art's ${artPng.width}x${artPng.height}`);
    return;
  }
  let covered = 0, uncovered = 0, unseen = 0, stray = 0, partial = 0;
  const tally: Record<number, number> = {};
  // Where a solid pixel's own colour says one material and the mask says
  // another. On art that follows the key this should be exactly zero: the
  // colour IS the answer, so any disagreement is the baker overruling it.
  const disagree = new Map<string, number>();
  for (let p = 0; p < artPng.width * artPng.height; p++) {
    const a = mask.data[p * 4 + 3]!;
    if (a > 0 && a < 255) partial++;
    const artAlpha = artPng.data[p * 4 + 3]!;
    const art = artAlpha > 0;
    const m = a > 0;
    if (art && m) covered++;
    // Art fades out to isolated alpha-1 dust that no flood can reach and no
    // screen can show. Counting that as a hole would cry wolf on every asset,
    // so only pixels a viewer could actually see are reported as missing.
    else if (art) { if (artAlpha >= 8) uncovered++; else unseen++; }
    else if (m) stray++;
    if (m) {
      const id = Math.round(mask.data[p * 4]! / 40);
      tally[id] = (tally[id] ?? 0) + 1;
      if (artAlpha >= 200) {
        const want = classifyByKey(artPng.data[p * 4]!, artPng.data[p * 4 + 1]!, artPng.data[p * 4 + 2]!);
        if (want !== id) {
          const k = `${rgbToHex(artPng.data[p * 4]!, artPng.data[p * 4 + 1]!, artPng.data[p * 4 + 2]!)}` +
            ` is ${MATERIAL_NAMES[want]}, masked as ${MATERIAL_NAMES[id]}`;
          disagree.set(k, (disagree.get(k) ?? 0) + 1);
        }
      }
    }
  }
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${MATERIAL_NAMES[+k]!.padEnd(8)} ${String(v).padStart(8)}  ${pct(v, covered)}`);
  }
  console.log(
    `  covered ${covered}   uncovered ${uncovered}   invisible dust ${unseen}` +
    `   outside the art ${stray}   partial alpha ${partial}`,
  );
  if (uncovered > covered * 0.005) console.log('  WARN  visible art has no material — the soft edge was probably not grown into');
  if (stray) console.log('  WARN  the mask claims pixels the art does not have');
  if (partial) console.log('  WARN  partial alpha in a mask decodes to the wrong id after un-premultiplying');

  // The invariant that matters most on FLAT art, and the one that fails
  // silently there: a mask that disagrees with its own art is a pixel the baker
  // decided it knew better about, and it shows up in game as a fleck of the
  // wrong colour in the middle of a flat region.
  //
  // On SHADED art the same measurement means the opposite. `racer.png` paints
  // its mane, tail and cannons in one identical black, so the key physically
  // cannot separate them and `bake-sprites` separates them by geometry instead.
  // Every pixel of mane it recovers is a deliberate disagreement with colour.
  // Reporting those as errors would send someone to hand-fix fifty thousand
  // correct pixels, so this is a count, not a warning, unless the art is flat.
  const off = [...disagree].sort((a, b) => b[1] - a[1]);
  const n = off.reduce((a, [, v]) => a + v, 0);
  if (!n) {
    console.log('  ok    every solid pixel is masked as its own colour says');
    return;
  }
  if (!flat) {
    console.log(
      `  info  ${n} solid pixels (${pct(n, covered)}) are masked as something their colour` +
      '\n        does not say. On shaded art that is the point — the geometry in' +
      '\n        bake-sprites.ts recovering what colour alone cannot. Judge it by eye.',
    );
    return;
  }
  console.log(`\n  WARN  ${n} solid pixels are masked as something their colour does not say:`);
  for (const [k, v] of off.slice(0, 8)) console.log(`          ${String(v).padStart(4)}  ${k}`);
  console.log(
    '        On flat art this should be zero. It usually means a smoothing pass' +
    '\n        overruled one-pixel detail — a strap or an outline drawn a single' +
    '\n        pixel wide is outvoted by its neighbours by construction.',
  );
}

function main(): void {
  const args = process.argv.slice(2);

  const paletteAt = args.indexOf('--write-palette');
  if (paletteAt >= 0) {
    const out = args[paletteAt + 1] ?? 'material-key.gpl';
    writeFileSync(resolve(out), paletteGpl());
    console.log(`wrote ${out}`);
    for (const [name, { hex, note }] of Object.entries(KEY)) {
      console.log(`  ${name.padEnd(7)} ${hex}  ${note}`);
    }
    if (args.length === 2) return;
  }

  // Skip the values that belong to a flag, not just the flags themselves.
  const taken = new Set<number>();
  args.forEach((a, i) => {
    if (a === '--mask' || a === '--write-palette') taken.add(i).add(i + 1);
  });
  const src = args.find((a, i) => !taken.has(i) && !a.startsWith('--'));
  if (!src) {
    console.error('usage: check-art <asset.png> [--mask <mask.png>] [--write-palette <out.gpl>]');
    process.exitCode = 1;
    return;
  }

  const png = PNG.sync.read(readFileSync(resolve(src)));
  const { width: W, height: H, data } = png;

  const counts = new Map<string, number>();
  const samples: Sample[] = [];
  for (let p = 0; p < W * H; p++) {
    // Anti-aliased edge pixels are a blend of the art and nothing, so their
    // colour says nothing about their material. Judge the art on solid pixels.
    if (data[p * 4 + 3]! < 200) continue;
    const r = data[p * 4]!, g = data[p * 4 + 1]!, b = data[p * 4 + 2]!;
    const hex = rgbToHex(r, g, b);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
    samples.push(measure(r, g, b));
  }

  console.log(`${basename(src)}  ${W}x${H}  ${samples.length} solid pixels`);
  reportPalette(counts, samples.length);
  reportBands(samples);
  reportMargins(samples);
  reportVerdict(samples);

  const maskAt = args.indexOf('--mask');
  if (maskAt >= 0 && args[maskAt + 1]) reportMask(png, args[maskAt + 1]!, isFlat(counts, samples.length).flat);
}

main();
