import { drawHorse } from "./horse.js";
import { hashId, SKIN_TONES, UI, type Coat, type Silks } from "./palette.js";
import { loadFrameSequence, drawFrame } from "./frameAnimation.js";
import {
  cameraTilt,
  drawBackdrop,
  drawDistanceMarkers,
  horizonY,
  isLandscape,
  loadRaceBackgroundImages,
  metreToScreen,
  skyBottomY,
  trackTopY,
  type Camera,
} from "./track.js";
import { LANE_COUNT } from "../sim/race/constants.js";
import type { Surface } from "./canvas.js";
import type { RaceView, RaceViewFrame } from "./raceView.js";

/**
 * The side-on 2D race view — the game's original and default look.
 *
 * Lifted out of `ui/raceScreen.ts` unchanged so a second view can exist. Every
 * constant and comment below came across with the code it explains; the
 * numbers were tuned in play and are not to be re-derived.
 */

/**
 * A horse is about 2.47 metres nose to tail, and the rig is drawn 100 local
 * units long. Tying the two together is what stops the treadmill effect:
 * previously the horse was drawn roughly eight times too big for the track
 * scale, so it crossed barely one body length a second while its legs cycled
 * three times.
 *
 * Metres throughout, matching the simulation. There is no conversion boundary
 * anywhere in the game (REBUILD.md §3).
 */
const HORSE_METRES = 2.47;
const RIG_UNITS = 100;

/**
 * Metres covered per stride. A real gallop is ~3 body lengths.
 *
 * Stride RATE is speed divided by this. The simulation's speed is now honest at
 * the source — BASE_SPEED is real metres per second and there is no TIME_SCALE
 * lever to divide back out — so this is simply the real number, with nothing
 * left to compensate for.
 */
const STRIDE_METRES = HORSE_METRES * 3;

/**
 * Ceiling on how often the legs turn over, in stride cycles per second.
 *
 * A galloping horse does not go faster by running its legs quicker. Cadence
 * stays roughly flat across a wide range of speed and the extra ground comes
 * from a LONGER stride — which is why an accelerating horse looks powerful
 * rather than frantic. Deriving the rate from speed alone got that backwards:
 * it held up at the start, then wound tighter and tighter as the field came up
 * to racing pace, until the gait read as a wind-up toy.
 *
 * Capped, extra speed simply slides the horse further per cycle. Set by eye at
 * the size horses actually appear on screen, and deliberately well under the
 * ~2.3 a real thoroughbred turns over at: small and fast reads quicker than
 * life, and at this scale anything near the true cadence looks frantic.
 */
const MAX_STRIDE_RATE = 0.9;

/**
 * Speed a finished horse settles to after the wire, in metres/sec.
 *
 * Non-zero on purpose: the stride rate is derived from speed, so a horse that
 * decays to a standstill also freezes its own gait, and the sheet holds whatever
 * gallop frame it happened to land on. Walking on keeps the cycle turning over.
 */
const PULL_UP_WALK = 1.74;

/**
 * How much bigger than life the horses are drawn.
 *
 * Strictly, a horse should span exactly its own 2.47 metres of track, and that
 * is what the scale chain below computes. Drawn honestly it is also small: with
 * 42 metres across the screen a horse is about a seventeenth of the width, and on a
 * phone that is a smudge with a coloured dot on top — you cannot read your silks
 * or tell a bay from a dark bay, which is most of what the art is for.
 *
 * So they are deliberately oversized. It is a legibility cheat, not a bug, and
 * it is a single number so it can be argued with.
 */
const HORSE_SCALE = 1.55;

/**
 * How far from the left edge the player sits, as a fraction of the
 * screen — the camera's horizontal anchor. Decided in ROADMAP.md's "field
 * spread wastes most of a wide canvas" entry.
 */
const MIN_ANCHOR_FRACTION = 0.22;
const MAX_ANCHOR_FRACTION = 0.7;
const DEFAULT_ANCHOR_FRACTION = 0.36;

/**
 * The rig draws well above its own (x, y) anchor — head, ears and mane reach
 * roughly 132 rig units above the ground point drawHorse is called with,
 * measured empirically rather than derived from the rig's own coordinates,
 * which pass through too many rotations to sum by hand.
 */
const SPRITE_HEADROOM = 132;

function skinToneFor(id: string): string {
  const hash = hashId(id);
  return SKIN_TONES[hash % SKIN_TONES.length]!.hex;
}

interface Flash {
  x: number;
  y: number;
  age: number;
  duration: number;
}

export interface RaceView2dOptions {
  surface: Surface;
  playerHorseId: string;
  silksFor: Map<string, Silks>;
  coatOf: Map<string, Coat | string>;
  totalMetres: number;
  /** Crowd size, straight through to `drawBackdrop`. */
  hype: number;
  horseIds: string[];
}

export function createRaceView2d(opts: RaceView2dOptions): RaceView {
  const { surface, playerHorseId, silksFor, coatOf, totalMetres, hype } = opts;

  let frameSequence: Awaited<ReturnType<typeof loadFrameSequence>> | null = null;
  void loadFrameSequence("east-run", 8).then((seq) => {
    frameSequence = seq;
  });
  void loadRaceBackgroundImages();

  const cam: Camera = { scrollMetres: 0, pixelsPerMetre: 1.6 };

  // Stride phase is visual only, advanced from speed so hooves match the ground.
  const stride = new Map<string, number>();
  for (const id of opts.horseIds) stride.set(id, Math.random());

  // Once a horse crosses the line the simulation stops touching it, but its last
  // speed is still set — so the renderer would cycle its legs forever. Finished
  // horses coast on past the wire and pull up instead.
  const pullUp = new Map<string, { extra: number; speed: number }>();

  const flashes: Flash[] = [];
  const spawnFlash = (): void => {
    const { width, height } = surface;
    const horizon = horizonY(width, height);
    const x = Math.random() * width;
    const y = horizon - 58 + Math.random() * 58;
    flashes.push({ x, y, age: 0, duration: 0.15 + Math.random() * 0.1 });
  };

  const drawFlash = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    alpha: number,
    screenWidth: number,
  ): void => {
    // Draw a concave diamond (camera flash symbol) with pinched sides
    const size = screenWidth < 600 ? 8 : 6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x + size * 0.6, y, x + size, y);
    ctx.quadraticCurveTo(x, y + size * 0.6, x, y + size);
    ctx.quadraticCurveTo(x - size * 0.6, y, x - size, y);
    ctx.quadraticCurveTo(x, y - size * 0.6, x, y - size);
    ctx.fill();
    ctx.restore();
  };

  const render = ({ runners, player, dt }: RaceViewFrame): void => {
    const { ctx, width, height } = surface;

    // Show a fixed window of TRACK, not a fixed number of pixels — so the
    // relationship between a horse's size and the ground it covers stays
    // correct at any screen size. That relationship is what sells the speed.
    const visibleMetres =
      width < 600
        ? 28
        : isLandscape(width, height)
          ? 28 + 14 * cameraTilt(height)
          : 42;
    cam.pixelsPerMetre = width / visibleMetres;

    // How far the rest of the field actually extends beyond the player, in
    // metres each way — the real content the anchor should be pointed at.
    let aheadMetres = 0;
    let behindMetres = 0;
    for (const r of runners) {
      const delta = r.distance - player.distance;
      if (delta > aheadMetres) aheadMetres = delta;
      else if (-delta > behindMetres) behindMetres = -delta;
    }
    const fieldSpan = aheadMetres + behindMetres;
    const anchorFraction =
      fieldSpan > 0
        ? MIN_ANCHOR_FRACTION +
          (MAX_ANCHOR_FRACTION - MIN_ANCHOR_FRACTION) * (behindMetres / fieldSpan)
        : DEFAULT_ANCHOR_FRACTION;

    const target = player.distance - (width * anchorFraction) / cam.pixelsPerMetre;
    cam.scrollMetres += (target - cam.scrollMetres) * 0.1;

    drawBackdrop(ctx, width, height, cam, hype);
    drawDistanceMarkers(ctx, width, height, cam, totalMetres);

    const spawnRate = width < 600 ? 0.45 : 0.4;
    if (Math.random() < spawnRate) spawnFlash();

    for (let i = flashes.length - 1; i >= 0; i--) {
      const flash = flashes[i]!;
      flash.age += dt;
      if (flash.age > flash.duration) {
        flashes.splice(i, 1);
      } else {
        const progress = flash.age / flash.duration;
        const a = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
        drawFlash(ctx, flash.x, flash.y, a, width);
      }
    }

    // Lane 0 is the rail (furthest from camera), so higher lanes draw nearer
    // and larger. Sorting by lane keeps the overlap correct.
    const isSmallScreen = width < 600;
    const landscape = isLandscape(width, height);
    const tilt = cameraTilt(height);
    const baseScale = (HORSE_METRES * cam.pixelsPerMetre * HORSE_SCALE) / RIG_UNITS;
    const baseYFromGap = landscape
      ? horizonY(width, height) + height * (0.03 + 0.02 * tilt)
      : horizonY(width, height) + height * (isSmallScreen ? 0.14 : 0.16);
    const START_LOWER_MARGIN = 40 * tilt;
    const reservedBottom = 96;
    const maxLaneY = height - reservedBottom;
    const desiredBaseY = Math.max(
      baseYFromGap,
      trackTopY(width, height),
      skyBottomY(width, height) + baseScale * (SPRITE_HEADROOM + START_LOWER_MARGIN),
    );
    const MIN_LANE_SPACING = baseScale * 18;
    const latestAffordableBaseY = maxLaneY - MIN_LANE_SPACING * (LANE_COUNT - 1);
    const baseY = Math.max(
      trackTopY(width, height),
      Math.min(desiredBaseY, latestAffordableBaseY),
    );
    const laneSpacing = Math.min(
      landscape ? height * 0.14 : isSmallScreen ? height * 0.0525 : height * 0.055,
      (maxLaneY - baseY) / (LANE_COUNT - 1),
    );
    const laneY = (lane: number): number => baseY + lane * laneSpacing;
    const laneScale = (lane: number): number => baseScale * (0.97 + lane * 0.01);

    for (const r of [...runners].sort((a, b) => a.lane - b.lane)) {
      const pu0 = pullUp.get(r.id);
      const x = metreToScreen(r.distance + (pu0?.extra ?? 0), cam);
      if (x < -140 || x > width + 140) continue;

      const y = laneY(r.lane);
      const scale = laneScale(r.lane);

      // Stride is driven by DISTANCE COVERED, not by frame count. Hooves stay
      // planted on the ground instead of spinning, and the gait runs at the
      // same rate regardless of refresh rate.
      let drawSpeed = r.speed;
      if (r.finished) {
        const pu = pullUp.get(r.id) ?? { extra: 0, speed: r.speed };
        // Pull up to a WALK, not to a standstill. Decaying to zero froze the
        // stride rate at zero with it, leaving the horse as a statue held in a
        // mid-gallop frame — the same "reset" read, arriving two seconds later.
        pu.speed = Math.max(PULL_UP_WALK, pu.speed - 11 * dt);
        pu.extra += pu.speed * dt;
        pullUp.set(r.id, pu);
        drawSpeed = pu.speed;
      }

      const strideRate = Math.min(drawSpeed / STRIDE_METRES, MAX_STRIDE_RATE);
      const phase = ((stride.get(r.id) ?? 0) + strideRate * dt) % 1;
      stride.set(r.id, phase);

      if (frameSequence) {
        drawFrame(ctx, x, y, frameSequence, {
          phase,
          scale: scale * 2.2,
          scheme: {
            coat: coatOf.get(r.id)!,
            silks: silksFor.get(r.id)!,
            jockeySkin: skinToneFor(r.id),
          },
        });
      } else {
        drawHorse(ctx, x, y, {
          coat: coatOf.get(r.id)!,
          silks: silksFor.get(r.id)!,
          pose: {
            phase,
            intensity: Math.min(1, Math.max(0, (drawSpeed - 18) / 14)),
            drive: r.finished ? 0 : r.effort,
          },
          scale,
          faded: false,
        });
      }

      if (r.id === playerHorseId) {
        const markerY = y - 180 * scale;
        const bounce = Math.sin(performance.now() / 260) * 3;

        ctx.fillStyle = UI.accent;
        ctx.beginPath();
        ctx.moveTo(x, markerY + bounce);
        ctx.lineTo(x - 9, markerY - 13 + bounce);
        ctx.lineTo(x + 9, markerY - 13 + bounce);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = UI.accent;
        ctx.font = "700 12px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("YOU", x, markerY - 19 + bounce);
      }
    }
  };

  return {
    render,
    dispose: () => {
      flashes.length = 0;
      stride.clear();
      pullUp.clear();
    },
  };
}
