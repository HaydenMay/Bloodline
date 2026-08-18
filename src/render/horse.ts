import { coatFor, dark, lite, HORSE, type Coat, type Silks } from './palette.js';
import { BODY, EAR, HOOF, LEG, MANE, NECK_HEAD, TAIL, path } from './horseArt.js';

/**
 * The horse rig.
 *
 * Layered parts on a skeleton, not fixed animation frames (DESIGN.md §12).
 * Gaits are procedural, so transitions are smooth, every coat gene tints
 * cleanly, and a cosmetic added later is one more layer rather than a re-draw
 * of every frame.
 *
 * FORM lives in horseArt.ts; this file only moves it. Everything below is
 * skeleton, gait and shading.
 *
 * SHADING. Every shape is a gradient fill plus a thin outline in a DARKENED
 * TONE OF ITS OWN FILL COLOUR — never black, never a flat fill. That one rule
 * is the difference between shapes that read as an animal and shapes that read
 * as coloured blobs, and it costs nothing. Tones are derived from a single base
 * colour so any coat genetics produces later will shade correctly.
 *
 * Drawn in a local space roughly 100 units long, ground at y = 0, facing right.
 */

const GROUND = 0;

/** Centre of the barrel. The art layer is authored around this point. */
const BODY_Y = -40;

/**
 * Leg pivots, placed INSIDE the shoulder and haunch masses rather than on the
 * body's outline. A pivot on the edge lets the top of the leg swing out past
 * the silhouette, which is what put pale wedges over the shoulder and quarters.
 */
const SHOULDER = { x: 18, y: BODY_Y + 2 };
const HIP = { x: -20, y: BODY_Y + 1 };

/**
 * Bone lengths. Deliberately a little LONGER than the drop to the ground, so a
 * standing leg carries a natural bend.
 *
 * When the bones exactly spanned the drop, the IK clamped to full extension on
 * every stance frame and the legs went dead straight — stilts, not limbs.
 */
const FORE = { upper: 18, lower: 22 };
const HIND = { upper: 20, lower: 22 };

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
 *
 * All four contacts are packed into the FIRST THREE QUARTERS of the stride, so
 * the last quarter has nothing on the ground. That gap is the point. Spread
 * evenly across the whole cycle — the fores were previously half a stride
 * behind the hinds — some foot is always planted, the legs never gather, and
 * the horse runs like a toy on wheels. Measured against a galloping reference
 * the figure's height should change by about a quarter across a stride; with
 * the old timing it changed by three percent.
 */
const LEG_OFFSET = {
  nearHind: 0,
  farHind: 0.1,
  farFore: 0.32,
  nearFore: 0.42,
} as const;

/**
 * Share of the stride each foot spends on the ground.
 *
 * This has to leave a GAP. With the four footfall offsets below, a stance of
 * 0.42 kept ground contact continuous — some foot was always planted, so the
 * figure never gathered and its height varied by 3% across a stride. Measured
 * against a real gallop the swing should be nearer 25%: a galloping horse is
 * airborne with all four legs folded for part of every stride, and that
 * gathering is most of what reads as speed.
 *
 * At 0.32 the hinds are down to 0.44 and the fores pick up at 0.55, which
 * leaves a real suspension phase in between.
 */
const STANCE = 0.32;

function footPath(phase: number, intensity: number, reach: number): { x: number; y: number } {
  const p = phase % 1;
  const stance = STANCE;

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
  upper: number,
  lower: number,
): { x: number; y: number } {
  const dx = footX - hipX;
  const dy = footY - hipY;
  const d = Math.max(0.001, Math.min(Math.hypot(dx, dy), upper + lower - 0.001));
  const a = (upper * upper - lower * lower + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
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
  p: Path2D,
  bounds: [number, number, number, number],
  base: string,
  outline = 1,
  contrast = 1,
): void {
  const [x0, y0, x1, y1] = bounds;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, lite(base, 0.26 * contrast));
  g.addColorStop(0.48, base);
  g.addColorStop(1, dark(base, 0.24 * contrast));

  ctx.fillStyle = g;
  ctx.fill(p);

  if (outline > 0) {
    ctx.strokeStyle = dark(base, 0.45);
    ctx.lineWidth = 1.6 * outline;
    ctx.lineJoin = 'round';
    ctx.stroke(p);
  }
}

/** Unit perpendicular to a segment. */
function perp(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: -dy / len, y: dx / len };
}

interface LegSpec {
  top: number;
  mid: number;
  knee: number;
  fetlock: number;
}

/**
 * How far down the upper bone the leg actually starts being DRAWN.
 *
 * The joint still solves from the true pivot — this only moves where the shape
 * begins. It exists because a leg drawn from the pivot puts its widest, lightest
 * end on top of the barrel, and `shade` runs its gradient light-end-first, so
 * the top of every near leg landed on the body as a pale outlined wedge. No
 * amount of re-shading fixes that; the top of a leg simply should not be a
 * visible shape. The shoulder and haunch masses of the body carry that volume
 * instead, exactly as they do in life, and the leg emerges from under them.
 *
 * Hind legs need more of it than fore legs: the hip sits close to the point of
 * buttock, so at full rear extension a hind leg swings out past the back of the
 * body and takes its cut top with it, where a fore leg stays tucked under the
 * shoulder throughout.
 */
const LEG_START = { fore: 0.4, hind: 0.5 } as const;

/**
 * One leg as a single TAPERED SILHOUETTE with one outline, starting under the
 * body mass.
 */
function drawLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  phase: number,
  intensity: number,
  reach: number,
  bend: 1 | -1,
  bone: { upper: number; lower: number },
  spec: LegSpec,
  start: number,
  colour: string,
  point: string,
): void {
  const foot = footPath(phase, intensity, reach);
  const footX = hipX + foot.x;
  const footY = foot.y;
  const knee = solveKnee(hipX, hipY, footX, footY, bend, bone.upper, bone.lower);

  const pUpper = perp(hipX, hipY, knee.x, knee.y);
  const pLower = perp(knee.x, knee.y, footX, footY);
  // Average the two at the knee so the joint bends instead of notching.
  const pKnee = { x: (pUpper.x + pLower.x) / 2, y: (pUpper.y + pLower.y) / 2 };
  const kLen = Math.max(0.001, Math.hypot(pKnee.x, pKnee.y));
  pKnee.x /= kLen;
  pKnee.y /= kLen;

  // The shape starts under the body, not at the pivot.
  const topX = hipX + (knee.x - hipX) * start;
  const topY = hipY + (knee.y - hipY) * start;
  const wTop = spec.top + (spec.knee - spec.top) * start;

  // Mid-way down what is actually drawn, so the taper curves like muscle
  // instead of coning like a spike.
  const midX = (topX + knee.x) / 2;
  const midY = (topY + knee.y) / 2;

  const leg = new Path2D();
  leg.moveTo(topX + pUpper.x * wTop, topY + pUpper.y * wTop);
  leg.quadraticCurveTo(
    midX + pUpper.x * spec.mid,
    midY + pUpper.y * spec.mid,
    knee.x + pKnee.x * spec.knee,
    knee.y + pKnee.y * spec.knee,
  );
  leg.lineTo(footX + pLower.x * spec.fetlock, footY + pLower.y * spec.fetlock);
  leg.lineTo(footX - pLower.x * spec.fetlock, footY - pLower.y * spec.fetlock);
  leg.lineTo(knee.x - pKnee.x * spec.knee, knee.y - pKnee.y * spec.knee);
  leg.quadraticCurveTo(
    midX - pUpper.x * spec.mid * 0.8,
    midY - pUpper.y * spec.mid * 0.8,
    topX - pUpper.x * wTop,
    topY - pUpper.y * wTop,
  );
  leg.closePath();

  // Gradient runs ACROSS the leg rather than down it, so the light edge is a
  // highlight along the bone instead of a pale patch at the top. Held at low
  // contrast as well: a leg lit as strongly as the barrel separates from it and
  // reads as a pasted-on triangle where the two meet.
  shade(
    ctx,
    leg,
    [topX + pUpper.x * wTop, topY + pUpper.y * wTop, topX - pUpper.x * wTop, topY - pUpper.y * wTop],
    colour,
    0.7,
    0.55,
  );

  // The dark "points" run up the cannon — painted INSIDE the leg silhouette,
  // never as its own outlined shape.
  ctx.save();
  ctx.clip(leg);
  ctx.fillStyle = point;
  ctx.beginPath();
  ctx.moveTo(knee.x + pKnee.x * spec.knee * 2, knee.y + pKnee.y * spec.knee * 2);
  ctx.lineTo(footX + pLower.x * spec.fetlock * 3, footY + pLower.y * spec.fetlock * 3);
  ctx.lineTo(footX - pLower.x * spec.fetlock * 3, footY - pLower.y * spec.fetlock * 3);
  ctx.lineTo(knee.x - pKnee.x * spec.knee * 2, knee.y - pKnee.y * spec.knee * 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Hoof, angled to the cannon rather than always upright.
  const angle = Math.atan2(footY - knee.y, footX - knee.x) - Math.PI / 2;
  ctx.save();
  ctx.translate(footX, footY - HOOF.h * 0.6);
  ctx.rotate(angle);
  const hoof = new Path2D();
  hoof.ellipse(0, 0, HOOF.w, HOOF.h, 0, 0, Math.PI * 2);
  shade(ctx, hoof, [-HOOF.w, -HOOF.h, HOOF.w, HOOF.h], dark(point, 0.3), 0.5);
  ctx.restore();
}

export interface DrawHorseOptions {
  coat: string | Coat;
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
  const coat = typeof opts.coat === 'string' ? coatFor(opts.coat) : opts.coat;
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

  // ---- Far legs, pushed back in tone so the near side reads forward -------
  const far = dark(body, 0.3);
  const farPoint = dark(coat.points, 0.25);
  drawLeg(ctx, HIP.x - 3, HIP.y, phase + LEG_OFFSET.farHind, intensity, reach, -1, HIND, LEG.hind, LEG_START.hind, far, farPoint);
  drawLeg(ctx, SHOULDER.x - 4, SHOULDER.y, phase + LEG_OFFSET.farFore, intensity, reach, 1, FORE, LEG.fore, LEG_START.fore, far, farPoint);

  // ---- Tail ---------------------------------------------------------------
  // Swung as a whole from the dock. Animating the tip alone made it flap; a
  // tail trails from where it is attached.
  const swing = Math.sin(phase * Math.PI * 2 + 1.2) * 0.09;
  ctx.save();
  ctx.translate(HIP.x - 8, BODY_Y - 13);
  ctx.rotate(swing - 0.12 * intensity);
  const tail = path(TAIL);
  shade(ctx, tail, [-42, -8, 0, 10], coat.hair, 0.6);
  ctx.restore();

  // ---- Neck and head, drawn BEFORE the body -------------------------------
  // Drawing the neck first lets the body silhouette cover its base, exactly as
  // a shoulder overlaps a neck in life. Drawn after, the join showed as a seam.
  const headBob = Math.sin(phase * Math.PI * 2 + 0.4) * (0.03 + 0.035 * intensity);

  ctx.save();
  // Pivot at the withers, and the neck reaches LOW and FORWARD at the gallop.
  ctx.translate(SHOULDER.x - 3, BODY_Y - 12);
  ctx.rotate(0.16 + headBob + 0.12 * drive);

  // Ear, behind the head so its base is hidden by it.
  ctx.save();
  ctx.translate(23, -15);
  ctx.rotate(-0.25);
  shade(ctx, path(EAR), [-1, -8, 4, 0], dark(body, 0.12), 0.5);
  ctx.restore();

  const neck = path(NECK_HEAD);
  shade(ctx, neck, [-6, -16, 36, 10], body, 0.8);

  // Everything inside the neck is shading only — no outlines, no seams.
  ctx.save();
  ctx.clip(neck);

  // One soft gradient down the neck instead of discrete blobs, so no shading
  // shape can show its own edge.
  const ng = ctx.createLinearGradient(0, -14, 5, 12);
  ng.addColorStop(0, lite(body, 0.22));
  ng.addColorStop(0.5, 'rgba(0,0,0,0)');
  ng.addColorStop(1, dark(body, 0.28));
  ctx.fillStyle = ng;
  ctx.fillRect(-10, -20, 52, 36);

  // Muzzle, in the points colour.
  ctx.fillStyle = coat.points;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.ellipse(33, -4, 4, 3.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Mane along the crest — shaded like other parts to avoid glowing flat fills
  shade(ctx, path(MANE), [-1, -15, 21, -3], coat.hair, 0.5, 0.8);

  ctx.restore();

  // Eye, on top of everything. Small, and set high and well back on the face —
  // a large forward eye is the difference between a horse and a cartoon.
  ctx.fillStyle = HORSE.eye;
  ctx.beginPath();
  ctx.ellipse(26, -11, 1.3, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // ---- Body: ONE silhouette, one outline ----------------------------------
  // Internal form below is shading ONLY, never stroked — an outline inside a
  // body always reads as a seam.
  ctx.save();
  ctx.translate(0, BODY_Y);
  const silhouette = path(BODY);
  shade(ctx, silhouette, [-30, -17, 27, 13], body);

  ctx.save();
  ctx.clip(silhouette);

  const bg = ctx.createLinearGradient(0, -18, 0, 14);
  bg.addColorStop(0, lite(body, 0.24));
  bg.addColorStop(0.42, 'rgba(0,0,0,0)');
  bg.addColorStop(1, dark(body, 0.3));
  ctx.fillStyle = bg;
  ctx.fillRect(-32, -20, 62, 36);

  // Two pieces of internal form worth keeping, both soft and both vertical so
  // neither can read as a circle: the flank crease where the barrel tucks up,
  // and the shoulder groove behind the point of shoulder.
  const crease = (cx: number, w: number, amount: number): void => {
    const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, dark(body, amount));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g;
    ctx.fillRect(cx - w, -18, w * 2, 34);
    ctx.globalAlpha = 1;
  };
  crease(-12, 6, 0.2);
  crease(15, 5, 0.16);

  ctx.restore();
  ctx.restore();

  // ---- Jockey -------------------------------------------------------------
  drawJockey(ctx, phase, intensity, drive, opts.silks);

  // ---- Near legs ----------------------------------------------------------
  drawLeg(ctx, HIP.x + 2, HIP.y, phase + LEG_OFFSET.nearHind, intensity, reach, -1, HIND, LEG.hind, LEG_START.hind, body, coat.points);
  drawLeg(ctx, SHOULDER.x + 1, SHOULDER.y, phase + LEG_OFFSET.nearFore, intensity, reach, 1, FORE, LEG.fore, LEG_START.fore, body, coat.points);

  ctx.restore();
}

/**
 * The jockey: folded over the withers, not sitting on the horse.
 *
 * A race seat is knees up, backside off the saddle, head down over the neck.
 * The previous version was a rounded torso with one stick arm, which read as a
 * coloured teardrop. What makes it legible is the bent near leg — the tucked
 * knee and boot are the silhouette everyone recognises.
 */
function drawJockey(
  ctx: CanvasRenderingContext2D,
  phase: number,
  intensity: number,
  drive: number,
  silks: Silks,
): void {
  const crouch = Math.sin(phase * Math.PI * 2 + 0.8) * (0.8 + 0.8 * intensity);

  ctx.save();
  ctx.translate(6, BODY_Y - 14 + crouch);
  ctx.rotate(-0.34 - 0.12 * drive);

  // Near leg first, so the torso overlaps its top. Kept SHORT and tucked in
  // under the body of the rider — drawn long and pale it read as a bar sticking
  // out of the jockey's side rather than a folded knee.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = dark(silks.primary, 0.4);
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.moveTo(1, 1);
  ctx.lineTo(-1, 5); // knee, tucked up and forward
  ctx.stroke();

  // Boot, in the stirrup. Kept fine — a thick dark stroke here reads as a
  // smudge on the horse's back rather than a foot.
  ctx.strokeStyle = HORSE.boot;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-1, 5);
  ctx.lineTo(2, 7.5);
  ctx.stroke();

  // Arched back, low and forward over the withers.
  const torso = new Path2D();
  torso.moveTo(-10, 3);
  torso.bezierCurveTo(-10, -5, -3, -10, 6, -10);
  torso.bezierCurveTo(11, -10, 14, -7, 14, -3);
  torso.bezierCurveTo(14, 1, 9, 3, 2, 3);
  torso.closePath();
  shade(ctx, torso, [-10, -10, 14, 4], silks.primary, 0.7);

  // Arm reaching down the neck to the rein.
  ctx.strokeStyle = dark(silks.primary, 0.3);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8, -5);
  ctx.lineTo(17, 1);
  ctx.stroke();

  // Head, low and forward — not perched on top.
  const helmet = new Path2D();
  helmet.ellipse(15, -8, 4.6, 4.1, 0.25, 0, Math.PI * 2);
  shade(ctx, helmet, [10, -12, 20, -4], silks.primary, 0.6);

  // Peak, and the goggle strap that makes it read as a helmet.
  const peak = new Path2D();
  peak.ellipse(19, -7, 3, 1.5, 0.3, 0, Math.PI * 2);
  shade(ctx, peak, [16, -9, 22, -5], silks.secondary, 0.5);

  ctx.strokeStyle = dark(silks.secondary, 0.1);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(12, -9);
  ctx.lineTo(18, -10);
  ctx.stroke();

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
  ctx.fillStyle = HORSE.shadowBlack;
  ctx.beginPath();
  ctx.ellipse(x, y, 44 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
