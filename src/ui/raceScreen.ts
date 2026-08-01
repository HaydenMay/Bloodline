import { createSurface, startLoop, type Loop, type Surface } from '../render/canvas.js';
import { drawHorse, drawHorseShadow } from '../render/horse.js';
import { RIVAL_SILKS, type Silks } from '../render/palette.js';
import {
  drawBackdrop,
  drawDistanceMarkers,
  drawMinimap,
  yardToScreen,
  type Camera,
} from '../render/track.js';
import { createRace, type LiveRace, type RaceSnapshot, type RunnerSnapshot } from '../sim/race/engine.js';
import { STYLE_PROFILES, TICK_HZ } from '../sim/race/constants.js';
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

interface PlayerInput {
  driving: boolean;
  kick: boolean;
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
  const input: PlayerInput = { driving: false, kick: false, kickUsed: false };

  // The player's horse takes its effort from the DRIVE control. Everything else
  // — the kick window, the energy economy — is handled by the engine exactly as
  // it is for the AI, so the player is not playing a different game.
  const playerHorse = field.find((h) => h.id === playerHorseId)!;
  const playerProfile = STYLE_PROFILES[playerHorse.style];

  const entrants: RaceEntrant[] = field.map((horse) => {
    if (horse.id !== playerHorseId) return { horse };
    return {
      horse,
      controller: (self): ControlInput => {
        const kick = input.kick && !input.kickUsed;
        if (kick) input.kickUsed = true;
        return {
          effort: input.driving ? 1 : 0.4,
          kick,
          targetLane: self.lane,
        };
      },
    };
  });

  const race: LiveRace = createRace(entrants, config);
  const totalYards = race.totalYards;

  const silksFor = new Map<string, Silks>();
  let rivalIndex = 0;
  for (const h of field) {
    silksFor.set(h.id, h.id === playerHorseId ? playerSilks : RIVAL_SILKS[rivalIndex++ % RIVAL_SILKS.length]!);
  }

  // Stride phase is visual only, advanced from speed so hooves match the ground.
  const stride = new Map<string, number>();
  for (const h of field) stride.set(h.id, Math.random());

  let prev: RaceSnapshot = race.snapshot();
  let curr: RaceSnapshot = prev;
  let running = true;
  let callout = '';
  let calloutUntil = 0;
  let finishedAt = 0;

  const cam: Camera = { scrollYards: 0, pixelsPerYard: 1.6 };

  const tick = (): void => {
    if (!running) return;
    prev = curr;
    running = race.step();
    curr = race.snapshot();

    for (const e of curr.fresh) {
      if (e.kind === 'phase' && e.detail) setCallout(e.detail);
    }

    const remaining = totalYards - curr.leaderDistance;
    if (remaining <= YARDS_PER_FURLONG && callout !== 'Down the stretch!') setCallout('Down the stretch!');
    else if (curr.progress >= 0.55 && curr.progress < 0.58) setCallout('Round the turn');
    else if (curr.progress >= 0.25 && curr.progress < 0.28) setCallout('Down the backstretch');

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

  const draw = (alpha: number): void => {
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

    // Camera keeps the player a third of the way in, so there is room to see
    // what is coming without losing sight of what is behind.
    cam.pixelsPerYard = Math.max(1.1, Math.min(2.2, width / 620));
    const target = player.distance - (width * 0.34) / cam.pixelsPerYard;
    cam.scrollYards += (target - cam.scrollYards) * 0.12;

    drawBackdrop(ctx, width, height, cam, config.hype);
    drawDistanceMarkers(ctx, height, cam, totalYards);

    // Lane 0 is the rail (furthest from camera), so higher lanes draw nearer
    // and larger. Sorting by lane keeps the overlap correct.
    const laneY = (lane: number): number => height * 0.60 + lane * (height * 0.052);
    const laneScale = (lane: number): number => 0.34 + lane * 0.017;

    for (const r of [...runners].sort((a, b) => a.lane - b.lane)) {
      const x = yardToScreen(r.distance, cam);
      if (x < -140 || x > width + 140) continue;

      const y = laneY(r.lane);
      const scale = laneScale(r.lane) * (height / 420);

      // Advance the stride from ground speed so the gait matches the motion.
      const phase = (stride.get(r.id) ?? 0) + (r.speed * 0.0016);
      stride.set(r.id, phase % 1);

      drawHorseShadow(ctx, x, y + 2, scale);
      drawHorse(ctx, x, y, {
        coat: r.coat,
        silks: silksFor.get(r.id)!,
        pose: {
          phase: phase % 1,
          intensity: Math.min(1, Math.max(0, (r.speed - 18) / 14)),
          drive: r.effort,
        },
        scale,
        faded: r.finished,
      });

      if (r.id === playerHorseId) {
        ctx.fillStyle = '#F2C14E';
        ctx.beginPath();
        ctx.moveTo(x, y - 92 * scale);
        ctx.lineTo(x - 6, y - 104 * scale);
        ctx.lineTo(x + 6, y - 104 * scale);
        ctx.closePath();
        ctx.fill();
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
    ctx.fillStyle = energy > 0.35 ? '#4EC9A0' : energy > 0.18 ? '#E8A33D' : '#E2564A';
    roundRect(ctx, barX + 3, barY + 3, Math.max(6, (barW - 6) * energy), 20, 10);
    ctx.fill();

    ctx.fillStyle = '#0E1218';
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ENERGY', barX + 12, barY + 17);

    if (!input.kickUsed) {
      const inWindow = Math.abs(curr.progress - playerProfile.kickAt) <= 0.09;
      ctx.fillStyle = inWindow ? '#F2C14E' : 'rgba(232,237,244,0.45)';
      ctx.textAlign = 'right';
      ctx.fillText(inWindow ? 'KICK NOW' : 'kick ready', barX + barW - 12, barY + 17);
    }

    // ---- Call-outs ---------------------------------------------------------
    if (performance.now() < calloutUntil && callout) {
      ctx.fillStyle = 'rgba(242,193,78,0.95)';
      ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(callout, width / 2, height * 0.2);
    }

    if (!running) {
      ctx.fillStyle = 'rgba(14,18,24,0.55)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#E8EDF4';
      ctx.font = '800 34px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${ordinal(player.rank)}`, width / 2, height / 2 - 6);
      ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#8B98A9';
      ctx.fillText('tap to continue', width / 2, height / 2 + 24);
    }
  };

  // ---- Input --------------------------------------------------------------
  const down = (e: Event): void => {
    e.preventDefault();
    input.driving = true;
  };
  const up = (): void => {
    input.driving = false;
  };
  const kick = (): void => {
    if (!input.kickUsed) input.kick = true;
  };

  host.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  host.addEventListener('dblclick', kick);

  const key = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      input.driving = e.type === 'keydown';
    }
    if (e.code === 'ShiftLeft' && e.type === 'keydown') kick();
  };
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);

  const loop: Loop = startLoop(TICK_HZ, tick, draw);

  return (): void => {
    loop.stop();
    surface.destroy();
    host.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    host.removeEventListener('dblclick', kick);
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
