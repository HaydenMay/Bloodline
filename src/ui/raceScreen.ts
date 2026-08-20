import {
  createSurface,
  startLoop,
  type Loop,
  type Surface,
} from "../render/canvas.js";
import {
  coatForHorse,
  hashId,
  RIVAL_SILKS,
  UI,
  type Coat,
  type Silks,
} from "../render/palette.js";
import { drawMinimap } from "../render/track.js";
import { createRaceView2d } from "../render/raceView2d.js";
import { createRaceView3d, type RaceView3d } from "../render/raceView3d.js";
import { interpolateRunners, type RaceView } from "../render/raceView.js";
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
import { CHARGE_CAPACITY, TICK_HZ } from "../sim/race/constants.js";
import type { Horse } from "../sim/types.js";
import { attachInfoBox } from "./infoBox.js";

/**
 * The race screen.
 *
 * Owns the loop, the HUD, the chrome and the DRIVE control. The world itself —
 * track, camera, runners — belongs to a `RaceView`, so the same race can be
 * drawn side-on in 2D or in 3D without any of this changing. Reads simulation
 * state; never writes back except through the player's control input, which is
 * just another controller as far as the engine is concerned.
 */

/** Track sections, by the leader's progress. Each fires once. */
const CALLOUTS = [
  { at: 0.24, text: "Down the backstretch" },
  { at: 0.56, text: "Round the turn" },
  { at: 0.84, text: "Down the stretch!" },
] as const;

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
  /** Which way to draw the race. Chosen per race on the Race Day screen. */
  raceView?: RaceViewMode;
  /** 3D only — which camera to open on. */
  cameraMode?: RaceCameraMode | undefined;
}

export type RaceCameraMode = 'side-on' | 'chase' | 'aerial' | 'head-on';

export type RaceViewMode = "2d" | "3d";

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

  const viewMode: RaceViewMode = opts.raceView ?? "2d";

  // Read autopilot state from toggle element when race starts, not when button clicked
  const getAutopilot = (): boolean => autopilotToggle?.checked ?? false;

  // In 3D the world is drawn on a WebGL canvas underneath, and this surface
  // carries nothing but chrome — which only composites if it can be seen
  // through. In 2D it is filled edge to edge by the backdrop, so it stays
  // opaque and the browser gets to skip the blend.
  const surface = createSurface(host, { alpha: viewMode === "3d" });
  if (viewMode === "3d") surface.canvas.classList.add("race-canvas--overlay");
  const input: PlayerInput = {
    takingBack: false,
    kickPending: false,
  };

  const playerHorse = field.find((h) => h.id === playerHorseId)!;

  const entrants: RaceEntrant[] = field.map((horse) => ({ horse }));
  const race: LiveRace = createRace(entrants, config);
  const totalMetres = race.totalMetres;

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

  // The world is drawn by a view. Everything below this line is the screen's
  // own business — loop, chrome, input — and does not care which view it is.
  // Held separately from `view` because the camera bar below needs the 3D
  // view's own controls, which the shared interface deliberately does not have.
  const view3d: RaceView3d | null =
    viewMode === "3d"
      ? createRaceView3d({
          host,
          playerHorseId,
          silksFor,
          coatOf,
          totalMetres,
          lanes: new Map(race.snapshot().runners.map((r) => [r.id, r.lane])),
          horseIds: field.map((h) => h.id),
          cameraMode: opts.cameraMode,
        })
      : null;

  const view: RaceView =
    view3d ??
    createRaceView2d({
      surface,
      playerHorseId,
      silksFor,
      coatOf,
      totalMetres,
      hype: config.hype,
      horseIds: field.map((h) => h.id),
    });

  const cameraBar = view3d ? mountCameraBar(host, view3d, opts.cameraMode) : null;

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
      // The recap owns the screen from here; nothing left to frame.
      cameraBar?.remove();
      opts.onFinish?.(placings);
    }
  };

  const setCallout = (text: string): void => {
    callout = text;
    calloutUntil = performance.now() + 2200;
  };

  const draw = (alpha: number, dt: number): void => {
    const { ctx, width, height } = surface;

    // Interpolated once, then shared. The chrome has to agree with the world
    // about where each horse is, so both read the same numbers rather than
    // each lerping their own.
    const runners = interpolateRunners(prev, curr, alpha);
    const player = runners.find((r) => r.id === playerHorseId)!;

    // The 2D view repaints every pixel; the 3D one leaves this canvas for the
    // chrome alone, so last frame's HUD has to be wiped first.
    if (viewMode === "3d") ctx.clearRect(0, 0, width, height);

    view.render({ runners, player, progress: curr.progress, dt });

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
    cameraBar?.remove();
    view.dispose();
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

/**
 * The camera picker — 3D only.
 *
 * Sat under the TO GO panel rather than at the foot of the stage, because the
 * foot is where the charge bar and the YOUR MOMENT banner are drawn and this
 * must never cover the one cue the player rides on.
 */
const CAMERAS: readonly (readonly [RaceCameraMode, string])[] = [
  ['side-on', 'Broadcast'],
  ['chase', 'Chase'],
  ['aerial', 'Aerial'],
  ['head-on', 'Head-on'],
] as const;

export function mountCameraBar(
  host: HTMLElement,
  view: RaceView3d,
  opening: RaceCameraMode | undefined,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'race-cams';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Camera');

  const active = opening ?? 'side-on';
  const buttons: HTMLButtonElement[] = [];

  const select = (mode: RaceCameraMode): void => {
    view.setCameraMode(mode);
    for (const b of buttons) {
      const on = b.dataset['cam'] === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };

  for (const [mode, label] of CAMERAS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'race-cam-btn';
    btn.dataset['cam'] = mode;
    btn.textContent = label;
    btn.setAttribute('aria-pressed', String(mode === active));
    if (mode === active) btn.classList.add('is-active');
    btn.addEventListener('click', () => select(mode));
    buttons.push(btn);
    bar.appendChild(btn);
  }

  // The stage turns any press into a kick, and a press that started on a
  // button is not a ride instruction. Stopped here rather than filtered in the
  // stage handler so the button stays an ordinary button.
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());

  host.appendChild(bar);
  return bar;
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
