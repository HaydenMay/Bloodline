import { createSurface, startLoop } from "../render/canvas.js";
import { loadFrameSequence, drawFrame } from "../render/frameAnimation.js";
import { UI } from "../render/palette.js";
import { loadSprites } from "../render/spriteHorse.js";

/**
 * Horse preview.
 *
 * A development view, reachable at ?preview — the horse drawn large, still, and
 * at known points in the stride, plus every coat.
 *
 * It exists because the horse is otherwise only ever seen as a 40-pixel shape
 * moving at speed, which is useless for judging whether the drawing is any
 * good. Big and still is the only way to see what is actually wrong with it.
 */
export function mountHorsePreview(host: HTMLElement): () => void {
  const surface = createSurface(host);
  // Fire and forget: frames draw as soon as the sheet is decoded.
  void loadSprites();

  // Load frame sequences
  let eastRunSequence: Awaited<ReturnType<typeof loadFrameSequence>> | null =
    null;
  let southwestIdleSequence: Awaited<
    ReturnType<typeof loadFrameSequence>
  > | null = null;
  void loadFrameSequence("east-run", 8).then((seq) => {
    eastRunSequence = seq;
  });
  void loadFrameSequence("southwest-idle", 9).then((seq) => {
    southwestIdleSequence = seq;
  });

  let time = 0;
  const animate = true;

  const intensity = 0.7;

  const loop = startLoop(
    30,
    () => {
      if (animate) time += 1 / 30;
    },
    () => {
      const { ctx, width, height } = surface;
      const phase = (time * (0.9 + intensity)) % 1;

      ctx.fillStyle = UI.panel;
      ctx.fillRect(0, 0, width, height);

      const label = (text: string, y: number): void => {
        ctx.fillStyle = "rgba(232,237,244,0.5)";
        ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(text, 12, y);
      };

      const rule = (y: number): void => {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      };

      let y = 60;

      // ---- East Run (gallop animation) ----------------------------------------
      if (eastRunSequence) {
        label("EAST-RUN (8 frames)", y);
        y += 20;
        rule(y);
        y += 30;

        // All frames frozen
        const fw = width / 8;
        for (let i = 0; i < 8; i++) {
          const x = fw * (i + 0.5);
          drawFrame(ctx, x, y, eastRunSequence, {
            phase: i / 8,
            scale: 3,
          });
        }
        y += 80;
      }

      rule(y);
      y += 30;

      // ---- Southwest Idle (standing animation) --------------------------------
      if (southwestIdleSequence) {
        label("SOUTHWEST-IDLE (9 frames)", y);
        y += 20;
        rule(y);
        y += 30;

        // All frames frozen
        const fw = width / 9;
        for (let i = 0; i < 9; i++) {
          const x = fw * (i + 0.5);
          drawFrame(ctx, x, y, southwestIdleSequence, {
            phase: i / 9,
            scale: 3,
          });
        }
        y += 80;
      }

      rule(y);
      y += 40;

      // ---- Animated sequences in boxes at the bottom ---------------------------
      const boxHeight = 140;
      const boxPadding = 20;
      const boxY = y;
      const boxW = (width - boxPadding * 3) / 2;

      if (eastRunSequence) {
        // East Run box
        const boxX = boxPadding;
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxW, boxHeight);

        label("EAST-RUN (animated)", boxX + 10);
        const animX = boxX + boxW / 2;
        const animY = boxY + boxHeight / 2;
        drawFrame(ctx, animX, animY, eastRunSequence, {
          phase,
          scale: 5,
        });
      }

      if (southwestIdleSequence) {
        // Southwest Idle box
        const boxX = boxPadding * 2 + boxW;
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxW, boxHeight);

        label("SOUTHWEST-IDLE (animated)", boxX + 10);
        const animX = boxX + boxW / 2;
        const animY = boxY + boxHeight / 2;
        drawFrame(ctx, animX, animY, southwestIdleSequence, {
          phase,
          scale: 5,
        });
      }
    },
  );

  return (): void => {
    loop.stop();
    surface.destroy();
  };
}
