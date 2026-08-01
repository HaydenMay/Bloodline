import { coatFor, type Silks } from './palette.js';

/**
 * The horse rig.
 *
 * Layered parts on a skeleton, not fixed animation frames (DESIGN.md §12).
 * Gaits are procedural, so transitions are smooth, every coat gene tints
 * cleanly, and a cosmetic added later is one more layer rather than a re-draw
 * of every frame.
 *
 * Drawn in a local space roughly 100 units long with the ground at y = 0 and
 * the horse facing right, then scaled to fit. All measurements below are in
 * that space.
 */

const GROUND = 0;
const BODY_Y = -46; // barrel centre above the ground
const SHOULDER_X = 20;
const HIP_X = -22;
const UPPER = 20; // shoulder/hip to knee/hock
const LOWER = 24; // knee/hock to hoof

export interface HorsePose {
  /** 0-1 through the stride cycle. */
  phase: number;
  /** 0-1, blends the stride between a relaxed canter and a flat-out gallop. */
  intensity: number;
  /** Slight forward lean while driving. */
  drive: number;
}

/**
 * Where each leg sits in the stride.
 *
 * Offsets follow a transverse gallop — near hind, far hind, far fore, near fore
 * — which is what gives the gait its characteristic rocking rather than looking
 * like a pantomime horse.
 */
const LEG_OFFSET = {
  farHind: 0.12,
  nearHind: 0,
  farFore: 0.55,
  nearFore: 0.67,
} as const;

/** Foot position for a leg at a given point in the stride, relative to its hip. */
function footPath(phase: number, intensity: number, reach: number): { x: number; y: number } {
  const p = phase % 1;
  const stance = 0.42; // fraction of the cycle with the hoof on the ground

  if (p < stance) {
    // Planted: the hoof is still while the body travels over it, so in local
    // space it slides backwards.
    const t = p / stance;
    return { x: reach * (1 - 2 * t), y: GROUND };
  }

  // Swing: lift, fold, and reach forward again.
  const t = (p - stance) / (1 - stance);
  const lift = Math.sin(t * Math.PI) * (10 + 16 * intensity);
  const x = -reach + 2 * reach * t;
  return { x, y: GROUND - lift };
}

/** Two-bone IK. Returns the joint position between hip and foot. */
function solveKnee(
  hipX: number,
  hipY: number,
  footX: number,
  footY: number,
  upper: number,
  lower: number,
  bend: 1 | -1,
): { x: number; y: number } {
  const dx = footX - hipX;
  const dy = footY - hipY;
  const dist = Math.max(0.001, Math.min(Math.hypot(dx, dy), upper + lower - 0.001));

  const a = (upper * upper - lower * lower + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));

  const mx = hipX + (dx * a) / dist;
  const my = hipY + (dy * a) / dist;

  // Perpendicular, flipped by `bend` so forelegs and hind legs articulate the
  // opposite way — which is what makes a horse read as a horse.
  return { x: mx + (bend * h * dy) / dist, y: my - (bend * h * dx) / dist };
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
  pointColour: string,
  width: number,
): void {
  const foot = footPath(phase, intensity, reach);
  const footX = hipX + foot.x;
  const footY = foot.y;
  const knee = solveKnee(hipX, hipY, footX, footY, UPPER, LOWER, bend);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Upper bone, thicker.
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(knee.x, knee.y);
  ctx.stroke();

  // Cannon bone, thinner and darker — the "points" of the coat.
  ctx.strokeStyle = pointColour;
  ctx.lineWidth = width * 0.62;
  ctx.beginPath();
  ctx.moveTo(knee.x, knee.y);
  ctx.lineTo(footX, footY);
  ctx.stroke();

  // Hoof.
  ctx.fillStyle = pointColour;
  ctx.beginPath();
  ctx.ellipse(footX, footY - 1.5, width * 0.42, width * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
}

export interface DrawHorseOptions {
  coat: string;
  silks: Silks;
  pose: HorsePose;
  /** Pixels per local unit. */
  scale: number;
  /** Dim horses that have already crossed the line. */
  faded?: boolean;
}

export function drawHorse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opts: DrawHorseOptions,
): void {
  const { coat: coatId, silks, pose, scale } = opts;
  const coat = coatFor(coatId);
  const { phase, intensity, drive } = pose;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (opts.faded) ctx.globalAlpha = 0.45;

  // The barrel rises and falls twice per stride, and the whole horse lifts
  // through the moment of suspension.
  const bob = Math.sin(phase * Math.PI * 2) * (1.5 + 2 * intensity);
  const suspension = Math.max(0, Math.sin(phase * Math.PI * 2 - 0.9)) * 4 * intensity;
  ctx.translate(0, -suspension + bob);
  ctx.rotate(-0.05 * drive);

  const reach = 20 + 14 * intensity;
  const shoulderY = BODY_Y + 6;
  const hipY = BODY_Y + 4;

  // ---- Far side legs, drawn behind the body and darkened for depth --------
  ctx.globalAlpha *= 1;
  const farShade = coat.shade;
  drawLeg(ctx, HIP_X, hipY, phase + LEG_OFFSET.farHind, intensity, reach, -1, farShade, coat.points, 8);
  drawLeg(ctx, SHOULDER_X, shoulderY, phase + LEG_OFFSET.farFore, intensity, reach, 1, farShade, coat.points, 7.5);

  // ---- Tail ---------------------------------------------------------------
  const tailSwing = Math.sin(phase * Math.PI * 2 + 1.2) * 4;
  ctx.fillStyle = coat.hair;
  ctx.beginPath();
  ctx.moveTo(HIP_X - 6, BODY_Y - 6);
  ctx.quadraticCurveTo(HIP_X - 26, BODY_Y - 12 + tailSwing, HIP_X - 40, BODY_Y + 6 + tailSwing * 1.6);
  ctx.quadraticCurveTo(HIP_X - 26, BODY_Y + 2 + tailSwing, HIP_X - 8, BODY_Y + 6);
  ctx.closePath();
  ctx.fill();

  // ---- Barrel -------------------------------------------------------------
  ctx.fillStyle = coat.body;
  ctx.beginPath();
  ctx.ellipse(-1, BODY_Y, 34, 17, -0.04, 0, Math.PI * 2);
  ctx.fill();

  // Haunch and shoulder mass, so the silhouette is not a plain oval.
  ctx.beginPath();
  ctx.ellipse(HIP_X - 4, BODY_Y - 1, 15, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(SHOULDER_X - 2, BODY_Y + 1, 13, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Underside shading.
  ctx.fillStyle = coat.shade;
  ctx.beginPath();
  ctx.ellipse(-2, BODY_Y + 9, 28, 7, -0.03, 0, Math.PI * 2);
  ctx.fill();

  // Topline highlight.
  ctx.fillStyle = coat.light;
  ctx.beginPath();
  ctx.ellipse(-4, BODY_Y - 11, 24, 4.5, -0.05, 0, Math.PI * 2);
  ctx.fill();

  // ---- Neck and head ------------------------------------------------------
  const headBob = Math.sin(phase * Math.PI * 2 + 0.4) * (2 + 2.5 * intensity);
  const neckAngle = -0.42 - 0.12 * drive;

  ctx.save();
  ctx.translate(SHOULDER_X + 4, BODY_Y - 4);
  ctx.rotate(neckAngle);
  ctx.translate(0, headBob * 0.3);

  ctx.fillStyle = coat.body;
  ctx.beginPath();
  ctx.moveTo(-8, 10);
  ctx.quadraticCurveTo(6, 2, 26, -4);
  ctx.lineTo(30, 8);
  ctx.quadraticCurveTo(10, 14, -6, 20);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.save();
  ctx.translate(28, 1);
  ctx.rotate(0.36);
  ctx.fillStyle = coat.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = coat.points;
  ctx.beginPath();
  ctx.ellipse(11, 1.5, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ear
  ctx.fillStyle = coat.shade;
  ctx.beginPath();
  ctx.moveTo(-9, -5);
  ctx.lineTo(-11, -13);
  ctx.lineTo(-4, -6);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = '#120C08';
  ctx.beginPath();
  ctx.ellipse(2, -1.5, 1.5, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Mane, streaming with the stride.
  ctx.fillStyle = coat.hair;
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.quadraticCurveTo(8, -2, 26, -6);
  ctx.quadraticCurveTo(12, -12 - headBob * 0.4, -8, 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // ---- Jockey -------------------------------------------------------------
  const crouch = Math.sin(phase * Math.PI * 2 + 0.8) * 1.4;
  ctx.save();
  ctx.translate(2, BODY_Y - 14 + crouch);
  ctx.rotate(-0.22 - 0.1 * drive);

  // Torso in the stable's primary colour.
  ctx.fillStyle = silks.primary;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sleeve in the secondary.
  ctx.fillStyle = silks.secondary;
  ctx.beginPath();
  ctx.ellipse(7, 2, 6, 4.5, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Boot and stirrup leg.
  ctx.strokeStyle = '#2A2320';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, 5);
  ctx.lineTo(-1, 13);
  ctx.stroke();

  // Helmet.
  ctx.fillStyle = silks.primary;
  ctx.beginPath();
  ctx.arc(9, -8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = silks.secondary;
  ctx.beginPath();
  ctx.ellipse(13, -7, 4, 2, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // ---- Near side legs, in front of everything -----------------------------
  drawLeg(ctx, HIP_X + 3, hipY, phase + LEG_OFFSET.nearHind, intensity, reach, -1, coat.body, coat.points, 9);
  drawLeg(ctx, SHOULDER_X + 2, shoulderY, phase + LEG_OFFSET.nearFore, intensity, reach, 1, coat.body, coat.points, 8.5);

  ctx.restore();
}

/** Soft contact shadow, drawn on the track before the horse. */
export function drawHorseShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y, 42 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
