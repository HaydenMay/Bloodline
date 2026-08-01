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

  const wHip = width * 0.62;
  const wKnee = width * 0.3;
  const wFoot = width * 0.2;

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

  const leg = new Path2D();
  leg.moveTo(hipX + pUpper.x * wHip, hipY + pUpper.y * wHip);
  leg.lineTo(knee.x + pKnee.x * wKnee, knee.y + pKnee.y * wKnee);
  leg.lineTo(footX + pLower.x * wFoot, footY + pLower.y * wFoot);
  leg.lineTo(footX - pLower.x * wFoot, footY - pLower.y * wFoot);
  leg.lineTo(knee.x - pKnee.x * wKnee, knee.y - pKnee.y * wKnee);
  leg.lineTo(hipX - pUpper.x * wHip, hipY - pUpper.y * wHip);
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

  // ---- Neck and head, drawn BEFORE the body -------------------------------
  // Drawing the neck first lets the body silhouette cover its base, exactly as
  // a shoulder overlaps a neck in life. Drawn after, the join showed as a seam.
  const headBob = Math.sin(phase * Math.PI * 2 + 0.4) * (2 + 2.5 * intensity);

  ctx.save();
  ctx.translate(SHOULDER_X + 5, BODY_Y - 6);
  ctx.rotate(-0.46 - 0.13 * drive);
  ctx.translate(0, headBob * 0.3);

  // Ear, behind the head so its base is hidden by it.
  const ear = new Path2D();
  ear.moveTo(24, -13);
  ear.lineTo(25, -22);
  ear.lineTo(30, -12);
  ear.closePath();
  shade(ctx, ear, [24, -22, 30, -11], body, 0.7);

  // NECK AND HEAD AS ONE SILHOUETTE.
  // Crest from the withers, over the poll, down the face to the muzzle, back
  // under the jaw and down the throat. Drawn as two pieces the join showed as
  // a hard line across the throat — the same seam problem as the body.
  const neck = new Path2D();
  neck.moveTo(-9, 13); // base at the withers
  neck.bezierCurveTo(2, 1, 14, -8, 24, -14); // crest
  neck.bezierCurveTo(31, -18, 39, -14, 42, -7); // poll and forehead
  neck.bezierCurveTo(45, -2, 44, 2, 40, 3); // face down to the muzzle
  neck.bezierCurveTo(36, 4, 33, 2, 30, 1); // muzzle underside
  neck.bezierCurveTo(26, 4, 22, 6, 17, 6); // jaw
  neck.bezierCurveTo(8, 9, -1, 15, -6, 22); // throat to the chest
  neck.closePath();
  shade(ctx, neck, [-9, -18, 45, 22], body, 0.9);

  // Everything inside the neck is shading only — no outlines, no seams.
  ctx.save();
  ctx.clip(neck);

  // Muzzle, in the points colour.
  ctx.fillStyle = coat.points;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(38, 0, 6, 4.5, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Light down the crest.
  ctx.fillStyle = lite(body, 0.2);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(14, -9, 16, 3.5, -0.42, 0, Math.PI * 2);
  ctx.fill();

  // Shadow under the jaw and along the throat.
  ctx.fillStyle = dark(body, 0.26);
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(4, 14, 16, 5, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Mane along the crest, clipped so it never breaks the outline.
  ctx.globalAlpha = 1;
  ctx.fillStyle = coat.hair;
  ctx.beginPath();
  ctx.moveTo(-9, 10);
  ctx.bezierCurveTo(2, -2, 14, -11, 26, -17);
  ctx.bezierCurveTo(20, -8 - headBob * 0.4, 6, -1, -9, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Eye, on top of everything.
  ctx.fillStyle = '#120C08';
  ctx.beginPath();
  ctx.ellipse(31, -9, 1.7, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // ---- Body: ONE silhouette, one outline ----------------------------------
  // Haunch, barrel and shoulder are a single continuous path. Drawn as three
  // overlapping ellipses they each carried their own outline, so you could see
  // the circles inside the horse. Internal form below is shading ONLY, never
  // stroked — an outline inside a body always reads as a seam.
  const silhouette = new Path2D();
  silhouette.moveTo(SHOULDER_X + 11, BODY_Y + 1);
  // withers and topline
  silhouette.bezierCurveTo(SHOULDER_X + 7, BODY_Y - 13, SHOULDER_X - 6, BODY_Y - 17, 2, BODY_Y - 17);
  // back, dipping slightly to the croup
  silhouette.bezierCurveTo(HIP_X + 8, BODY_Y - 17, HIP_X - 2, BODY_Y - 19, HIP_X - 9, BODY_Y - 13);
  // rump and haunch
  silhouette.bezierCurveTo(HIP_X - 18, BODY_Y - 7, HIP_X - 19, BODY_Y + 6, HIP_X - 10, BODY_Y + 13);
  // stifle down to the belly
  silhouette.bezierCurveTo(HIP_X - 4, BODY_Y + 17, HIP_X + 6, BODY_Y + 13, -2, BODY_Y + 12);
  // tucked-up flank, then the girth
  silhouette.bezierCurveTo(SHOULDER_X - 8, BODY_Y + 12, SHOULDER_X - 2, BODY_Y + 16, SHOULDER_X + 6, BODY_Y + 12);
  // chest
  silhouette.bezierCurveTo(SHOULDER_X + 13, BODY_Y + 9, SHOULDER_X + 14, BODY_Y + 5, SHOULDER_X + 11, BODY_Y + 1);
  silhouette.closePath();
  shade(ctx, silhouette, [HIP_X - 19, BODY_Y - 19, SHOULDER_X + 14, BODY_Y + 17], body);

  // Internal form, clipped to the silhouette so nothing spills over the edge.
  ctx.save();
  ctx.clip(silhouette);

  // Belly shadow.
  ctx.fillStyle = dark(body, 0.3);
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.ellipse(0, BODY_Y + 16, 30, 9, -0.03, 0, Math.PI * 2);
  ctx.fill();

  // Light along the back.
  ctx.fillStyle = lite(body, 0.24);
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.ellipse(-3, BODY_Y - 16, 22, 5, -0.03, 0, Math.PI * 2);
  ctx.fill();

  // Haunch mass — a soft crease, not an outlined circle.
  ctx.fillStyle = lite(body, 0.16);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(HIP_X - 5, BODY_Y - 2, 12, 13, -0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dark(body, 0.22);
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(HIP_X + 10, BODY_Y + 1, 5, 14, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Shoulder plane.
  ctx.fillStyle = lite(body, 0.14);
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(SHOULDER_X, BODY_Y + 3, 9, 12, 0.24, 0, Math.PI * 2);
  ctx.fill();

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
