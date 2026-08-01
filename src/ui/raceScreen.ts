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
import { STYLE_PROFILES, TICK_HZ } from '../sim/race/constants.js';
import { buildRecap, recapRows, type Pace, type Recap, type RecapRow } from '../sim/race/recap.js';
import type { ControlInput, RaceConfig, RaceEntrant } from '../sim/race/types.js';
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

/** Yards covered per stride. Real gallop is ~3 body lengths. */
const STRIDE_YARDS = HORSE_YARDS * 3;

/**
 * Sprite pixels per rig unit, so both draw the same horse at the same size.
 *
 * The rig spans about 123 of its own units nose to tail-tip; the sprite spans
 * about 181 pixels across the same animal. Scaling the sprite by the rig's
 * scale alone would draw it half again too big.
 */
const SPRITE_PER_RIG_UNIT = 123 / 181;

/** Track sections, by the leader's progress. Each fires once. */
const CALLOUTS = [
  { at: 0.24, text: 'Down the backstretch' },
  { at: 0.56, text: 'Round the turn' },
  { at: 0.84, text: 'Down the stretch!' },
] as const;

/**
 * Ceiling on the default ride — and it sits BELOW the simulation's break-even.
 *
 * Energy is the player's resource; the HUD calls it "your moment". An automatic
 * ride that can empty the tank before that moment arrives leaves them a bar to
 * watch instead of a decision to make, and that is exactly what happened: the
 * cap was 0.56 while drain and recovery break even at 0.427, so a hands-off
 * horse bled continuously and reached the straight on empty.
 *
 * Set under the break-even, a horse left alone now RECOVERS. It loses ground —
 * doing nothing should never be competitive — but the reserve is intact and
 * still yours when your window comes. Committing it is always your decision.
 */
const PLAYER_CRUISE_CAP = 0.44;

interface PlayerInput {
  /** Hold to take a pull — settle, drop back, and recover. */
  takingBack: boolean;
  /** Timestamp (ms) until which the current urge is still pushing. */
  urgeUntil: number;
  /** Fires the engine's one big kick, on the first urge inside the window. */
  kickPending: boolean;
  kickUsed: boolean;
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
    urgeUntil: 0,
    kickPending: false,
    kickUsed: false,
  };

  const playerHorse = field.find((h) => h.id === playerHorseId)!;
  const playerProfile = STYLE_PROFILES[playerHorse.style];

  /**
   * The player's jockey rides the horse's style by default, exactly as the AI
   * would. Input MODULATES that ride rather than replacing it:
   *
   *   nothing   ride to style, and recover energy while settled
   *   tap       urge forward — a short burst, repeatable, each one costs
   *   hold      take a pull — settle back, lose ground, recover faster
   *
   * Doing it this way means letting go of the controls is a valid ride rather
   * than a horse that forgets how to race, which is what made energy
   * unrecoverable before.
   */
  const baseRide = createAiController(playerHorse);

  const entrants: RaceEntrant[] = field.map((horse) => {
    if (horse.id !== playerHorseId) return { horse };
    return {
      horse,
      controller: (self, race): ControlInput => {
        const base = baseRide(self, race);

        // The AI empties the tank down the stretch, because that is the right
        // ride when nobody is steering. For a PLAYER that is a bug: it spends
        // the reserve on your behalf and leaves you nothing to use. So the
        // default ride is capped at a cruise — positioning still happens, but
        // committing the reserve is always your decision.
        let effort = Math.min(base.effort, PLAYER_CRUISE_CAP);

        if (input.takingBack) {
          effort = Math.min(effort, 0.26);
        } else if (performance.now() < input.urgeUntil) {
          effort = 1;
        }

        const kick = input.kickPending && !input.kickUsed;
        if (kick) {
          input.kickPending = false;
          input.kickUsed = true;
        }

        return { effort, kick, targetLane: base.targetLane };
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
  let lastEnergy = 100;
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
        energy: p ? lerp(p.energy, r.energy) : r.energy,
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
    const baseScale = (HORSE_YARDS * cam.pixelsPerYard) / RIG_UNITS;
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
        pu.speed = Math.max(0, pu.speed - 11 * dt);
        pu.extra += pu.speed * dt;
        pullUp.set(r.id, pu);
        drawSpeed = pu.speed;
      }

      const phase = ((stride.get(r.id) ?? 0) + (drawSpeed * dt) / STRIDE_YARDS) % 1;
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
      // poses the sheet does not contain — standing at the gate, pulling up.
      const drewSprite =
        !r.finished &&
        drawSpriteHorse(ctx, x, y, {
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

    const winLo = Math.max(0, playerProfile.kickAt - 0.09);
    const winHi = Math.min(1, playerProfile.kickAt + 0.09);
    ctx.fillStyle = 'rgba(242,193,78,0.30)';
    roundRect(ctx, px0 + 3 + (pw - 6) * winLo, py0 + 3, (pw - 6) * (winHi - winLo), 16, 6);
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
      px0 + 3 + (pw - 6) * ((winLo + winHi) / 2),
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

    // ---- Energy bar with the style safe-zone ------------------------------
    // The shaded band shows where this horse's style wants its energy to be
    // right now. Learning to read it is how pacing is taught without a tutorial.
    const barW = Math.min(320, width - pad * 2);
    const barX = (width - barW) / 2;
    const barY = height - pad - 34;

    ctx.fillStyle = 'rgba(14,18,24,0.72)';
    roundRect(ctx, barX, barY, barW, 26, 13);
    ctx.fill();

    const safeLo = safeZoneLow(curr.progress, playerProfile.kickAt);
    ctx.fillStyle = 'rgba(78,201,160,0.20)';
    roundRect(ctx, barX + 3 + barW * safeLo, barY + 3, barW * (1 - safeLo) - 6, 20, 10);
    ctx.fill();

    const energy = Math.max(0, Math.min(1, player.energy / 100));
    if (energy > 0.005) {
      ctx.fillStyle = energy > 0.35 ? '#4EC9A0' : energy > 0.18 ? '#E8A33D' : '#E2564A';
      const fw = (barW - 6) * energy;
      roundRect(ctx, barX + 3, barY + 3, fw, 20, Math.min(10, fw / 2));
      ctx.fill();
    }

    ctx.fillStyle = '#0E1218';
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ENERGY', barX + 12, barY + 17);

    // Whether energy is going up or down, so it is never a mystery why.
    const drift = player.energy - lastEnergy;
    lastEnergy = player.energy;
    if (Math.abs(drift) > 0.004) {
      const gaining = drift > 0;
      ctx.fillStyle = gaining ? '#0E1218' : 'rgba(14,18,24,0.65)';
      ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(gaining ? '▲' : '▼', barX + 62, barY + 17);
    }

    const inWindow = Math.abs(curr.progress - playerProfile.kickAt) <= 0.09;
    ctx.textAlign = 'right';
    if (input.takingBack) {
      ctx.fillStyle = '#4EC9A0';
      ctx.fillText('TAKING A PULL', barX + barW - 12, barY + 17);
    } else if (inWindow && !input.kickUsed) {
      ctx.fillStyle = '#F2C14E';
      ctx.fillText('YOUR MOMENT', barX + barW - 12, barY + 17);
    } else if (performance.now() < input.urgeUntil) {
      ctx.fillStyle = '#E8A33D';
      ctx.fillText('URGING', barX + barW - 12, barY + 17);
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
    ctx.fillText('Tap to URGE · hold to TAKE A PULL', cx, cy + 70);
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
  // Tap repeatedly to urge, like a jockey asking again and again. Hold to take
  // a pull. A tap inside the horse's window also spends the one big kick.
  const URGE_MS = 550;
  const HOLD_MS = 220; // press longer than this and it's a pull, not an urge

  let pressedAt = 0;
  let holdTimer = 0;

  const urge = (): void => {
    input.urgeUntil = performance.now() + URGE_MS;
    const inWindow = Math.abs(curr.progress - playerProfile.kickAt) <= 0.09;
    if (inWindow && !input.kickUsed) input.kickPending = true;
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
    if (held < HOLD_MS) urge();
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
      else urge();
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

/** Where the safe zone starts: conserve early, spend late. */
function safeZoneLow(progress: number, kickAt: number): number {
  if (progress < kickAt - 0.2) return 0.62;
  if (progress < kickAt) return 0.4;
  return 0;
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
