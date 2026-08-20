import {
  createSurface,
  startLoop,
  type Loop,
  type Surface,
} from "../render/canvas.js";
import { drawHorse } from "../render/horse.js";
import {
  coatForHorse,
  hashId,
  RIVAL_SILKS,
  SKIN_TONES,
  UI,
  type Coat,
  type Silks,
} from "../render/palette.js";
import { loadFrameSequence, drawFrame } from "../render/frameAnimation.js";
import {
  drawBackdrop,
  drawDistanceMarkers,
  drawMinimap,
  loadRaceBackgroundImages,
  metreToScreen,
  type Camera,
} from "../render/track.js";
import {
  createRace,
  type LiveRace,
  type RaceSnapshot,
  type RunnerSnapshot,
} from "../sim/race/engine.js";
import {
  buildRecap,
  recapRows,
  type Pace,
  type Recap,
  type RecapRow,
} from "../sim/race/recap.js";
import type {
  PlayerInput,
  RaceConfig,
  RaceEntrant,
} from "../sim/race/types.js";
import { CHARGE_CAPACITY, LANE_COUNT, TICK_HZ } from "../sim/race/constants.js";
import type { Horse } from "../sim/types.js";
import { attachInfoBox } from "./infoBox.js";

/**
 * The race screen.
 *
 * Owns the loop, the camera, the HUD and the DRIVE control. Reads simulation
 * state and draws it; never writes back except through the player's control
 * input, which is just another controller as far as the engine is concerned.
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
 * Sprite pixels per rig unit, so both draw the same horse at the same size.
 *
 * The rig spans about 123 of its own units nose to tail-tip; the sprite spans
 * about 181 pixels across the same animal. Scaling the sprite by the rig's
 * scale alone would draw it half again too big.
 */

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
 * Pixels of horizontal fan-out per lane step, decided in ROADMAP.md's
 * "bunched field renders as one illegible blob" entry.
 *
 * At the start, before real gaps exist, every runner sits at nearly
 * identical race-distance x with no separation but a ~1% size difference
 * per lane — eight horses render as one stacked column. This fans lanes
 * out symmetrically around the true x instead, so the pack reads as eight
 * runners in parallel lanes from the gate. It is small enough to stay
 * unnoticeable once the field spreads out for real.
 */
const LANE_X_SPREAD = 32;

/** Track sections, by the leader's progress. Each fires once. */
const CALLOUTS = [
  { at: 0.24, text: "Down the backstretch" },
  { at: 0.56, text: "Round the turn" },
  { at: 0.84, text: "Down the stretch!" },
] as const;

function skinToneFor(id: string): string {
  const hash = hashId(id);
  return SKIN_TONES[hash % SKIN_TONES.length]!.hex;
}

export interface RaceScreenOptions {
  host: HTMLElement;
  field: Horse[];
  playerHorseId: string;
  playerSilks: Silks;
  config: RaceConfig;
  autopilotToggle?: HTMLInputElement;
  skipToggle?: HTMLButtonElement;
  autoRaceToggle?: HTMLButtonElement;
  onRaceStart?: () => void;
  onFinish?: (placings: RunnerSnapshot[]) => void;
  autoStartCountdown?: boolean;
}

export function mountRaceScreen(opts: RaceScreenOptions): () => void {
  const {
    host,
    field,
    playerHorseId,
    playerSilks,
    config,
    autopilotToggle,
    skipToggle,
    autoRaceToggle,
    onRaceStart,
    autoStartCountdown,
  } = opts;

  // Read autopilot state from toggle element when race starts, not when button clicked
  const getAutopilot = (): boolean => autopilotToggle?.checked ?? false;

  const surface = createSurface(host);
  let frameSequence: Awaited<ReturnType<typeof loadFrameSequence>> | null =
    null;
  void loadFrameSequence("east-run", 8).then((seq) => {
    frameSequence = seq;
  });
  void loadRaceBackgroundImages();
  const input: PlayerInput = {
    takingBack: false,
    kickPending: false,
  };

  const playerHorse = field.find((h) => h.id === playerHorseId)!;

  const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
  const race: LiveRace = createRace(entrants, config);
  const totalMetres = race.totalMetres;

  // Crowd camera flashes - track active flashes for drawing
  interface Flash {
    x: number;
    y: number;
    age: number;
    duration: number;
  }
  const flashes: Flash[] = [];
  const spawnFlash = (): void => {
    // Random position in crowd area (bleachers above horizon)
    const { width, height } = surface;
    const horizon = height * 0.44;
    const x = Math.random() * width;
    // Crowd is positioned from horizon-58 to horizon, spawn flashes above them
    const y = (horizon - 58) + Math.random() * 58; // Within crowd stand area
    flashes.push({
      x,
      y,
      age: 0,
      duration: 0.15 + Math.random() * 0.1, // 150-250ms
    });
  };

  // The player's horse runs the SAME base ride as every opponent; this input
  // only modulates it (REBUILD.md §11.4). When autopilot is OFF, this input
  // makes a hands-off player competitive rather than a passenger. When ON,
  // we don't register any input and let the race use its own baseRide decision.
  // Register player input only when race starts (not on autopilot).
  let playerInputRegistered = false;

  // Silks belong to the HORSE, not to its position in the field.
  //
  // Assigned by running order, a rival wore blue in one race and green in the
  // next, which makes recognising an old adversary impossible — and Phase 4
  // hangs a permanent rival dossier off exactly that recognition. Deriving the
  // colours from the horse's id instead means a rival keeps its colours for as
  // long as it races. Collisions inside one field still have to be broken,
  // because two runners in identical silks is the very thing silks exist to
  // prevent.
  const silksFor = new Map<string, Silks>();
  const taken = new Set<number>();
  for (const h of field) {
    if (h.id === playerHorseId) {
      silksFor.set(h.id, playerSilks);
      continue;
    }
    let slot = hashId(h.id) % RIVAL_SILKS.length;
    while (taken.has(slot)) slot = (slot + 1) % RIVAL_SILKS.length;
    taken.add(slot);
    silksFor.set(h.id, RIVAL_SILKS[slot]!);
  }

  // `coatForHorse` derives a genotype and checks it for flaxen — real work,
  // not a field lookup. This is a 60Hz-times-field-size render loop, so it is
  // resolved once per horse here rather than on every frame it gets drawn.
  const coatOf = new Map<string, Coat | string>();
  for (const h of field) coatOf.set(h.id, coatForHorse(h));

  // Stride phase is visual only, advanced from speed so hooves match the ground.
  const stride = new Map<string, number>();
  for (const h of field) stride.set(h.id, Math.random());

  // Once a horse crosses the line the simulation stops touching it, but its last
  // speed is still set — so the renderer would cycle its legs forever. Finished
  // horses coast on past the wire and pull up instead.
  const pullUp = new Map<string, { extra: number; speed: number }>();

  let prev: RaceSnapshot = race.snapshot();
  let curr: RaceSnapshot = prev;
  let running = true;
  let callout = "";
  let calloutUntil = 0;
  let finishedAt = 0;
  let skipRace = false;
  let autoRaceActive = false;
  // Built once at the wire. The finish screen redraws every frame and
  // race.outcome() re-sorts and re-measures the whole field each call.
  let finalRecap: Recap | null = null;
  let finalRows: RecapRow[] | null = null;
  // Track result row name positions, so a DOM hover target can be laid over
  // each one — the recap is drawn on canvas, which has no hover of its own.
  const resultRowBounds: Map<
    string,
    { top: number; height: number; left: number; width: number }
  > = new Map();
  // One invisible trigger element per horse, positioned over its name each
  // frame. attachInfoBox already knows how to peek-on-hover and pin-on-click;
  // this just gives it something sized and placed correctly to listen on.
  const resultHoverTargets: Map<
    string,
    { trigger: HTMLDivElement; detach: () => void }
  > = new Map();
  /** Races wait for you rather than starting the moment the page loads. */
  let started = false;
  // 3 beats of a second each, then the field breaks and "And they're off!"
  // fires as a normal call-out once the race is actually moving.
  const COUNTDOWN_MS = 3000;
  let countdownEndsAt = 0;
  const firedCallouts = new Set<string>();

  const beginCountdown = (): void => {
    if (started || countdownEndsAt !== 0) return;
    countdownEndsAt = performance.now() + COUNTDOWN_MS;
  };

  const cam: Camera = { scrollMetres: 0, pixelsPerMetre: 1.6 };

  const tick = (): void => {
    if (!started) {
      if (countdownEndsAt !== 0 && performance.now() >= countdownEndsAt) {
        started = true;
        countdownEndsAt = 0;
        // Register player input only if NOT on autopilot and not auto-racing
        if (!getAutopilot() && !playerInputRegistered && !autoRaceActive) {
          playerInputRegistered = true;
          race.setPlayer(playerHorseId, input);
        }
        setCallout("And they're off!");
        onRaceStart?.();
      }
      return;
    }
    if (!running) return;

    // Fast-forward when skipping: run many steps per frame
    const stepsPerFrame = skipRace ? 100 : 1;
    for (let i = 0; i < stepsPerFrame && running; i++) {
      prev = curr;
      running = race.step();
      curr = race.snapshot();
    }

    for (const e of curr.fresh) {
      if (e.kind === "phase" && e.detail) setCallout(e.detail);
    }

    // Each call-out fires ONCE, when the leader first passes that point.
    // Previously they were re-triggered on every tick inside a progress band,
    // which kept pushing the timer forward and left them hanging on screen long
    // after the moment had passed.
    for (const c of CALLOUTS) {
      if (!firedCallouts.has(c.text) && curr.progress >= c.at) {
        firedCallouts.add(c.text);
        setCallout(c.text);
      }
    }

    if (!running && finishedAt === 0) {
      finishedAt = performance.now();
      const placings = [...curr.runners].sort(
        (a, b) =>
          (a.finishTime ?? 1e9) - (b.finishTime ?? 1e9) ||
          b.distance - a.distance,
      );
      // Disable skip and auto-race buttons when race finishes
      if (skipToggle) skipToggle.disabled = true;
      if (autoRaceToggle) autoRaceToggle.disabled = true;
      opts.onFinish?.(placings);
    }
  };

  const setCallout = (text: string): void => {
    callout = text;
    calloutUntil = performance.now() + 2200;
  };

  const drawFlash = (ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, screenWidth: number): void => {
    // Draw a concave diamond (camera flash symbol) with pinched sides
    // Scale size based on screen width: smaller on mobile, larger on desktop
    const size = screenWidth < 600 ? 8 : 6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    // Top point
    ctx.moveTo(x, y - size);
    // Right point (with inward curve)
    ctx.quadraticCurveTo(x + size * 0.6, y, x + size, y);
    // Bottom point (with inward curve)
    ctx.quadraticCurveTo(x, y + size * 0.6, x, y + size);
    // Left point (with inward curve)
    ctx.quadraticCurveTo(x - size * 0.6, y, x - size, y);
    // Back to top (with inward curve)
    ctx.quadraticCurveTo(x, y - size * 0.6, x, y - size);
    ctx.fill();
    ctx.restore();
  };

  const draw = (alpha: number, dt: number): void => {
    const { ctx, width, height } = surface;
    const lerp = (a: number, b: number): number => a + (b - a) * alpha;

    // Interpolated positions, so motion is smooth at any refresh rate.
    const runners = curr.runners.map((r, i) => {
      const p = prev.runners[i];
      return {
        ...r,
        distance: p ? lerp(p.distance, r.distance) : r.distance,
        speed: p ? lerp(p.speed, r.speed) : r.speed,
      };
    });

    const player = runners.find((r) => r.id === playerHorseId)!;

    // Show a fixed window of TRACK, not a fixed number of pixels — so the
    // relationship between a horse's size and the ground it covers stays
    // correct at any screen size. That relationship is what sells the speed.
    // On mobile, reduce visible metres to show horses larger
    const visibleMetres = width < 600 ? 28 : 42;
    cam.pixelsPerMetre = width / visibleMetres;

    const target = player.distance - (width * 0.36) / cam.pixelsPerMetre;
    cam.scrollMetres += (target - cam.scrollMetres) * 0.1;

    drawBackdrop(ctx, width, height, cam, config.hype);
    drawDistanceMarkers(ctx, height, cam, totalMetres);

    // Spawn camera flashes from the crowd
    // Slightly higher spawn rate on mobile for better visibility
    const spawnRate = width < 600 ? 0.45 : 0.4;
    if (Math.random() < spawnRate) {
      spawnFlash();
    }

    // Update and draw camera flashes
    for (let i = flashes.length - 1; i >= 0; i--) {
      const flash = flashes[i]!;
      flash.age += dt;
      if (flash.age > flash.duration) {
        flashes.splice(i, 1);
      } else {
        // Fade in quickly, then fade out
        const progress = flash.age / flash.duration;
        const alpha = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
        drawFlash(ctx, flash.x, flash.y, alpha, width);
      }
    }

    // Lane 0 is the rail (furthest from camera), so higher lanes draw nearer
    // and larger. Sorting by lane keeps the overlap correct.
    const isSmallScreen = width < 600;
    const baseY = isSmallScreen ? height * 0.58 : height * 0.60;
    // The charges bar (drawHud, below) is drawn on top of the horses, near
    // the bottom of the canvas. A fixed height-relative spacing pushed the
    // deepest lane's feet behind it — found in play: the nearest horse's
    // legs read as cut off, worse on mobile because the bar's fixed pixel
    // height eats a bigger share of a shorter canvas. Deriving the spacing
    // from the actual clear space above the bar keeps every lane's feet
    // above it regardless of screen height.
    const reservedBottom = 96;
    const maxLaneY = height - reservedBottom;
    const laneSpacing = Math.min(
      isSmallScreen ? height * 0.0525 : height * 0.055,
      (maxLaneY - baseY) / (LANE_COUNT - 1),
    );
    const laneY = (lane: number): number => baseY + lane * laneSpacing;
    // A horse is HORSE_YARDS long, full stop. Perspective only nudges it.
    const baseScale =
      (HORSE_METRES * cam.pixelsPerMetre * HORSE_SCALE) / RIG_UNITS;
    // Flattened per ROADMAP.md's decision: the backdrop art is flat pixel
    // art with no depth cues, so horses read as same-size runners in
    // parallel lanes rather than leaning into an over-the-shoulder depth
    // cheat. Was 0.88 + lane * 0.04 (a 28% span); shrunk toward 0 and
    // recentred on true scale rather than skewed below it.
    const laneScale = (lane: number): number =>
      baseScale * (0.97 + lane * 0.01);
    const laneXOffset = (lane: number): number =>
      (lane - (LANE_COUNT - 1) / 2) * LANE_X_SPREAD;

    for (const r of [...runners].sort((a, b) => a.lane - b.lane)) {
      const pu0 = pullUp.get(r.id);
      const x =
        metreToScreen(r.distance + (pu0?.extra ?? 0), cam) +
        laneXOffset(r.lane);
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

      const isPlayer = r.id === playerHorseId;

      // drawHorseShadow(ctx, x, y + 8, scale);

      // Draw frame-based animation if loaded, otherwise fall back to procedural rig.
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

      if (isPlayer) {
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

    drawHud(ctx, width, height, player, runners);

    // Update hover triggers over result names once the finish screen is drawn
    if (!running) updateResultHoverTriggers();
  };

  const drawHud = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: RunnerSnapshot,
    runners: RunnerSnapshot[],
  ): void => {
    const pad = 14;

    // ---- Distance remaining ----------------------------------------------
    const remaining = Math.max(0, totalMetres - player.distance);
    ctx.fillStyle = UI.bgOverlay72;
    roundRect(ctx, pad, pad, 168, 46, 10);
    ctx.fill();

    ctx.fillStyle = UI.muted;
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("TO GO", pad + 12, pad + 18);

    ctx.fillStyle = UI.text;
    ctx.font = "700 20px ui-monospace, monospace";
    ctx.fillText(`${Math.round(remaining)} m`, pad + 12, pad + 38);

    ctx.fillStyle = UI.muted;
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      `${ordinal(player.rank)} of ${runners.length}`,
      pad + 156,
      pad + 38,
    );

    // There is deliberately no "your moment" window drawn here. Moment no
    // longer opens a window at all — it selects a pace-curve shape (REBUILD.md
    // §6) — so there is nothing to mark and nothing to mistime.

    // ---- Minimap ----------------------------------------------------------
    drawMinimap(
      ctx,
      width - pad - 84,
      pad,
      84,
      56,
      runners.map((r) => ({
        progress: Math.min(1, r.distance / totalMetres),
        colour: silksFor.get(r.id)!.primary,
        isPlayer: r.id === playerHorseId,
      })),
    );

    // ---- Kick charges — the only resource ----------------------------------
    // Dots show the bank; the wedge on the next empty one shows progress
    // toward it regenerating. Spending one early to fight for a slot is a
    // real choice, so how many are left has to stay visible the whole race,
    // not only revealed at the window.
    const barW = Math.min(320, width - pad * 2);
    const barX = (width - barW) / 2;
    const barY = height - pad - 34;

    // YOUR MOMENT — the one piece of timing information the player rides on.
    // Drawn as the whole bar lighting up rather than a word in a corner: this
    // is the cue to spend, and it has to be visible without being read.
    if (player.inWindow) {
      ctx.save();
      ctx.shadowColor = UI.accentGlowShadow;
      ctx.shadowBlur = 18;
      ctx.fillStyle = UI.accentLight;
      roundRect(ctx, barX, barY, barW, 26, 13);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = UI.accentGlowStrong;
      ctx.lineWidth = 2;
      roundRect(ctx, barX, barY, barW, 26, 13);
      ctx.stroke();

      // A banner above it, so the moment ARRIVING is an event and not just a
      // state you might notice.
      const bannerW = 122;
      const bannerX = (width - bannerW) / 2;
      const bannerY = barY - 26;
      ctx.fillStyle = UI.accent;
      roundRect(ctx, bannerX, bannerY, bannerW, 20, 10);
      ctx.fill();
      ctx.fillStyle = UI.bg;
      ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("YOUR MOMENT", width / 2, bannerY + 14);
    } else {
      ctx.fillStyle = UI.bgOverlay72;
      roundRect(ctx, barX, barY, barW, 26, 13);
      ctx.fill();
    }

    const LABEL_FONT = "700 11px ui-sans-serif, system-ui, sans-serif";
    ctx.font = LABEL_FONT;
    ctx.textAlign = "left";
    ctx.fillStyle = UI.textVariant;
    ctx.fillText("CHARGES", barX + 12, barY + 17);
    const labelW = ctx.measureText("CHARGES").width;

    // ---- Regen indicator ---------------------------------------------------
    // The dots show the bank, but never whether it's currently filling well —
    // position, drafting, and holding all feed the same regen multiplier, and
    // none of that was visible before. 1-3 arrows for low/normal/strong regen,
    // using the dead space this bar already had to spare.
    const ARROW_FONT = "700 9px ui-sans-serif, system-ui, sans-serif";
    ctx.font = ARROW_FONT;
    // How the horse is GOING. The tank itself stays hidden — no stamina bar —
    // but a horse can hold a full bank of charges and still be completely out of
    // petrol, and the player has to be able to see that coming.
    const arrowsMaxW = ctx.measureText("===").width;
    const cond = player.condition;
    const condTier = cond > 0.66 ? 3 : cond > 0.33 ? 2 : 1;
    ctx.fillStyle =
      condTier === 3
        ? UI.condition.good
        : condTier === 2
          ? UI.condition.fair
          : UI.condition.poor;
    ctx.fillText("=".repeat(condTier), barX + 20 + labelW, barY + 17);

    // ---- Drafting indicator ------------------------------------------------
    // Visual cue that the horse is sheltering behind a rival and getting regen bonus.
    if (player.drafting) {
      ctx.fillStyle = UI.draft;
      ctx.font = "700 9px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("◆", barX + 20 + labelW + arrowsMaxW + 6, barY + 17);
    }

    // ---- The charge dots ---------------------------------------------------
    // These ARE the tank, quantised (REBUILD.md §5.5). The hidden budget the
    // whole simulation runs on is read off honestly here, with the wedge on the
    // next empty dot showing progress toward it. The last dot goes out exactly
    // as fatigue starts to bite, so an empty row of dots means a beaten horse.
    const dotR = 6;
    const dotGap = 20;
    const dotsY = barY + 13;
    const dotsX0 = barX + 28 + labelW + arrowsMaxW + 12;

    // A horse cannot lunge twice in the same stride, so a charge you own is not
    // always a charge you can spend. Dimming the whole row while the cooldown
    // runs is what stops a dead tap reading as a broken button.
    const ready = player.kickReady >= 1;

    for (let i = 0; i < CHARGE_CAPACITY; i++) {
      const cx = dotsX0 + i * dotGap;
      const filled = i < player.kicksRemaining;

      ctx.beginPath();
      ctx.arc(cx, dotsY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = filled ? (ready ? UI.accent : UI.accentDim) : UI.mutedDim;
      ctx.fill();

      // The wedge on the first empty dot: how close the next one is.
      if (!filled && i === player.kicksRemaining && player.chargeProgress > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, dotsY);
        ctx.arc(
          cx,
          dotsY,
          dotR,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * player.chargeProgress,
        );
        ctx.closePath();
        ctx.fillStyle = UI.accentMediumStrong;
        ctx.fill();
      }
    }

    // The recharging horse: a sweep across the dot row showing when the next
    // effort can be asked for.
    if (!ready) {
      const sweepW = (CHARGE_CAPACITY - 1) * dotGap + dotR * 2;
      const sweepX = dotsX0 - dotR;
      ctx.fillStyle = UI.mutedVeryDim;
      ctx.fillRect(sweepX, dotsY + dotR + 4, sweepW, 2);
      ctx.fillStyle = UI.accent;
      ctx.fillRect(sweepX, dotsY + dotR + 4, sweepW * player.kickReady, 2);
    }

    ctx.font = LABEL_FONT;
    ctx.textAlign = "right";
    // What the horse is doing right now, most urgent first. The middle two are
    // the ones that used to be invisible: a player could tap into a cooldown or
    // into an exhausted horse and get no explanation for why nothing happened.
    if (input.takingBack) {
      ctx.fillStyle = UI.ok;
      ctx.fillText("TAKING A PULL", barX + barW - 12, barY + 17);
    } else if (player.kicksRemaining === 0) {
      ctx.fillStyle = UI.warning;
      ctx.fillText("NO CHARGES", barX + barW - 12, barY + 17);
    } else if (!ready) {
      ctx.fillStyle = UI.mutedStrong;
      ctx.fillText("GETTING BACK", barX + barW - 12, barY + 17);
    } else if (player.inWindow) {
      ctx.fillStyle = UI.accent;
      ctx.fillText("GO NOW", barX + barW - 12, barY + 17);
    }

    // ---- Call-outs ---------------------------------------------------------
    if (performance.now() < calloutUntil && callout) {
      ctx.fillStyle = UI.accentGlowVeryStrong;
      ctx.font = "700 22px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(callout, width / 2, height * 0.2);
    }

    if (!started) {
      if (countdownEndsAt !== 0) drawCountdown(ctx, width, height);
      else drawStart(ctx, width, height);
    } else if (!running) drawFinish(ctx, width, height, player);
  };

  /** Pre-race card, so a race begins when you are ready rather than on load. */
  const drawStart = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void => {
    ctx.fillStyle = UI.bgOverlay82;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    ctx.textAlign = "center";
    ctx.fillStyle = UI.text;
    ctx.font = "800 26px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(playerHorse.name, cx, cy - 46);

    ctx.fillStyle = UI.muted;
    ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      `${config.metres} m · ${config.going} going · field of ${field.length}`,
      cx,
      cy - 60,
    );

    ctx.fillStyle = UI.accent;
    roundRect(ctx, cx - 82, cy + 2, 164, 44, 22);
    ctx.fill();
    ctx.fillStyle = UI.bg;
    ctx.font = "800 15px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("START RACE", cx, cy + 30);

    ctx.fillStyle = UI.mutedSubtle;
    ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("Tap to KICK · hold to TAKE A PULL", cx, cy + 70);
  };

  /** 3, 2, 1 — covers the gate load so the race doesn't just snap into motion. */
  const drawCountdown = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void => {
    ctx.fillStyle = UI.bgOverlay82;
    ctx.fillRect(0, 0, width, height);

    const msLeft = Math.max(0, countdownEndsAt - performance.now());
    const beat = Math.min(
      3,
      Math.max(1, Math.ceil(msLeft / (COUNTDOWN_MS / 3))),
    );

    ctx.textAlign = "center";
    ctx.fillStyle = UI.accent;
    ctx.font = "800 64px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(String(beat), width / 2, height / 2 + 20);
  };

  /**
   * The recap.
   *
   * A list of names and times tells you that you lost. What decided the race —
   * a collapsing pace, a gap that never came, a reserve you never spent — is
   * the part worth reading, so it is set above the placings rather than below
   * them, and the margins are in lengths because that is what a length is for.
   */
  const drawFinish = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: RunnerSnapshot,
  ): void => {
    ctx.fillStyle = UI.bgOverlay90;
    ctx.fillRect(0, 0, width, height);

    const recap =
      finalRecap ??
      (finalRecap = buildRecap(
        race.outcome(),
        playerHorseId,
        playerHorse.style,
      ));
    const rows =
      finalRows ?? (finalRows = recapRows(race.outcome(), playerHorseId));

    const won = player.rank === 1;
    const cx = width / 2;
    const panel = Math.min(420, width - 32);
    const rowH = 24;
    const visible = Math.min(rows.length, 8);

    // Lay the whole thing out first so it can be centred as one block, however
    // many reasons the race produced.
    ctx.font = "500 13px ui-sans-serif, system-ui, sans-serif";
    const storyLines: string[] = [];
    for (const line of recap.story) wrapText(ctx, line, panel - 24, storyLines);

    const blockH = 40 + 22 + storyLines.length * 19 + 18 + visible * rowH + 26;
    let y = Math.max(56, (height - blockH) / 2);

    // ---- Headline ----------------------------------------------------------
    ctx.textAlign = "center";
    ctx.fillStyle = won ? UI.accent : UI.text;
    ctx.font = "800 30px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(recap.headline, cx, y + 28);
    y += 40;

    ctx.fillStyle = won ? UI.accentGlow : UI.muted;
    ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(recap.margin, cx, y + 14);
    y += 22;

    // ---- What happened -----------------------------------------------------
    ctx.font = "500 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = UI.textMuted;
    for (const line of storyLines) {
      ctx.fillText(line, cx, y + 14);
      y += 19;
    }
    y += 18;

    // ---- Placings ----------------------------------------------------------
    resultRowBounds.clear();
    for (let i = 0; i < visible; i++) {
      const r = rows[i]!;
      if (r.isPlayer) {
        ctx.fillStyle = UI.accentFaint;
        roundRect(ctx, cx - panel / 2, y - 1, panel, rowH - 3, 7);
        ctx.fill();
      }

      ctx.fillStyle = r.isPlayer ? UI.accent : UI.muted;
      ctx.font = `${r.isPlayer ? 700 : 500} 13px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(String(r.position), cx - panel / 2 + 12, y + 14);

      const nameX = cx - panel / 2 + 34;
      const nameWidth = ctx.measureText(r.name).width;
      ctx.fillText(r.name, nameX, y + 14);

      resultRowBounds.set(r.horseId, {
        top: y - 1,
        height: rowH - 3,
        left: nameX,
        width: nameWidth,
      });

      // The margin matters more than the clock — a race is won by lengths.
      ctx.textAlign = "right";
      ctx.fillStyle = r.isPlayer ? UI.accentGlow : UI.mutedSubtle;
      ctx.fillText(r.margin, cx + panel / 2 - 74, y + 14);
      ctx.fillStyle = r.isPlayer ? UI.accentMedium : UI.mutedFaint;
      ctx.fillText(r.time, cx + panel / 2 - 12, y + 14);
      y += rowH;
    }

    ctx.textAlign = "center";
    ctx.fillStyle = UI.mutedSubtle;
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      `${paceLabel(recap.pace)} · New race to run again`,
      cx,
      y + 20,
    );
  };

  // ---- Input --------------------------------------------------------------
  //
  // Tap to spend a kick charge — the only push there is, usable any time you
  // have one left: early to fight for your slot, late for the finish. Hold to
  // take a pull instead. Read `player.kicksRemaining` off the snapshot rather
  // than tracked locally, since it is a resource the engine owns.
  const HOLD_MS = 220; // press longer than this and it's a pull, not a tap

  let pressedAt = 0;
  let holdTimer = 0;

  const tap = (): void => {
    if (!getAutopilot()) input.kickPending = true;
  };

  const down = (e: Event): void => {
    e.preventDefault();
    if (!started) {
      beginCountdown();
      pressedAt = 0;
      return;
    }
    if (getAutopilot()) return;
    pressedAt = performance.now();
    holdTimer = window.setTimeout(() => {
      input.takingBack = true;
    }, HOLD_MS);
  };

  const up = (): void => {
    window.clearTimeout(holdTimer);
    if (pressedAt === 0) return;
    const held = performance.now() - pressedAt;
    input.takingBack = false;
    if (held < HOLD_MS) tap();
    pressedAt = 0; // Reset state for next press
  };

  host.addEventListener("pointerdown", down);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);

  const key = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (e.type !== "keydown") return;
      if (!started) beginCountdown();
      else if (!getAutopilot()) tap();
    }
    if (e.code === "ArrowDown" || e.code === "ShiftLeft") {
      e.preventDefault();
      if (!getAutopilot()) input.takingBack = e.type === "keydown";
    }
  };
  window.addEventListener("keydown", key);
  window.addEventListener("keyup", key);

  // Skip race button
  if (skipToggle) {
    skipToggle.addEventListener("click", () => {
      if (running && started) {
        skipRace = true;
      }
    });
  }

  // Auto-race button
  if (autoRaceToggle) {
    autoRaceToggle.addEventListener("click", () => {
      if (running && started && !getAutopilot()) {
        autoRaceActive = true;
        // Register player input (or rather, stop accepting it and switch to AI)
        if (!playerInputRegistered) {
          playerInputRegistered = true;
          race.setPlayer(playerHorseId, input);
        }
        // Clear any pending player input
        input.kickPending = false;
        input.takingBack = false;
      }
    });
  }

  // Set up invisible hover triggers over result horse names so the info box
  // can peek and pin over them, even though the names are drawn on canvas.
  const updateResultHoverTriggers = (): void => {
    const rect = surface.canvas.getBoundingClientRect();

    for (const [horseId, bounds] of resultRowBounds) {
      let target = resultHoverTargets.get(horseId);
      if (!target) {
        const trigger = document.createElement("div");
        trigger.style.position = "fixed";
        trigger.style.pointerEvents = "auto";
        trigger.style.cursor = "pointer";
        trigger.style.zIndex = "10";
        host.appendChild(trigger);

        const horse = field.find((h) => h.id === horseId);
        if (horse) {
          const detach = attachInfoBox(trigger, horse, silksFor.get(horseId));
          target = { trigger, detach };
          resultHoverTargets.set(horseId, target);
        }
      }

      if (target) {
        target.trigger.style.left = `${rect.left + bounds.left}px`;
        target.trigger.style.top = `${rect.top + bounds.top}px`;
        target.trigger.style.width = `${bounds.width}px`;
        target.trigger.style.height = `${bounds.height}px`;
      }
    }
  };

  const loop: Loop = startLoop(TICK_HZ, tick, draw);

  // Auto-start countdown if requested (e.g., when starting from View Opponents)
  if (autoStartCountdown) {
    console.log('[raceScreen] Auto-starting countdown');
    // Defer slightly to ensure canvas is fully rendered
    setTimeout(() => {
      beginCountdown();
      console.log('[raceScreen] Countdown started');
    }, 100);
  }

  console.log('[raceScreen] Race screen initialized', { autoStartCountdown, loopRunning: !!loop });

  return (): void => {
    loop.stop();
    surface.destroy();
    window.clearTimeout(holdTimer);
    host.removeEventListener("pointerdown", down);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("keydown", key);
    window.removeEventListener("keyup", key);
    for (const { trigger, detach } of resultHoverTargets.values()) {
      detach();
      trigger.remove();
    }
    resultHoverTargets.clear();
  };
}

/** How the race was run, in three words, under the placings. */
function paceLabel(pace: Pace): string {
  if (pace === "collapsed") return "Pace: went too fast";
  if (pace === "crawl") return "Pace: run at a crawl";
  return "Pace: evenly run";
}

/**
 * Break a sentence to a width, appending to `out`.
 *
 * Canvas has no text wrapping of its own, and the recap is prose — a fixed
 * line count would either clip an explanation or leave a hole where a short
 * one was.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  out: string[],
): void {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type { Surface };
