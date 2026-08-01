import { coatFor, dark, lite, type Silks } from './palette.js';

/**
 * The horse rig.
 *
 * Layered parts on a skeleton, not fixed animation frames (DESIGN.md §12).
 * Gaits are procedural, so transitions are smooth, every coat gene tints
 * cleanly, and a cosmetic added later is one more layer rather than a re-draw
 * of every frame.
 *
 * SHADING. Every shape is a gradient fill plus a thin outline in a DARKENED
 * TONE OF ITS OWN FILL COLOUR — never black, never a flat fill. That one rule
 * is the difference between shapes that read as an animal and shapes that read
 * as coloured blobs, and it costs nothing. Tones are derived from a single base
 * colour so any coat genetics produces later will shade correctly.
 *
 * Drawn in a local space 100 units long, ground at y = 0, facing right.
 */

const GROUND = 0;

/**
 * PROPORTIONS, measured off photographs of galloping thoroughbreds rather than
 * guessed. Checking the previous rig against reference, it was 35% too short in
 * the body and nearly twice as deep through the barrel — a stocky pony, which
 * is why it never read as a racehorse however it was shaded.
 *
 * Against height at the withers (H), a thoroughbred is roughly:
 *   body length, point of shoulder to point of buttock   ~1.0 H
 *   barrel depth                                         ~0.33 H
 *   ground to elbow                                      ~0.55 H
 *   neck                                                 ~0.40 H
 *   head                                                 ~0.28 H
 */
const BODY_Y = -40; // barrel centre
const BARREL_HALF = 11; // ~0.33 H total depth
const SHOULDER_X = 25;
const HIP_X = -26; // body length ~51, against a withers height of ~51
const UPPER = 17;
const LOWER = 20;

export interface HorsePose {
  /** 0-1 through the stride cycle. */
  phase: number;
  /** 0-1, blends between a relaxed canter and a flat-out gallop. */
  intensity: number;
  /** Forward lean while being asked for effort. */
  drive: number;
}

/**
 * Transverse gallop footfalls — near hind, far hind, far fore, near fore —
 * which is what gives the gait its rocking rather than looking like a
 * pantomime horse.
 */
const LEG_OFFSET = {
  nearHind: 0,
  farHind: 0.12,
  farFore: 0.55,
  nearFore: 0.67,
} as const;

function footPath(phase: number, intensity: number, reach: number): { x: number; y: number } {
  const p = phase % 1;
  const stance = 0.42;

  if (p < stance) {
    const t = p / stance;
    return { x: reach * (1 - 2 * t), y: GROUND };
  }

  const t = (p - stance) / (1 - stance);
  const lift = Math.sin(t * Math.PI) * (12 + 20 * intensity);
  // Ease the horizontal travel so the hoof folds in tight under the belly at
  // mid-swing before reaching out again, instead of sweeping a flat arc.
  const eased = t * t * (3 - 2 * t);
  const tuck = Math.sin(t * Math.PI) * reach * 0.28;
  return { x: -reach + 2 * reach * eased + tuck, y: GROUND - lift };
}

/**
 * Two-bone IK, with the joint side chosen in WORLD SPACE.
 *
 * `bend` is which way the joint points on the track, not which side of the
 * hip-to-foot line it sits: -1 keeps the joint rearward (a hock, which always
 * points backwards), +1 keeps it forward (a knee).
 *
 * Choosing relative to the leg vector — as this did — flips the joint the
 * moment the foot swings past the hip and the vector reverses. That is why the
 * hocks snapped backwards every time a hind leg reset.
 */
function solveKnee(
  hipX: number,
  hipY: number,
  footX: number,
  footY: number,
  bend: 1 | -1,
): { x: number; y: number } {
  const dx = footX - hipX;
  const dy = footY - hipY;
  const d = Math.max(0.001, Math.min(Math.hypot(dx, dy), UPPER + LOWER - 0.001));
  const a = (UPPER * UPPER - LOWER * LOWER + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  const mx = hipX + (dx * a) / d;
  const my = hipY + (dy * a) / d;

  // Both valid solutions, then pick by where the joint ends up on the track.
  const ax = mx + (h * dy) / d;
  const ay = my - (h * dx) / d;
  const bx = mx - (h * dy) / d;
  const by = my + (h * dx) / d;

  const rearward = ax < bx ? { x: ax, y: ay } : { x: bx, y: by };
  const forward = ax < bx ? { x: bx, y: by } : { x: ax, y: ay };
  return bend === -1 ? rearward : forward;
}

/** Gradient fill plus a thin outline in a darker tone of the same colour. */
function shade(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bounds: [number, number, number, number],
  base: string,
  outline = 1,
): void {
  const [x0, y0, x1, y1] = bounds;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, lite(base, 0.26));
  g.addColorStop(0.48, base);
  g.addColorStop(1, dark(base, 0.24));

  ctx.fillStyle = g;
  ctx.fill(path);

  if (outline > 0) {
    ctx.strokeStyle = dark(base, 0.45);
    ctx.lineWidth = 1.6 * outline;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }
}

/** Unit perpendicular to a segment. */
function perp(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: -dy / len, y: dx / len };
}

/**
 * One leg as a single TAPERED SILHOUETTE with one outline.
 *
 * Previously this was two stroked lines with round caps, which left a visible
 * circle at the knee and a dark band where the outline stroke showed past the
 * thinner cannon. A real leg narrows from a heavy gaskin to a fine cannon bone,
 * so it has to be a filled shape that tapers — and like the body, only the
 * outer edge is ever stroked.
 */
function drawLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  phase: number,
  intensity: number,
  reach: number,
  bend: 1 | -1,
  colour: string,
  point: string,
  width: number,
): void {
  const foot = footPath(phase, intensity, reach);
  const footX = hipX + foot.x;
  const footY = foot.y;
  const knee = solveKnee(hipX, hipY, footX, footY, bend);

  const wHip = width * 1.05;
  const wKnee = width * 0.32;
  const wFoot = width * 0.19;

  const pUpper = perp(hipX, hipY, knee.x, knee.y);
  const pLower = perp(knee.x, knee.y, footX, footY);
  // Average the two at the knee so the joint bends instead of notching.
  const pKnee = {
    x: (pUpper.x + pLower.x) / 2,
    y: (pUpper.y + pLower.y) / 2,
  };
  const kLen = Math.max(0.001, Math.hypot(pKnee.x, pKnee.y));
  pKnee.x /= kLen;
  pKnee.y /= kLen;

  // Mid-thigh, so the taper curves like muscle instead of coning like a spike.
  const midX = (hipX + knee.x) / 2;
  const midY = (hipY + knee.y) / 2;
  const wMid = width * 0.66;

  const leg = new Path2D();
  leg.moveTo(hipX + pUpper.x * wHip, hipY + pUpper.y * wHip);
  leg.quadraticCurveTo(
    midX + pUpper.x * wMid * 1.15,
    midY + pUpper.y * wMid * 1.15,
    knee.x + pKnee.x * wKnee,
    knee.y + pKnee.y * wKnee,
  );
  leg.lineTo(footX + pLower.x * wFoot, footY + pLower.y * wFoot);
  leg.lineTo(footX - pLower.x * wFoot, footY - pLower.y * wFoot);
  leg.lineTo(knee.x - pKnee.x * wKnee, knee.y - pKnee.y * wKnee);
  leg.quadraticCurveTo(
    midX - pUpper.x * wMid * 0.75,
    midY - pUpper.y * wMid * 0.75,
    hipX - pUpper.x * wHip,
    hipY - pUpper.y * wHip,
  );
  leg.closePath();

  shade(ctx, leg, [hipX - wHip, hipY, footX + wFoot, footY], colour, 0.75);

  // The dark "points" run up the cannon — painted INSIDE the leg silhouette,
  // never as its own outlined shape.
  ctx.save();
  ctx.clip(leg);
  ctx.fillStyle = point;
  ctx.beginPath();
  ctx.moveTo(knee.x + pKnee.x * wKnee * 1.6, knee.y + pKnee.y * wKnee * 1.6);
  ctx.lineTo(footX + pLower.x * wFoot * 2.4, footY + pLower.y * wFoot * 2.4);
  ctx.lineTo(footX - pLower.x * wFoot * 2.4, footY - pLower.y * wFoot * 2.4);
  ctx.lineTo(knee.x - pKnee.x * wKnee * 1.6, knee.y - pKnee.y * wKnee * 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Hoof.
  const hoof = new Path2D();
  hoof.ellipse(footX, footY - 1, width * 0.32, width * 0.26, 0, 0, Math.PI * 2);
  shade(ctx, hoof, [footX - 4, footY - 4, footX + 4, footY + 2], dark(point, 0.25), 0.6);
}

export interface DrawHorseOptions {
  coat: string;
  silks: Silks;
  pose: HorsePose;
  scale: number;
  faded?: boolean;
}

export function drawHorse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: DrawHorseOptions,
): void {
  const coat = coatFor(opts.coat);
  const { phase, intensity, drive } = opts.pose;
  const body = coat.body;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(opts.scale, opts.scale);
  if (opts.faded) ctx.globalAlpha = 0.5;

  const bob = Math.sin(phase * Math.PI * 2) * (1.4 + 2 * intensity);
  const suspension = Math.max(0, Math.sin(phase * Math.PI * 2 - 0.9)) * 4 * intensity;
  ctx.translate(0, -suspension + bob);
  ctx.rotate(-0.05 * drive);

  const reach = 22 + 20 * intensity;
  const shoulderY = BODY_Y + BARREL_HALF * 0.1;
  const hipY = BODY_Y - BARREL_HALF * 0.2;

  // ---- Far legs, pushed back in tone so the near side reads forward -------
  const far = dark(body, 0.3);
  const farPoint = dark(coat.points, 0.25);
  drawLeg(ctx, HIP_X - 2, hipY, phase + LEG_OFFSET.farHind, intensity, reach, -1, far, farPoint, 6);
  drawLeg(ctx, SHOULDER_X - 4, shoulderY, phase + LEG_OFFSET.farFore, intensity, reach, 1, far, farPoint, 5.4);

  // ---- Tail ---------------------------------------------------------------
  const swing = Math.sin(phase * Math.PI * 2 + 1.2) * 3.5;
  const dockX = HIP_X - 4;
  const dockY = BODY_Y - BARREL_HALF * 1.1;
  const tipX = HIP_X - 44;
  const tipY = BODY_Y - 6 + swing * 2;

  const tail = new Path2D();
  tail.moveTo(dockX, dockY - 2);
  tail.bezierCurveTo(dockX - 14, dockY - 4 + swing, tipX + 12, tipY - 7, tipX, tipY - 2);
  tail.bezierCurveTo(tipX + 10, tipY + 1, dockX - 12, dockY + 7 + swing, dockX, dockY + 5);
  tail.closePath();
  shade(ctx, tail, [tipX, tipY - 8, dockX, dockY + 6], coat.hair, 0.7);

  // A couple of loose strands so the edge is not a clean curve.
  ctx.strokeStyle = dark(coat.hair, 0.15);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const off = 3 + i * 4;
    ctx.beginPath();
    ctx.moveTo(dockX - 3, dockY + off * 0.4);
    ctx.quadraticCurveTo(dockX - 22, dockY + off + swing, tipX + 4, tipY + off * 0.7);
    ctx.stroke();
  }

  // ---- Neck and head, drawn BEFORE the body -------------------------------
  // Drawing the neck first lets the body silhouette cover its base, exactly as
  // a shoulder overlaps a neck in life. Drawn after, the join showed as a seam.
  const headBob = Math.sin(phase * Math.PI * 2 + 0.4) * (2 + 2.5 * intensity);

  ctx.save();
  ctx.translate(SHOULDER_X - 1, BODY_Y - BARREL_HALF * 1.1);
  ctx.rotate(-0.14 - 0.1 * drive);
  ctx.translate(0, headBob * 0.3);

  // Ear, behind the head so its base is hidden by it.
  const ear = new Path2D();
  ear.moveTo(20, -8);
  ear.lineTo(21, -16);
  ear.lineTo(25, -8);
  ear.closePath();
  shade(ctx, ear, [20, -16, 25, -7], body, 0.6);

  // NECK AND HEAD AS ONE SILHOUETTE.
  //
  // Proportions matter more here than anywhere: neck ~0.4 of withers height,
  // head ~0.28, and the neck TAPERS hard from a deep base to a fine throat.
  // Previously it was as deep as the barrel and half again too long, which is
  // why it read as a wedge with a small head stuck on the end.
  const NECK = 21;
  const HEAD = 14;
  const neck = new Path2D();
  neck.moveTo(-8, 11); // base at the withers
  neck.bezierCurveTo(-1, 2, NECK - 8, -5, NECK, -8); // crest, tapering
  neck.bezierCurveTo(NECK + 5, -10, NECK + 10, -8, NECK + HEAD - 3, -5); // poll and face
  neck.bezierCurveTo(NECK + HEAD + 1, -4, NECK + HEAD + 2, -1, NECK + HEAD - 1, 0); // muzzle
  neck.bezierCurveTo(NECK + HEAD - 5, 1, NECK + 8, 1, NECK + 3, 1); // jaw
  neck.bezierCurveTo(NECK - 5, 4, -2, 10, -6, 17); // throat, into the chest
  neck.closePath();
  shade(ctx, neck, [-8, -10, NECK + HEAD + 2, 17], body, 0.85);

  // Everything inside the neck is shading only — no outlines, no seams.
  ctx.save();
  ctx.clip(neck);

  // Muzzle, in the points colour.
  ctx.fillStyle = coat.points;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(NECK + HEAD - 2, -2, 3.6, 2.6, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // One soft gradient down the neck instead of discrete blobs, so no shading
  // shape can show its own edge.
  const ng = ctx.createLinearGradient(0, -10, 6, 16);
  ng.addColorStop(0, lite(body, 0.2));
  ng.addColorStop(0.5, 'rgba(0,0,0,0)');
  ng.addColorStop(1, dark(body, 0.26));
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = ng;
  ctx.fillRect(-12, -14, NECK + HEAD + 16, 34);

  // Mane along the crest.
  ctx.globalAlpha = 1;
  ctx.fillStyle = coat.hair;
  ctx.beginPath();
  ctx.moveTo(-9, 8);
  ctx.bezierCurveTo(-2, 0, NECK - 8, -6, NECK + 2, -9);
  ctx.bezierCurveTo(NECK - 6, -2 - headBob * 0.3, -1, 3, -9, 3);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Eye, on top of everything.
  ctx.fillStyle = '#120C08';
  ctx.beginPath();
  ctx.ellipse(NECK + 6, -5.5, 1.5, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // ---- Body: ONE silhouette, one outline ----------------------------------
  // Haunch, barrel and shoulder are a single continuous path. Drawn as three
  // overlapping ellipses they each carried their own outline, so you could see
  // the circles inside the horse. Internal form below is shading ONLY, never
  // stroked — an outline inside a body always reads as a seam.
  const D = BARREL_HALF;
  const silhouette = new Path2D();
  // point of shoulder
  silhouette.moveTo(SHOULDER_X + 6, BODY_Y + D * 0.2);
  // up the shoulder to the withers — the highest point of the topline
  silhouette.bezierCurveTo(
    SHOULDER_X + 4, BODY_Y - D * 0.7,
    SHOULDER_X - 4, BODY_Y - D * 1.25,
    SHOULDER_X - 11, BODY_Y - D * 1.3,
  );
  // long, near-level back with a shallow dip
  silhouette.bezierCurveTo(
    4, BODY_Y - D * 1.15,
    HIP_X + 14, BODY_Y - D * 1.1,
    HIP_X + 5, BODY_Y - D * 1.35,
  );
  // croup, then down over the quarters
  silhouette.bezierCurveTo(
    HIP_X - 3, BODY_Y - D * 1.5,
    HIP_X - 11, BODY_Y - D * 0.9,
    HIP_X - 11, BODY_Y + D * 0.1,
  );
  // buttock and stifle
  silhouette.bezierCurveTo(
    HIP_X - 11, BODY_Y + D * 0.9,
    HIP_X - 6, BODY_Y + D * 1.15,
    HIP_X + 2, BODY_Y + D * 0.95,
  );
  // belly, tucked up through the flank
  silhouette.bezierCurveTo(
    HIP_X + 12, BODY_Y + D * 0.8,
    -2, BODY_Y + D * 0.85,
    SHOULDER_X - 12, BODY_Y + D * 1.05,
  );
  // deep girth behind the elbow
  silhouette.bezierCurveTo(
    SHOULDER_X - 5, BODY_Y + D * 1.2,
    SHOULDER_X + 4, BODY_Y + D * 1.0,
    SHOULDER_X + 6, BODY_Y + D * 0.2,
  );
  silhouette.closePath();
  shade(
    ctx,
    silhouette,
    [HIP_X - 11, BODY_Y - D * 1.5, SHOULDER_X + 6, BODY_Y + D * 1.2],
    body,
  );

  // Internal form, clipped to the silhouette so nothing spills over the edge.
  ctx.save();
  ctx.clip(silhouette);

  const bg = ctx.createLinearGradient(0, BODY_Y - D * 1.6, 0, BODY_Y + D * 1.4);
  bg.addColorStop(0, lite(body, 0.24));
  bg.addColorStop(0.42, 'rgba(0,0,0,0)');
  bg.addColorStop(1, dark(body, 0.3));
  ctx.fillStyle = bg;
  ctx.fillRect(HIP_X - 16, BODY_Y - D * 1.8, SHOULDER_X - HIP_X + 30, D * 3.4);

  // The one piece of internal form worth keeping: the flank crease where the
  // barrel tucks up. Soft, and vertical, so it never reads as a circle.
  const fg = ctx.createLinearGradient(HIP_X + 6, 0, HIP_X + 20, 0);
  fg.addColorStop(0, 'rgba(0,0,0,0)');
  fg.addColorStop(0.5, dark(body, 0.18));
  fg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = fg;
  ctx.fillRect(HIP_X + 6, BODY_Y - D, 14, D * 2);
  ctx.globalAlpha = 1;

  ctx.restore();

  // ---- Jockey -------------------------------------------------------------
  const crouch = Math.sin(phase * Math.PI * 2 + 0.8) * 1.4;
  ctx.save();
  ctx.translate(11, BODY_Y - BARREL_HALF * 1.15 + crouch);
  ctx.rotate(-0.4 - 0.14 * drive);

  // Arched back, low and forward over the withers.
  const torso = new Path2D();
  torso.moveTo(-11, 4);
  torso.bezierCurveTo(-10, -6, -2, -11, 7, -11);
  torso.bezierCurveTo(12, -11, 15, -8, 15, -4);
  torso.bezierCurveTo(15, 0, 10, 3, 3, 4);
  torso.closePath();
  shade(ctx, torso, [-11, -11, 15, 5], opts.silks.primary, 0.75);

  // Arms reaching down the neck to the rein.
  ctx.strokeStyle = dark(opts.silks.secondary, 0.2);
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(9, -6);
  ctx.lineTo(18, 1);
  ctx.stroke();

  // Tucked knee and boot.
  ctx.strokeStyle = '#2A2320';
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.moveTo(-4, 1);
  ctx.lineTo(-7, 8);
  ctx.stroke();

  // Head, low and forward — not perched on top.
  const helmet = new Path2D();
  helmet.ellipse(15, -10, 5.2, 4.6, 0.25, 0, Math.PI * 2);
  shade(ctx, helmet, [10, -15, 20, -5], opts.silks.primary, 0.65);

  const peak = new Path2D();
  peak.ellipse(19.5, -8.5, 3.4, 1.7, 0.3, 0, Math.PI * 2);
  shade(ctx, peak, [16, -10, 23, -7], opts.silks.secondary, 0.55);

  ctx.restore();

  // ---- Near legs ----------------------------------------------------------
  drawLeg(ctx, HIP_X + 1, hipY, phase + LEG_OFFSET.nearHind, intensity, reach, -1, body, coat.points, 6.6);
  drawLeg(ctx, SHOULDER_X - 1, shoulderY, phase + LEG_OFFSET.nearFore, intensity, reach, 1, body, coat.points, 6);

  ctx.restore();
}

export function drawHorseShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, 44 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
