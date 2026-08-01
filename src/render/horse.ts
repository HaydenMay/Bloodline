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
const BODY_Y = -46;
const SHOULDER_X = 19;
const HIP_X = -21;
const UPPER = 20;
const LOWER = 25;

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
  const lift = Math.sin(t * Math.PI) * (10 + 16 * intensity);
  return { x: -reach + 2 * reach * t, y: GROUND - lift };
}

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
  return { x: mx + (bend * h * dy) / d, y: my - (bend * h * dx) / d };
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

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outline pass first, then the fill on top — a cheap way to get line art on
  // a stroked limb without drawing the outline as a separate path.
  ctx.strokeStyle = dark(colour, 0.45);
  ctx.lineWidth = width + 2.4;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(knee.x, knee.y);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();

  // Cannon bone: thinner, and the darker "points" colour.
  ctx.strokeStyle = point;
  ctx.lineWidth = width * 0.55;
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  ctx.fillStyle = dark(point, 0.3);
  ctx.beginPath();
  ctx.ellipse(footX, footY - 1.5, width * 0.44, width * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
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

  const reach = 20 + 14 * intensity;
  const shoulderY = BODY_Y + 5;
  const hipY = BODY_Y + 3;

  // ---- Far legs, pushed back in tone so the near side reads forward -------
  const far = dark(body, 0.3);
  const farPoint = dark(coat.points, 0.25);
  drawLeg(ctx, HIP_X - 2, hipY, phase + LEG_OFFSET.farHind, intensity, reach, -1, far, farPoint, 7);
  drawLeg(ctx, SHOULDER_X - 2, shoulderY, phase + LEG_OFFSET.farFore, intensity, reach, 1, far, farPoint, 6.5);

  // ---- Tail ---------------------------------------------------------------
  const swing = Math.sin(phase * Math.PI * 2 + 1.2) * 4;
  const tail = new Path2D();
  tail.moveTo(HIP_X - 4, BODY_Y - 8);
  tail.quadraticCurveTo(HIP_X - 24, BODY_Y - 14 + swing, HIP_X - 42, BODY_Y + 4 + swing * 1.7);
  tail.quadraticCurveTo(HIP_X - 24, BODY_Y + 1 + swing, HIP_X - 6, BODY_Y + 5);
  tail.closePath();
  shade(ctx, tail, [HIP_X - 42, BODY_Y - 14, HIP_X, BODY_Y + 6], coat.hair, 0.8);

  // ---- Barrel -------------------------------------------------------------
  // Deeper girth at the shoulder, tucked-up flank behind — a thoroughbred
  // silhouette rather than a plain oval.
  const barrel = new Path2D();
  barrel.moveTo(SHOULDER_X + 6, BODY_Y - 8);
  barrel.quadraticCurveTo(4, BODY_Y - 19, HIP_X - 6, BODY_Y - 13);
  barrel.quadraticCurveTo(HIP_X - 15, BODY_Y - 2, HIP_X - 4, BODY_Y + 11);
  barrel.quadraticCurveTo(-2, BODY_Y + 15, SHOULDER_X + 2, BODY_Y + 13);
  barrel.quadraticCurveTo(SHOULDER_X + 13, BODY_Y + 4, SHOULDER_X + 6, BODY_Y - 8);
  barrel.closePath();
  shade(ctx, barrel, [HIP_X - 15, BODY_Y - 19, SHOULDER_X + 13, BODY_Y + 15], body);

  // Haunch — the big driving muscle, and the most recognisable part of the
  // outline from side on.
  const haunch = new Path2D();
  haunch.ellipse(HIP_X - 3, BODY_Y - 1, 15, 16, -0.12, 0, Math.PI * 2);
  shade(ctx, haunch, [HIP_X - 18, BODY_Y - 17, HIP_X + 12, BODY_Y + 15], body, 0.85);

  // Shoulder.
  const shoulder = new Path2D();
  shoulder.ellipse(SHOULDER_X - 1, BODY_Y + 2, 12, 14, 0.22, 0, Math.PI * 2);
  shade(ctx, shoulder, [SHOULDER_X - 13, BODY_Y - 12, SHOULDER_X + 11, BODY_Y + 16], body, 0.85);

  // ---- Neck and head ------------------------------------------------------
  const headBob = Math.sin(phase * Math.PI * 2 + 0.4) * (2 + 2.5 * intensity);

  ctx.save();
  ctx.translate(SHOULDER_X + 5, BODY_Y - 6);
  ctx.rotate(-0.46 - 0.13 * drive);
  ctx.translate(0, headBob * 0.3);

  // Finer neck than a simple wedge: crest above, throat cut away below.
  const neck = new Path2D();
  neck.moveTo(-9, 12);
  neck.quadraticCurveTo(4, 0, 25, -7);
  neck.lineTo(31, 3);
  neck.quadraticCurveTo(12, 9, -6, 21);
  neck.closePath();
  shade(ctx, neck, [-9, -7, 31, 21], body, 0.9);

  // Head — longer and finer than a blob.
  ctx.save();
  ctx.translate(28, -1);
  ctx.rotate(0.4);
  const head = new Path2D();
  head.moveTo(-10, -6);
  head.quadraticCurveTo(6, -7, 15, -2);
  head.quadraticCurveTo(18, 1, 14, 4);
  head.quadraticCurveTo(4, 8, -9, 6);
  head.closePath();
  shade(ctx, head, [-10, -7, 18, 8], body, 0.8);

  const muzzle = new Path2D();
  muzzle.ellipse(13, 1.5, 4, 3.4, 0.1, 0, Math.PI * 2);
  shade(ctx, muzzle, [9, -2, 17, 5], coat.points, 0.7);

  const ear = new Path2D();
  ear.moveTo(-8, -5);
  ear.lineTo(-10, -14);
  ear.lineTo(-3, -6);
  ear.closePath();
  shade(ctx, ear, [-10, -14, -3, -5], body, 0.7);

  ctx.fillStyle = '#120C08';
  ctx.beginPath();
  ctx.ellipse(1, -1.5, 1.6, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Mane along the crest.
  const mane = new Path2D();
  mane.moveTo(-7, 9);
  mane.quadraticCurveTo(7, -3, 26, -9);
  mane.quadraticCurveTo(11, -14 - headBob * 0.4, -9, 3);
  mane.closePath();
  shade(ctx, mane, [-9, -14, 26, 9], coat.hair, 0.7);

  ctx.restore();

  // ---- Jockey -------------------------------------------------------------
  const crouch = Math.sin(phase * Math.PI * 2 + 0.8) * 1.4;
  ctx.save();
  ctx.translate(1, BODY_Y - 15 + crouch);
  ctx.rotate(-0.24 - 0.12 * drive);

  const torso = new Path2D();
  torso.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
  shade(ctx, torso, [-12, -8, 12, 8], opts.silks.primary, 0.8);

  const sleeve = new Path2D();
  sleeve.ellipse(7, 2, 5.5, 4.2, -0.3, 0, Math.PI * 2);
  shade(ctx, sleeve, [1, -2, 13, 6], opts.silks.secondary, 0.7);

  ctx.strokeStyle = '#2A2320';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, 5);
  ctx.lineTo(-1, 13);
  ctx.stroke();

  const helmet = new Path2D();
  helmet.arc(9, -8, 5.8, 0, Math.PI * 2);
  shade(ctx, helmet, [3, -14, 15, -2], opts.silks.primary, 0.7);

  const peak = new Path2D();
  peak.ellipse(13.5, -7, 4, 1.9, 0.2, 0, Math.PI * 2);
  shade(ctx, peak, [9, -9, 18, -5], opts.silks.secondary, 0.6);

  ctx.restore();

  // ---- Near legs ----------------------------------------------------------
  drawLeg(ctx, HIP_X + 3, hipY, phase + LEG_OFFSET.nearHind, intensity, reach, -1, body, coat.points, 8.5);
  drawLeg(ctx, SHOULDER_X + 2, shoulderY, phase + LEG_OFFSET.nearFore, intensity, reach, 1, body, coat.points, 8);

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
