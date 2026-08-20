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

/**
 * How steeply the camera looks down, from 0 (as steep as it gets) to 1
 * (today's angle, unchanged). The single source both the backdrop's horizon
 * and the race screen's lane math key off, so they can't drift apart the
 * way `visibleMetres` and the lane geometry once did.
 *
 * A flat camera angle read fine on anything tall enough to leave hundreds of
 * pixels of ground below the horizon, but on a short canvas — a landscape
 * phone above all, plenty of width, very little height — that same angle
 * left almost no vertical room for the eight lanes to spread into below it.
 * Found in play: "the horses stack but not flat," a request for a camera
 * that looks down on the group more steeply once height is scarce, trading
 * sky for ground rather than shrinking the lanes further. Tilts continuously
 * by height rather than switching on an orientation flag, so it also helps a
 * squat split-screen window or a foldable's cover display without a new
 * case. Unchanged at/above REFERENCE_HEIGHT — desktop and tablets keep
 * today's framing exactly.
 */
const REFERENCE_HEIGHT = 650;

export function cameraTilt(height: number): number {
  return Math.min(1, Math.max(0, height / REFERENCE_HEIGHT));
}

const HORIZON_FRACTION_TALL = 0.44;
const HORIZON_FRACTION_SHORT = 0.16;

export function horizonY(height: number): number {
  const t = cameraTilt(height);
  const fraction =
    HORIZON_FRACTION_SHORT + (HORIZON_FRACTION_TALL - HORIZON_FRACTION_SHORT) * t;
  return height * fraction;
}

export function metreToScreen(metres: number, cam: Camera): number {
  return (metres - cam.scrollMetres) * cam.pixelsPerMetre;
}

/** A deterministic pseudo-random, so scenery doesn't shimmer between frames. */
const noise = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

// ---- Hand-drawn backdrop art -----------------------------------------------
//
// Optional real art over the procedural bands above. Loaded once, cached, and
// drawn only once ready — every band still has its procedural version as a
// fallback, so a race started before loading finishes (or if it fails) still
// renders correctly rather than showing a gap.

interface RaceBackgroundImages {
  skies: HTMLImageElement[];
  crowd: HTMLImageElement;
  grass: HTMLImageElement;
  lowerTrack: HTMLImageElement;
}

let raceBackgroundImages: RaceBackgroundImages | null = null;
let raceBackgroundLoading: Promise<void> | null = null;
/** Which of `skies` this race is using. Picked once per race — see `chooseRaceSky`. */
let raceSkyIndex = 0;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/**
 * Loads the hand-drawn race backdrop art once. Safe to call from multiple
 * screens (raceIntro, raceScreen) — cached after the first call, and each
 * caller can fire-and-forget it since `drawBackdrop` picks the art up
 * automatically as soon as it's ready.
 */
export function loadRaceBackgroundImages(): Promise<void> {
  if (raceBackgroundImages) return Promise.resolve();
  if (raceBackgroundLoading) return raceBackgroundLoading;

  raceBackgroundLoading = (async () => {
    // Each path is written out in full, inline, rather than built from a
    // shared prefix — Vite's production build only statically detects (and
    // therefore bundles) a `new URL(..., import.meta.url)` call when the
    // whole string is visible right there in the call. A shared variable
    // broke that: every one of these loaded fine from the dev server, which
    // serves raw files with no such analysis, and then 404'd in the actual
    // production build.
    const [daySky, eveningSky, stormySky, crowd, grass, lowerTrack] = await Promise.all([
      loadImage(new URL('../assets/backgrounds/race/day_sky.png', import.meta.url).href),
      loadImage(new URL('../assets/backgrounds/race/evening_sky.png', import.meta.url).href),
      loadImage(new URL('../assets/backgrounds/race/stormy_sky.png', import.meta.url).href),
      loadImage(new URL('../assets/backgrounds/race/crowd.png', import.meta.url).href),
      loadImage(new URL('../assets/backgrounds/race/grass.png', import.meta.url).href),
      loadImage(new URL('../assets/backgrounds/race/lower_track.png', import.meta.url).href),
    ]);
    raceBackgroundImages = { skies: [daySky, eveningSky, stormySky], crowd, grass, lowerTrack };
  })();

  return raceBackgroundLoading;
}

/**
 * Picks which sky this race uses, at random, out of whichever variants have
 * loaded so far. Purely cosmetic — like the training-screen breakthrough
 * roll, this doesn't touch race-affecting state, so it uses `Math.random()`
 * rather than the sim's seeded RNG rather than threading a seed through the
 * renderer for something that can't change the outcome.
 *
 * Call once per race, from raceIntro (which mounts before raceScreen on
 * every path into a race) — calling it from raceScreen too would let the
 * sky change between the intro card and the race itself.
 */
export function chooseRaceSky(): void {
  if (!raceBackgroundImages) return;
  raceSkyIndex = Math.floor(Math.random() * raceBackgroundImages.skies.length);
}

/**
 * Tiles `img` horizontally across `[0, width]` at `y`, scaled so its native
 * height fills `destHeight`. `scrollPx` is world-space scroll in screen
 * pixels — pass a fraction of the camera's actual scroll for anything that
 * should parallax slower than the foreground.
 */
function tileImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  y: number,
  width: number,
  destHeight: number,
  scrollPx: number,
): void {
  const scale = destHeight / img.height;
  const tileWidth = img.width * scale;
  // JS's `%` keeps the dividend's sign, so a negative scrollPx (the camera
  // pins the player ahead of scroll 0, so this is negative for the first
  // few seconds of every race) produced a *positive* offset here — pushing
  // the first tile right instead of wrapping it behind the left edge, which
  // left a gap of raw canvas showing through until the camera caught up.
  // Normalising into (-tileWidth, 0] keeps the first tile flush regardless
  // of scroll direction.
  const offset = -(((scrollPx % tileWidth) + tileWidth) % tileWidth);
  ctx.imageSmoothingEnabled = false;
  for (let x = offset; x < width + tileWidth; x += tileWidth) {
    ctx.drawImage(img, x, y, tileWidth, destHeight);
  }
}

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cam: Camera,
  hype: number,
): void {
  const horizon = horizonY(height);
  // Where pure sky ends and the crowd stand begins. Found in play once the
  // real art was in: the crowd was squeezed into a fixed 58px sliver at the
  // tail of the sky region regardless of screen size, reading as "way too
  // small" next to a full-height sky image, while the sky itself felt like
  // it dominated the frame. Carving real, proportional space for the crowd
  // out of the sky's share fixes both without touching `horizon` itself —
  // drawDistanceMarkers and the race-screen lane math both key off that
  // exact value, so leaving it alone keeps everything below it aligned. Kept
  // as a constant fraction of `horizon` itself, not of `height` directly, so
  // the crowd band stays proportionate even as `horizonY` tilts the camera
  // steeper on a short canvas.
  const skyBottom = horizon * (0.29 / 0.44);

  if (raceBackgroundImages) {
    const sky = raceBackgroundImages.skies[raceSkyIndex] ?? raceBackgroundImages.skies[0]!;
    // Barely parallaxes — the sky is the furthest thing in the scene.
    tileImage(ctx, sky, 0, width, skyBottom, cam.scrollMetres * cam.pixelsPerMetre * 0.05);
  } else {
    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, SCENE.skyTop);
    sky.addColorStop(1, SCENE.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, horizon);

    // Distant hills, parallaxed slowly so there is depth without distraction.
    // Only drawn procedurally — the real sky art already carries its own
    // horizon detail (low clouds), so this would double up once it's loaded.
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
  }

  drawCrowd(ctx, width, horizon, skyBottom, cam, hype);
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
  skyBottom: number,
  cam: Camera,
  hype: number,
): void {
  if (raceBackgroundImages) {
    // Fills the real, proportional gap between sky and horizon carved out in
    // drawBackdrop, not the old fixed-58px sliver the procedural version
    // below still uses — that was sized for a thin decorative band, not a
    // textured image that needs real room to read at a glance.
    tileImage(
      ctx,
      raceBackgroundImages.crowd,
      skyBottom,
      width,
      horizon - skyBottom,
      // Same parallax rate the procedural heads below used to scroll at, so
      // swapping the art in doesn't change how the crowd feels to look at.
      cam.scrollMetres * cam.pixelsPerMetre * 0.35,
    );
    return;
  }

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
  const trackTop = horizon + height * 0.09;

  if (raceBackgroundImages) {
    const scrollPx = cam.scrollMetres * cam.pixelsPerMetre;
    // Full scroll rate — this is the same near-ground plane the horses run
    // on, not a distant layer that should parallax slower.
    //
    // Hayden's call: this is a turf race, so grass.png IS the running
    // surface — tiled across the whole span below the horizon, not just the
    // thin strip beyond it. lower_track.png (dirt) stays loaded for a future
    // dirt-track venue but isn't drawn here.
    tileImage(ctx, raceBackgroundImages.grass, horizon, width, height - horizon, scrollPx);
    return;
  }

  // Far turf, beyond the running surface.
  ctx.fillStyle = SCENE.turfFar;
  ctx.fillRect(0, horizon, width, height * 0.09);

  // The running surface.
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
  const horizon = horizonY(height);
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
