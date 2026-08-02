import { createSurface, startLoop, type Loop, type Surface } from '../render/canvas.js';
import { drawHorse, drawHorseShadow } from '../render/horse.js';
import { drawSpriteHorse, loadSprites } from '../render/spriteHorse.js';
import { RIVAL_SILKS, type Silks } from '../render/palette.js';
import {
  drawBackdrop,
  drawDistanceMarkers,
  drawMinimap,
  yardToScreen,
  type Camera,
} from '../render/track.js';
import { createAiController } from '../sim/race/ai.js';
import { createRace, type LiveRace, type RaceSnapshot, type RunnerSnapshot } from '../sim/race/engine.js';
import { CHARGE_CAPACITY, MOMENT_WINDOWS, TICK_HZ } from '../sim/race/constants.js';
import { buildRecap, recapRows, type Pace, type Recap, type RecapRow } from '../sim/race/recap.js';
import type {
  ControlInput,
  RaceConfig,
  RaceEntrant,
} from '../sim/race/types.js';
import type { Horse } from '../sim/types.js';

/**
 * The race screen.
 *
 * Owns the loop, the camera, the HUD and the DRIVE control. Reads simulation
 * state and draws it; never writes back except through the player's control
 * input, which is just another controller as far as the engine is concerned.
 */

const YARDS_PER_FURLONG = 220;

/**
 * A horse is about 2.7 yards nose to tail, and the rig is drawn 100 local units
 * long. Tying the two together is what stops the treadmill effect: previously
 * the horse was drawn roughly eight times too big for the track scale, so it
 * crossed barely one body length a second while its legs cycled three times.
 */
const HORSE_YARDS = 2.7;
const RIG_UNITS = 100;

/**
 * Yards covered per stride. Real gallop is ~3 body lengths.
 *
 * Stride RATE is speed divided by this: 8.1 yards against the sim's own speed
 * gives ~2.3 cycles a second once TIME_SCALE (`sim/race/constants.ts`)
 * corrects the clock — matching a real gallop, and landing at about 55 sprite
 * frames a second on a 60 Hz display, under the refresh rate so the cycle
 * plays whole rather than strobing.
 *
 * This used to carry its own inflation factor to divide the sim's known-fast
 * clock back out. Now that the clock is corrected at the source (the sim's own
 * BASE_SPEED, BASE_DRAIN etc. are scaled by TIME_SCALE), a genuine speed value
 * arrives here and this is just the real number — nothing left to compensate.
 */
const STRIDE_YARDS = HORSE_YARDS * 3;

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
 * Speed a finished horse settles to after the wire, in yards/sec.
 *
 * Non-zero on purpose: the stride rate is derived from speed, so a horse that
 * decays to a standstill also freezes its own gait, and the sheet holds whatever
 * gallop frame it happened to land on. Walking on keeps the cycle turning over.
 */
const PULL_UP_WALK = 1.9;

/**
 * Sprite pixels per rig unit, so both draw the same horse at the same size.
 *
 * The rig spans about 123 of its own units nose to tail-tip; the sprite spans
 * about 181 pixels across the same animal. Scaling the sprite by the rig's
 * scale alone would draw it half again too big.
 */
const SPRITE_PER_RIG_UNIT = 123 / 181;

/**
 * How much bigger than life the horses are drawn.
 *
 * Strictly, a horse should span exactly its own 2.7 yards of track, and that is
 * what the scale chain below computes. Drawn honestly it is also small: with 46
 * yards across the screen a horse is about a seventeenth of the width, and on a
 * phone that is a smudge with a coloured dot on top — you cannot read your silks
 * or tell a bay from a dark bay, which is most of what the art is for.
 *
 * So they are deliberately oversized. It is a legibility cheat, not a bug, and
 * it is a single number so it can be argued with.
 */
const HORSE_SCALE = 1.55;

/** Track sections, by the leader's progress. Each fires once. */
const CALLOUTS = [
  { at: 0.24, text: 'Down the backstretch' },
  { at: 0.56, text: 'Round the turn' },
  { at: 0.84, text: 'Down the stretch!' },
] as const;

interface PlayerInput {
  /** Hold to take a pull — settle back below cruise, regen faster. */
  takingBack: boolean;
  /** Set by a tap; consumed by the controller the next tick it reads it. */
  kickPending: boolean;
}

export interface RaceScreenOptions {
  host: HTMLElement;
  field: Horse[];
  playerHorseId: string;
  playerSilks: Silks;
  config: RaceConfig;
  onFinish?: (placings: RunnerSnapshot[]) => void;
}

export function mountRaceScreen(opts: RaceScreenOptions): () => void {
  const { host, field, playerHorseId, playerSilks, config } = opts;

  const surface = createSurface(host);
  // Decoding and tinting happen off the critical path; the rig covers the
  // opening frames, so a race never waits on the art.
  void loadSprites();
  const input: PlayerInput = {
    takingBack: false,
    kickPending: false,
  };

  const playerHorse = field.find((h) => h.id === playerHorseId)!;
  const [playerMomentLo, playerMomentHi] = MOMENT_WINDOWS[playerHorse.moment];

  /**
   * The player's jockey rides the horse exactly as the AI would by default —
   * establishing position, holding it, then committing down the stretch —
   * the same competent ride "hand it to your jockey" auto-race gets
   * (DESIGN.md §4). Input MODULATES that ride rather than replacing it:
   *
   *   nothing   ride to style, establishing and committing like any AI horse
   *   tap       spend one kick charge — the only way to push beyond that, at
   *             any point in the race, not just the finish
   *   hold      take a pull — settle back below the AI's own ride, regen faster
   *
   * Without this the player rode a permanently flat cruise while the AI field
   * ramped to its stretch commitment around it — a fixed ~11% top-speed
   * deficit (MIN_EFFORT_SPEED) that the kick's +8.5% at most cannot buy back,
   * regardless of how well it's timed. Positioning was already the jockey's
   * automatic job (no player steering); there was never a design reason for
   * pace commitment to be the one piece withheld from an otherwise-competent
   * default ride.
   */
  const baseRide = createAiController(playerHorse);

  const entrants: RaceEntrant[] = field.map((horse) => {
    if (horse.id !== playerHorseId) return { horse };
    return {
      horse,
      controller: (self, race): ControlInput => {
        const base = baseRide(self, race);

        const effort = input.takingBack ? Math.min(base.effort, 0.26) : base.effort;
        const targetLane = base.targetLane;

        const kick = input.kickPending;
        input.kickPending = false;

        return { effort, kick, targetLane };
      },
    };
  });

  const race: LiveRace = createRace(entrants, config);
  const totalYards = race.totalYards;

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
  let callout = '';
  let calloutUntil = 0;
  let finishedAt = 0;
  // Built once at the wire. The finish screen redraws every frame and
  // race.outcome() re-sorts and re-measures the whole field each call.
  let finalRecap: Recap | null = null;
  let finalRows: RecapRow[] | null = null;
  /** Races wait for you rather than starting the moment the page loads. */
  let started = false;
  const firedCallouts = new Set<string>();

  const cam: Camera = { scrollYards: 0, pixelsPerYard: 1.6 };

  const tick = (): void => {
    if (!started || !running) return;
    prev = curr;
    running = race.step();
    curr = race.snapshot();

    for (const e of curr.fresh) {
      if (e.kind === 'phase' && e.detail) setCallout(e.detail);
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
        (a, b) => (a.finishTime ?? 1e9) - (b.finishTime ?? 1e9) || b.distance - a.distance,
      );
      opts.onFinish?.(placings);
    }
  };

  const setCallout = (text: string): void => {
    callout = text;
    calloutUntil = performance.now() + 2200;
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
    const visibleYards = 46;
    cam.pixelsPerYard = width / visibleYards;

    const target = player.distance - (width * 0.36) / cam.pixelsPerYard;
    cam.scrollYards += (target - cam.scrollYards) * 0.1;

    drawBackdrop(ctx, width, height, cam, config.hype);
    drawDistanceMarkers(ctx, height, cam, totalYards);

    // Lane 0 is the rail (furthest from camera), so higher lanes draw nearer
    // and larger. Sorting by lane keeps the overlap correct.
    const laneY = (lane: number): number => height * 0.58 + lane * (height * 0.055);
    // A horse is HORSE_YARDS long, full stop. Perspective only nudges it.
    const baseScale = (HORSE_YARDS * cam.pixelsPerYard * HORSE_SCALE) / RIG_UNITS;
    const laneScale = (lane: number): number => baseScale * (0.88 + lane * 0.04);

    for (const r of [...runners].sort((a, b) => a.lane - b.lane)) {
      const pu0 = pullUp.get(r.id);
      const x = yardToScreen(r.distance + (pu0?.extra ?? 0), cam);
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

      const strideRate = Math.min(drawSpeed / STRIDE_YARDS, MAX_STRIDE_RATE);
      const phase = ((stride.get(r.id) ?? 0) + strideRate * dt) % 1;
      stride.set(r.id, phase);

      const isPlayer = r.id === playerHorseId;

      // Spotlight the player's horse on the track itself — a small arrow above
      // it was far too easy to lose in a pack of eight.
      if (isPlayer) {
        ctx.save();
        const glow = ctx.createRadialGradient(x, y - 8, 4, x, y - 8, 70 * (scale / baseScale) + 46);
        glow.addColorStop(0, 'rgba(242,193,78,0.30)');
        glow.addColorStop(1, 'rgba(242,193,78,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y - 8, 70 * (scale / baseScale) + 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      drawHorseShadow(ctx, x, y + 2, scale);

      // The sprite sheet is the shipping art. The drawn rig stays behind it as
      // the fallback for the frames before the sheet has decoded, and for the
      // poses the sheet does not contain — standing at the gate.
      //
      // Crossing the wire is NOT one of those poses. Dropping the sheet at the
      // line swapped the horse for the rig mid-stride, in the one moment the
      // player is looking straight at it, and it read as the model resetting.
      // A horse pulling up is still galloping, decaying to a canter — which is
      // exactly what the sheet run at a decaying stride rate already shows.
      const drewSprite = drawSpriteHorse(ctx, x, y, {
        coat: r.coat,
        silks: silksFor.get(r.id)!,
        phase,
        scale: scale * SPRITE_PER_RIG_UNIT,
      });

      if (!drewSprite) {
        drawHorse(ctx, x, y, {
          coat: r.coat,
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
        const markerY = y - 118 * scale;
        const bounce = Math.sin(performance.now() / 260) * 3;

        ctx.fillStyle = '#F2C14E';
        ctx.beginPath();
        ctx.moveTo(x, markerY + bounce);
        ctx.lineTo(x - 9, markerY - 13 + bounce);
        ctx.lineTo(x + 9, markerY - 13 + bounce);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#F2C14E';
        ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('YOU', x, markerY - 19 + bounce);
      }
    }

    drawHud(ctx, width, height, player, runners);
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
    const remainingYards = Math.max(0, totalYards - player.distance);
    const furlongs = remainingYards / YARDS_PER_FURLONG;
    ctx.fillStyle = 'rgba(14,18,24,0.72)';
    roundRect(ctx, pad, pad, 168, 46, 10);
    ctx.fill();

    ctx.fillStyle = '#8B98A9';
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TO GO', pad + 12, pad + 18);

    ctx.fillStyle = '#E8EDF4';
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.fillText(
      furlongs >= 1 ? `${furlongs.toFixed(1)}f` : `${Math.round(remainingYards)} yd`,
      pad + 12,
      pad + 38,
    );

    ctx.fillStyle = '#8B98A9';
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${ordinal(player.rank)} of ${runners.length}`, pad + 156, pad + 38);

    // ---- Race progress, with YOUR MOMENT marked on it ----------------------
    // Without this you cannot see when your horse's window is, which makes the
    // single most important decision in the race pure guesswork.
    const pw = Math.min(340, width - 220);
    const px0 = (width - pw) / 2;
    const py0 = pad + 6;

    ctx.fillStyle = 'rgba(14,18,24,0.72)';
    roundRect(ctx, px0, py0, pw, 22, 11);
    ctx.fill();

    ctx.fillStyle = 'rgba(242,193,78,0.30)';
    roundRect(
      ctx,
      px0 + 3 + (pw - 6) * playerMomentLo,
      py0 + 3,
      (pw - 6) * (playerMomentHi - playerMomentLo),
      16,
      6,
    );
    ctx.fill();

    const prog = Math.min(1, player.distance / totalYards);
    ctx.fillStyle = '#E8EDF4';
    const dotX = px0 + 3 + (pw - 6) * prog;
    ctx.beginPath();
    ctx.arc(dotX, py0 + 11, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8B98A9';
    ctx.font = '600 9.5px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'YOUR MOMENT',
      px0 + 3 + (pw - 6) * ((playerMomentLo + playerMomentHi) / 2),
      py0 + 34,
    );

    // ---- Minimap ----------------------------------------------------------
    drawMinimap(
      ctx,
      width - pad - 84,
      pad,
      84,
      56,
      runners.map((r) => ({
        progress: Math.min(1, r.distance / totalYards),
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

    ctx.fillStyle = 'rgba(14,18,24,0.72)';
    roundRect(ctx, barX, barY, barW, 26, 13);
    ctx.fill();

    const LABEL_FONT = '700 11px ui-sans-serif, system-ui, sans-serif';
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(233,238,245,0.92)';
    ctx.fillText('CHARGES', barX + 12, barY + 17);

    const dotR = 6;
    const dotGap = 20;
    const dotsY = barY + 13;
    const dotsX0 = barX + 12 + ctx.measureText('CHARGES').width + 20;
    for (let i = 0; i < CHARGE_CAPACITY; i++) {
      const x = dotsX0 + i * dotGap;
      ctx.beginPath();
      ctx.arc(x, dotsY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i < player.kicksRemaining ? '#F2C14E' : 'rgba(139,152,169,0.3)';
      ctx.fill();

      if (i === player.kicksRemaining && player.kicksRemaining < CHARGE_CAPACITY) {
        ctx.beginPath();
        ctx.moveTo(x, dotsY);
        ctx.arc(x, dotsY, dotR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.chargeProgress);
        ctx.closePath();
        ctx.fillStyle = 'rgba(242,193,78,0.55)';
        ctx.fill();
      }
    }

    // The window still marks where a kick lands hardest (timing decides its
    // strength), but it no longer gates WHETHER you can fire one — that's
    // kicksRemaining now, a charge you can spend early for position or hold
    // for the finish.
    const inWindow = curr.progress >= playerMomentLo && curr.progress <= playerMomentHi;
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'right';
    // What YOU are doing outranks what the race is doing to you: those states
    // are transient, deliberate, and the moment you need to act on.
    if (input.takingBack) {
      ctx.fillStyle = '#4EC9A0';
      ctx.fillText('TAKING A PULL', barX + barW - 12, barY + 17);
    } else if (inWindow && player.kicksRemaining > 0) {
      ctx.fillStyle = '#F2C14E';
      ctx.fillText('YOUR MOMENT', barX + barW - 12, barY + 17);
    }

    // ---- Call-outs ---------------------------------------------------------
    if (performance.now() < calloutUntil && callout) {
      ctx.fillStyle = 'rgba(242,193,78,0.95)';
      ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(callout, width / 2, height * 0.2);
    }

    if (!started) drawStart(ctx, width, height);
    else if (!running) drawFinish(ctx, width, height, player);
  };

  /** Pre-race card, so a race begins when you are ready rather than on load. */
  const drawStart = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
    ctx.fillStyle = 'rgba(14,18,24,0.82)';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#E8EDF4';
    ctx.font = '800 26px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(playerHorse.name, cx, cy - 46);

    ctx.fillStyle = '#8B98A9';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(
      `${config.furlongs}f · ${config.going} going · field of ${field.length}`,
      cx,
      cy - 24,
    );

    ctx.fillStyle = '#F2C14E';
    roundRect(ctx, cx - 82, cy + 2, 164, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#12222B';
    ctx.font = '800 15px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('START RACE', cx, cy + 30);

    ctx.fillStyle = 'rgba(139,152,169,0.85)';
    ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Tap to KICK · hold to TAKE A PULL', cx, cy + 70);
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
    ctx.fillStyle = 'rgba(14,18,24,0.9)';
    ctx.fillRect(0, 0, width, height);

    const recap = finalRecap ?? (finalRecap = buildRecap(race.outcome(), playerHorseId, playerHorse.style));
    const rows = finalRows ?? (finalRows = recapRows(race.outcome(), playerHorseId));

    const won = player.rank === 1;
    const cx = width / 2;
    const panel = Math.min(420, width - 32);
    const rowH = 24;
    const visible = Math.min(rows.length, 8);

    // Lay the whole thing out first so it can be centred as one block, however
    // many reasons the race produced.
    ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
    const storyLines: string[] = [];
    for (const line of recap.story) wrapText(ctx, line, panel - 24, storyLines);

    const blockH = 40 + 22 + storyLines.length * 19 + 18 + visible * rowH + 26;
    let y = Math.max(56, (height - blockH) / 2);

    // ---- Headline ----------------------------------------------------------
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? '#F2C14E' : '#E8EDF4';
    ctx.font = '800 30px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(recap.headline, cx, y + 28);
    y += 40;

    ctx.fillStyle = won ? 'rgba(242,193,78,0.8)' : '#8B98A9';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(recap.margin, cx, y + 14);
    y += 22;

    // ---- What happened -----------------------------------------------------
    ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#C7D0DC';
    for (const line of storyLines) {
      ctx.fillText(line, cx, y + 14);
      y += 19;
    }
    y += 18;

    // ---- Placings ----------------------------------------------------------
    for (let i = 0; i < visible; i++) {
      const r = rows[i]!;
      if (r.isPlayer) {
        ctx.fillStyle = 'rgba(242,193,78,0.14)';
        roundRect(ctx, cx - panel / 2, y - 1, panel, rowH - 3, 7);
        ctx.fill();
      }

      ctx.fillStyle = r.isPlayer ? '#F2C14E' : '#8B98A9';
      ctx.font = `${r.isPlayer ? 700 : 500} 13px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(String(r.position), cx - panel / 2 + 12, y + 14);
      ctx.fillText(r.name, cx - panel / 2 + 34, y + 14);

      // The margin matters more than the clock — a race is won by lengths.
      ctx.textAlign = 'right';
      ctx.fillStyle = r.isPlayer ? 'rgba(242,193,78,0.8)' : 'rgba(139,152,169,0.75)';
      ctx.fillText(r.margin, cx + panel / 2 - 74, y + 14);
      ctx.fillStyle = r.isPlayer ? 'rgba(242,193,78,0.55)' : 'rgba(139,152,169,0.45)';
      ctx.fillText(r.time, cx + panel / 2 - 12, y + 14);
      y += rowH;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(139,152,169,0.75)';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`${paceLabel(recap.pace)} · New race to run again`, cx, y + 20);
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
    input.kickPending = true;
  };

  const down = (e: Event): void => {
    e.preventDefault();
    if (!started) {
      started = true;
      pressedAt = 0;
      return;
    }
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
  };

  host.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  const key = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (e.type !== 'keydown') return;
      if (!started) started = true;
      else tap();
    }
    if (e.code === 'ArrowDown' || e.code === 'ShiftLeft') {
      e.preventDefault();
      input.takingBack = e.type === 'keydown';
    }
  };
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);

  const loop: Loop = startLoop(TICK_HZ, tick, draw);

  return (): void => {
    loop.stop();
    surface.destroy();
    window.clearTimeout(holdTimer);
    host.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('keydown', key);
    window.removeEventListener('keyup', key);
  };
}

/** How the race was run, in three words, under the placings. */
function paceLabel(pace: Pace): string {
  if (pace === 'collapsed') return 'Pace: went too fast';
  if (pace === 'crawl') return 'Pace: run at a crawl';
  return 'Pace: evenly run';
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
  const words = text.split(' ');
  let line = '';
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

/** FNV-1a, so a horse's id maps to the same silks in every race it runs. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
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
