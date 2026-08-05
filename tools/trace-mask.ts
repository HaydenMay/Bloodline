import { MATERIAL_NAMES } from './material-key.js';

/**
 * Trace a material mask into editable vector paths — one layer per material.
 *
 * The PNG is what the game loads; the SVG is the file a human opens when a
 * region is wrong. Rasterising it back at the mask's own size reproduces the
 * PNG exactly, which is what makes hand-editing a region a safe thing to do;
 * `npm run check-art` asserts that round-trip.
 */

/** Fill colour each material is drawn with in the SVG, matching the PNG's red. */
const SVG_FILL = ['none', '#280000', '#500000', '#780000', '#a00000', '#c80000', '#f00000'];

/**
 * Trace the labelled pixels into one editable vector layer per material.
 *
 * Every boundary is walked as a closed loop on the pixel grid, so the paths ARE
 * the mask rather than an approximation of it.
 */
export function traceSvg(lab: Uint8Array, W: number, H: number, source: string): string {
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- Generated from ${source}. Edit a region here, rasterise at ${W}x${H} with nearest-neighbour, and it is the mask. -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`,
  ];
  for (let m = 1; m <= 6; m++) {
    const d = traceMaterial(lab, W, H, m);
    if (!d) continue;
    parts.push(`<g id="${MATERIAL_NAMES[m]}" fill="${SVG_FILL[m]}" fill-rule="evenodd"><path d="${d}"/></g>`);
  }
  parts.push('</svg>');
  return `${parts.join('\n')}\n`;
}

/** Travel directions, as [dx, dy], indexed by the four constants below. */
const STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
/** Turning left and right on that ring, with y pointing down the screen. */
const turn = (d: number, by: number): number => (d + by + 4) % 4;

/**
 * Walk every closed boundary of one material as a path.
 *
 * Crack following on the corner lattice: vertices are the corners BETWEEN
 * pixels, and a crack is on the boundary when the material is on exactly one
 * side of it. Walk every crack with the material kept on the left and each
 * contour closes on itself — outer edges anticlockwise, holes clockwise — so
 * `fill-rule="evenodd"` punches the holes out for free. Which side is "left"
 * with y pointing down is the whole trick, so it is spelled out per direction:
 *
 *     up     needs the material west of the crack and open air east
 *     down   needs it east and open air west
 *     left   needs it south and open air north
 *     right  needs it north and open air south
 *
 * At a corner where two diagonal pixels are in and the other two out, both a
 * left and a right turn satisfy that; going back the way we came is always
 * excluded, and where both remain we turn left, which reads the diagonal as
 * two touching regions rather than one pinched one. Either is a correct fill;
 * being consistent is what guarantees the walk terminates.
 */
function traceMaterial(lab: Uint8Array, W: number, H: number, m: number): string {
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === m;

  // Vertical crack (x,y) is left of pixel (x,y); horizontal crack (x,y) is above it.
  const vSeen = new Uint8Array((W + 1) * (H + 1));
  const hSeen = new Uint8Array((W + 1) * (H + 1));
  const out: string[] = [];

  /** Can the walk leave corner (x,y) in direction `d` with the material on its left? */
  const canGo = (x: number, y: number, d: number): boolean => {
    const nw = inside(x - 1, y - 1);
    const ne = inside(x, y - 1);
    const sw = inside(x - 1, y);
    const se = inside(x, y);
    if (d === UP) return nw && !ne;
    if (d === DOWN) return se && !sw;
    if (d === LEFT) return sw && !nw;
    if (d === RIGHT) return ne && !se;
    return false;
  };

  const markCrack = (x: number, y: number, d: number): void => {
    if (d === UP) vSeen[(y - 1) * (W + 1) + x] = 1;
    else if (d === DOWN) vSeen[y * (W + 1) + x] = 1;
    else if (d === LEFT) hSeen[y * (W + 1) + x - 1] = 1;
    else hSeen[y * (W + 1) + x] = 1;
  };

  const crackSeen = (x: number, y: number, d: number): boolean =>
    (d === UP ? vSeen[(y - 1) * (W + 1) + x]
      : d === DOWN ? vSeen[y * (W + 1) + x]
        : d === LEFT ? hSeen[y * (W + 1) + x - 1]
          : hSeen[y * (W + 1) + x]) === 1;

  for (let y = 0; y <= H; y++) {
    for (let x = 0; x <= W; x++) {
      for (const d0 of [DOWN, UP]) {
        if (!canGo(x, y, d0) || crackSeen(x, y, d0)) continue;

        const pts: number[] = [];
        let cx = x;
        let cy = y;
        let d = d0;
        do {
          pts.push(cx, cy);
          markCrack(cx, cy, d);
          cx += STEP[d]![0];
          cy += STEP[d]![1];
          // Straight on, then left, then right — left before right settles the
          // diagonal; the reverse is never offered because a crack the walk
          // just used has the material on the other side going back.
          const back = turn(d, 2);
          let next = -1;
          for (const cand of [d, turn(d, -1), turn(d, 1)]) {
            if (cand !== back && canGo(cx, cy, cand)) { next = cand; break; }
          }
          if (next < 0) break;
          d = next;
        } while (cx !== x || cy !== y || d !== d0);

        // Drop the collinear middles — a straight run of 40 pixels is two points.
        const n = pts.length / 2;
        if (n < 4) continue;
        const keep: string[] = [];
        for (let i = 0; i < n; i++) {
          const ax = pts[((i - 1 + n) % n) * 2]!, ay = pts[((i - 1 + n) % n) * 2 + 1]!;
          const bx = pts[i * 2]!, by = pts[i * 2 + 1]!;
          const cxp = pts[((i + 1) % n) * 2]!, cyp = pts[((i + 1) % n) * 2 + 1]!;
          if ((bx - ax) * (cyp - by) !== (by - ay) * (cxp - bx)) keep.push(`${bx} ${by}`);
        }
        if (keep.length >= 3) out.push(`M${keep.join('L')}Z`);
      }
    }
  }
  return out.join('');
}
