import { createSurface, startLoop } from '../render/canvas.js';
import { drawHorse, drawHorseShadow } from '../render/horse.js';
import { COAT_IDS, coatFor, RIVAL_SILKS, UI } from '../render/palette.js';
import { drawSpriteHorse, loadSprites } from '../render/spriteHorse.js';
import { loadFrameSequence, drawFrame } from '../render/frameAnimation.js';

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
  // Fire and forget: frames draw as soon as the sheet is decoded, and the drawn
  // rig carries the view until then.
  void loadSprites();

  // Load frame sequences
  let eastRunSequence: Awaited<ReturnType<typeof loadFrameSequence>> | null = null;
  let southwestIdleSequence: Awaited<ReturnType<typeof loadFrameSequence>> | null = null;
  void loadFrameSequence('east-run', 8).then((seq) => { eastRunSequence = seq; });
  void loadFrameSequence('southwest-idle', 9).then((seq) => { southwestIdleSequence = seq; });

  let time = 0;
  let animate = true;

  const controls = document.createElement('div');
  controls.className = 'preview-bar';
  controls.innerHTML = `
    <button data-act="anim">Pause</button>
    <label>Speed <input type="range" min="0" max="100" value="70" data-act="speed"></label>
    <span class="pv-note">Top row: one stride, frozen at eight points. Below: click a coat to preview it.</span>
  `;
  host.appendChild(controls);

  let intensity = 0.7;
  let selectedCoat = 'bay';
  /** Hit boxes for the coat row, rebuilt every frame. */
  let coatHits: { id: string; x0: number; x1: number; y0: number; y1: number }[] = [];
  controls.querySelector('[data-act="anim"]')!.addEventListener('click', (e) => {
    animate = !animate;
    (e.target as HTMLButtonElement).textContent = animate ? 'Pause' : 'Play';
  });
  controls.querySelector('[data-act="speed"]')!.addEventListener('input', (e) => {
    intensity = Number((e.target as HTMLInputElement).value) / 100;
  });

  const onClick = (e: MouseEvent): void => {
    const r = surface.canvas.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const hit = coatHits.find((c) => cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1);
    if (hit) selectedCoat = hit.id;
  };
  surface.canvas.addEventListener('click', onClick);
  surface.canvas.style.cursor = 'pointer';

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
        ctx.fillStyle = 'rgba(232,237,244,0.5)';
        ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(text, 12, y);
      };
      const rule = (y: number): void => {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      };

      // ---- The sprite sheet, tinted per coat --------------------------------
      // Top of the page because this is the art that ships; the drawn rig below
      // is the fallback and the reference.
      const spriteY = 92;
      label('SPRITE — every coat, tinted from one grey sheet', spriteY - 58);
      rule(spriteY);

      const sw = width / COAT_IDS.length;
      COAT_IDS.forEach((id, i) => {
        const x = sw * (i + 0.5);
        drawSpriteHorse(ctx, x, spriteY, {
          coat: id,
          silks: RIVAL_SILKS[i % RIVAL_SILKS.length]!,
          phase,
          scale: Math.min(0.62, sw / 300),
        });
        ctx.fillStyle = 'rgba(232,237,244,0.5)';
        ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(coatFor(id).name, x, spriteY + 16);
      });

      // ---- Frame animations: East Run ----------------------------------------
      if (eastRunSequence) {
        const frameY = spriteY + 80;
        label('FRAMES — east-run (gallop)', frameY - 58);
        rule(frameY);

        const fw = width / 8;
        for (let i = 0; i < 8; i++) {
          const x = fw * (i + 0.5);
          drawFrame(ctx, x, frameY, eastRunSequence, {
            phase: i / 8,
            scale: Math.min(3.0, fw / 50),
          });
        }
      }

      // ---- Frame animations: Southwest Idle ----------------------------------
      if (southwestIdleSequence) {
        const frameY = spriteY + 160;
        label('FRAMES — southwest-idle (standing)', frameY - 58);
        rule(frameY);

        const fw = width / 9;
        for (let i = 0; i < 9; i++) {
          const x = fw * (i + 0.5);
          drawFrame(ctx, x, frameY, southwestIdleSequence, {
            phase: i / 9,
            scale: Math.min(3.0, fw / 50),
          });
        }
      }

      // ---- Coats, at the top and clickable ---------------------------------
      const coatY = spriteY + 130;
      label('DRAWN RIG — click a coat to preview', coatY - 62);
      rule(coatY);

      const cw = width / COAT_IDS.length;
      const cs = Math.min(0.8, cw / 175);
      coatHits = [];
      COAT_IDS.forEach((id, i) => {
        const x = cw * (i + 0.5);
        coatHits.push({ id, x0: cw * i, x1: cw * (i + 1), y0: coatY - 60, y1: coatY + 24 });
        if (id === selectedCoat) {
          ctx.fillStyle = UI.accentFaint;
          ctx.fillRect(cw * i + 2, coatY - 60, cw - 4, 84);
        }
        drawHorseShadow(ctx, x, coatY, cs);
        drawHorse(ctx, x, coatY, {
          coat: id,
          silks: RIVAL_SILKS[i % RIVAL_SILKS.length]!,
          pose: { phase, intensity, drive: 0.4 },
          scale: cs,
        });
        ctx.fillStyle = id === selectedCoat ? UI.accent : 'rgba(232,237,244,0.5)';
        ctx.font = `${id === selectedCoat ? 700 : 500} 10px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(coatFor(id).name, x, coatY + 18);
      });

      // ---- One stride, frozen ----------------------------------------------
      const stripY = coatY + 118;
      label('ONE STRIDE', stripY - 62);
      rule(stripY);

      const cols = 8;
      const cellW = width / cols;
      const smallScale = Math.min(0.85, cellW / 165);
      for (let i = 0; i < cols; i++) {
        const x = cellW * (i + 0.5);
        drawHorseShadow(ctx, x, stripY, smallScale);
        drawHorse(ctx, x, stripY, {
          coat: selectedCoat,
          silks: RIVAL_SILKS[0]!,
          pose: { phase: i / cols, intensity, drive: 0.5 },
          scale: smallScale,
        });
      }

      // ---- The large horse, centred in what is left ------------------------
      // Sits in the middle of the page with the reference rows above it, and
      // biased left because the rig reaches a long way forward of its origin —
      // centred on the canvas, the head ran off the right edge.
      const bigTop = stripY + 40;
      const bigY = bigTop + (height - bigTop) * 0.62;
      const bigScale = Math.min(3.0, width / 250, (height - bigTop) * 0.0088);

      rule(bigY);
      drawHorseShadow(ctx, width * 0.4, bigY, bigScale);
      drawHorse(ctx, width * 0.4, bigY, {
        coat: selectedCoat,
        silks: RIVAL_SILKS[0]!,
        pose: { phase, intensity, drive: 0.5 },
        scale: bigScale,
      });
    },
  );

  return (): void => {
    loop.stop();
    surface.canvas.removeEventListener('click', onClick);
    surface.destroy();
    controls.remove();
  };
}
