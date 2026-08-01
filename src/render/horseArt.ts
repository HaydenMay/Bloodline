/**
 * The horse artwork, as layers.
 *
 * Every shape here is SVG path data in the rig's local space, one export per
 * layer named in ART_BRIEF.md. The rig (horse.ts) owns movement; this file owns
 * nothing but form. The split exists so that commissioned art can replace the
 * drawing without touching a line of animation code — an artist delivers an SVG
 * with these layer names, and the conversion is copying `d` attributes into the
 * constants below.
 *
 * CONVENTIONS, and they are not negotiable if the rig is to keep working:
 *
 *   - Facing RIGHT. +x is forward, toward the nose.
 *   - y is NEGATIVE UPWARDS, matching canvas. Ground is y = 0 in rig space.
 *   - Each part is drawn around its OWN PIVOT at (0,0), not in a shared frame.
 *     The rig translates and rotates each part into place, so a shape authored
 *     off-pivot rotates around the wrong point and swings like a broken gate.
 *   - Flat shapes only. No shading, no outlines, no gradients. The rig derives
 *     every tone from the coat colour, because coats are bred rather than
 *     chosen and there could be hundreds of them.
 *
 * Proportions are ratios of H, height at the withers, per ART_BRIEF.md.
 */

/** Height at the withers, in rig units. Every other measurement derives from it. */
export const H = 54;

/**
 * The barrel, from point of shoulder to point of buttock, with the shoulder and
 * haunch masses included — the legs tuck under these rather than being pinned
 * to a smooth tube.
 *
 * The three things that make this read as a thoroughbred rather than a pony,
 * all of which the previous silhouette was missing:
 *
 *   1. A distinct WITHER at the base of the neck, the high point of the topline.
 *   2. A CROUP that rises again over the quarters, so the back is two curves
 *      with a dip between rather than one flat arc.
 *   3. A real TUCK-UP: the belly is deepest at the girth, just behind the elbow,
 *      and climbs steeply through the flank. Previously it varied by a couple of
 *      units across the whole length, which is a barrel, not a racehorse.
 *
 * Origin is the centre of the barrel.
 */
export const BODY = `
  M 27,-2
  C 25,-9 20,-15 12,-16
  C 4,-15 -4,-13 -11,-14
  C -16,-15 -20,-17 -24,-13
  C -28,-9 -30,-5 -30,0
  C -30,5 -27,10 -22,11
  C -16,12 -12,8 -7,6
  C 0,8 8,10 14,11
  C 20,11 25,8 26,4
  C 27,2 27,0 27,-2
  Z
`;

/**
 * Neck and head as one silhouette, including the jowl. Pivot at the base of the
 * neck, where it meets the withers.
 *
 * The jowl and the throat notch behind it are the whole game here. A horse's
 * head is legible because the round cheek ends in a sharp concave cut where the
 * throat begins; without that notch the head is just the end of the neck, which
 * is exactly how the old cone-shaped version failed.
 *
 * Neck ~0.40 H, head ~0.28 H, and the neck tapers hard from a deep base to a
 * fine throat.
 */
export const NECK_HEAD = `
  M 0,-8
  C 7,-12 15,-14 21,-15
  C 25,-16 29,-14 32,-11
  C 35,-9 36,-7 35,-5
  C 34,-2 32,-1 30,-2
  C 28,-3 26,-4 24,-5
  C 22,-5 21,-4 20,-3
  C 16,-2 7,3 0,10
  Z
`;

/** Single ear, pivot at the poll. ~0.15 H, which is far smaller than it feels. */
export const EAR = `
  M 0,0
  C -1,-3 0,-6 2,-8
  C 4,-6 4,-2 3,0
  Z
`;

/** Mane along the crest. Pivot shared with the neck, so it swings with it. */
export const MANE = `
  M -1,-7
  C 6,-11 14,-13 21,-15
  C 18,-11 11,-7 4,-4
  C 1,-3 -1,-4 -1,-7
  Z
`;

/**
 * Tail from the dock, streaming back. Pivot at the dock, so the rig can swing
 * the whole thing rather than animating the tip on its own.
 */
export const TAIL = `
  M 0,-5
  C -9,-8 -20,-7 -29,-2
  C -35,1 -40,6 -43,12
  C -39,7 -34,3 -27,1
  C -18,-1 -8,1 0,4
  Z
`;

/**
 * Leg geometry. The legs are the one thing that cannot be a fixed path, because
 * IK deforms them every frame — so what the art layer contributes is the taper,
 * as widths at each landmark.
 *
 * A hind leg is noticeably heavier than a fore leg through the gaskin, and both
 * narrow to a fine cannon. Values are half-widths in rig units.
 */
export const LEG = {
  fore: { top: 5.4, mid: 3.6, knee: 1.9, fetlock: 1.2 },
  hind: { top: 7.2, mid: 4.6, knee: 2.1, fetlock: 1.3 },
} as const;

/** Hoof half-width and depth, reused for all four. */
export const HOOF = { w: 2.1, h: 1.7 } as const;

const cache = new Map<string, Path2D>();

/** Path2D from path data, built once. Canvas parses SVG `d` strings directly. */
export function path(d: string): Path2D {
  let p = cache.get(d);
  if (!p) {
    p = new Path2D(d);
    cache.set(d, p);
  }
  return p;
}
