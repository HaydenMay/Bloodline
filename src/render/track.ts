import { SCENE, UI } from './palette.js';

/**
 * The track and everything behind it.
 *
 * The camera follows the pack along a straight, scrolling line. The oval is a
 * fiction maintained by the minimap (DESIGN.md §4) — which is the cheapest way
 * to get a readable side-on race and a real sense of track position at once.
 */

export interface Camera {
  /** Metres from the start that sits at the left edge of the view. */
  scrollMetres: number;
  /** Screen pixels per metre. */
  pixelsPerMetre: number;
}

/**
 * Metres between distance poles.
 *
 * 200 rather than a furlong's 201.168, because the poles are a readout for the
 * player and round numbers are what a readout is for.
 */
const MARKER_SPACING = 200;

export function metreToScreen(metres: number, cam: Camera): number {
  return (metres - cam.scrollMetres) * cam.pixelsPerMetre;
}

/** A deterministic pseudo-random, so scenery doesn't shimmer between frames. */
const noise = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cam: Camera,
  hype: number,
): void {
  const horizon = height * 0.44;

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, SCENE.skyTop);
  sky.addColorStop(1, SCENE.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);

  // Distant hills, parallaxed slowly so there is depth without distraction.
  const hillShift = -(cam.scrollMetres * cam.pixelsPerMetre * 0.06) % (width + 400);
  ctx.fillStyle = SCENE.distantHills;
  ctx.beginPath();
  ctx.moveTo(hillShift - 200, horizon);
  for (let i = 0; i <= 12; i++) {
    const x = hillShift - 200 + (i * (width + 400)) / 12;
    const h = 26 + noise(i * 3.7) * 34;
    ctx.lineTo(x, horizon - h);
  }
  ctx.lineTo(hillShift + width + 400, horizon);
  ctx.closePath();
  ctx.fill();

  drawCrowd(ctx, width, horizon, cam, hype);
  drawTurf(ctx, width, height, horizon, cam);
  drawRail(ctx, width, horizon, cam);
}

/**
 * Crowd density scales with race hype (DESIGN.md §12), so climbing the ladder
 * is something you can see on race day rather than only read in a menu.
 */
function drawCrowd(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizon: number,
  cam: Camera,
  hype: number,
): void {
  const standTop = horizon - 58;
  const standHeight = 58;

  ctx.fillStyle = SCENE.crowdBack;
  ctx.fillRect(0, standTop, width, standHeight);

  // Terracing
  ctx.fillStyle = SCENE.crowdFront;
  for (let row = 0; row < 5; row++) {
    const y = standTop + 8 + row * 10;
    ctx.fillRect(0, y, width, 3);
  }

  // Heads. Population is driven by hype; positions are stable in world space
  // so the crowd scrolls with the track instead of crawling.
  const spacing = 7;
  const density = 0.18 + hype * 0.72;
  const worldOffset = cam.scrollMetres * cam.pixelsPerMetre * 0.35;
  const first = Math.floor(worldOffset / spacing);
  const count = Math.ceil(width / spacing) + 2;

  for (let i = 0; i < count; i++) {
    const idx = first + i;
    for (let row = 0; row < 5; row++) {
      const seed = idx * 7.3 + row * 31.7;
      if (noise(seed) > density) continue;
      const x = idx * spacing - worldOffset + noise(seed * 1.7) * 3;
      const y = standTop + 12 + row * 10;
      const shade = 60 + Math.floor(noise(seed * 2.3) * 90);
      ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 14})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTurf(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  horizon: number,
  cam: Camera,
): void {
  // Far turf, beyond the running surface.
  ctx.fillStyle = SCENE.turfFar;
  ctx.fillRect(0, horizon, width, height * 0.09);

  // The running surface.
  const trackTop = horizon + height * 0.09;
  ctx.fillStyle = SCENE.dirt;
  ctx.fillRect(0, trackTop, width, height - trackTop);

  // Mown stripes, anchored in world space so they convey speed.
  const stripeMetres = 18;
  const stripePx = stripeMetres * cam.pixelsPerMetre;
  const offset = -((cam.scrollMetres * cam.pixelsPerMetre) % (stripePx * 2));
  ctx.fillStyle = SCENE.dirtShade;
  for (let x = offset; x < width + stripePx * 2; x += stripePx * 2) {
    ctx.fillRect(x, trackTop, stripePx, height - trackTop);
  }

  // Near-side turf apron.
  ctx.fillStyle = SCENE.turfNear;
  ctx.fillRect(0, height - height * 0.06, width, height * 0.06);
}

function drawRail(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizon: number,
  cam: Camera,
): void {
  const railY = horizon + 6;
  const spacingMetres = 11;
  const spacing = spacingMetres * cam.pixelsPerMetre;
  const offset = -((cam.scrollMetres * cam.pixelsPerMetre) % spacing);

  ctx.strokeStyle = SCENE.railPost;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, railY);
  ctx.lineTo(width, railY);
  ctx.stroke();

  ctx.strokeStyle = SCENE.railShadow;
  ctx.lineWidth = 1.5;
  for (let x = offset; x < width + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, railY);
    ctx.lineTo(x, railY + 12);
    ctx.stroke();
  }
}

/**
 * Distance markers and the winning post, so distance is legible on the track.
 *
 * Posted every MARKER_SPACING metres, counting down to the wire — the game
 * works in metres end to end (REBUILD.md §3), so the poles say what the HUD
 * says and neither has to convert.
 */
export function drawDistanceMarkers(
  ctx: CanvasRenderingContext2D,
  height: number,
  cam: Camera,
  totalMetres: number,
): void {
  const horizon = height * 0.44;
  const markerY = horizon + 10;

  // Count back from the wire so the winning post lands exactly on the line,
  // whatever the race distance — a race is any number of metres now, not a
  // whole number of furlongs.
  const first = totalMetres % MARKER_SPACING;
  for (let metres = first; metres <= totalMetres; metres += MARKER_SPACING) {
    const x = metreToScreen(metres, cam);
    if (x < -60 || x > 4000) continue;

    const remaining = Math.round((totalMetres - metres) / MARKER_SPACING);
    const isWire = remaining === 0;

    ctx.fillStyle = isWire ? UI.accent : SCENE.furlongPost;
    ctx.fillRect(x - 1.5, markerY, 3, isWire ? 40 : 26);

    if (isWire) {
      // The wire itself.
      ctx.strokeStyle = UI.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, markerY - 40);
      ctx.lineTo(x, markerY);
      ctx.stroke();
      ctx.fillRect(x - 14, markerY - 46, 28, 8);
    } else if (remaining <= 8) {
      ctx.fillStyle = UI.bg;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${remaining * MARKER_SPACING}`, x, markerY + 20);
    }
  }
}

/**
 * The oval minimap.
 *
 * The side-on view cannot show turns, so this carries the real track shape and
 * everyone's position on it.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  runners: { progress: number; colour: string; isPlayer: boolean }[],
): void {
  const rx = w / 2 - 6;
  const ry = h / 2 - 6;
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();
  ctx.strokeStyle = SCENE.minimapOval;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Winning post at the top of the oval.
  ctx.strokeStyle = UI.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry - 5);
  ctx.lineTo(cx, cy - ry + 5);
  ctx.stroke();

  for (const r of runners) {
    // Start at the post and run clockwise.
    const angle = -Math.PI / 2 + r.progress * Math.PI * 2;
    const px = cx + Math.cos(angle) * rx;
    const py = cy + Math.sin(angle) * ry;

    ctx.fillStyle = r.colour;
    ctx.beginPath();
    ctx.arc(px, py, r.isPlayer ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();

    if (r.isPlayer) {
      ctx.strokeStyle = SCENE.minimapPlayerMarker;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}
