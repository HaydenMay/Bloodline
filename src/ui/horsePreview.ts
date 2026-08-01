import { createSurface, startLoop } from '../render/canvas.js';
import { drawHorse, drawHorseShadow } from '../render/horse.js';
import { COAT_IDS, coatFor, RIVAL_SILKS } from '../render/palette.js';

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
  let time = 0;
  let animate = true;

  const controls = document.createElement('div');
  controls.className = 'preview-bar';
  controls.innerHTML = `
    <button data-act="anim">Pause</button>
    <label>Speed <input type="range" min="0" max="100" value="70" data-act="speed"></label>
    <span class="pv-note">Top row: one stride, frozen at eight points. Below: every coat.</span>
  `;
  host.appendChild(controls);

  let intensity = 0.7;
  controls.querySelector('[data-act="anim"]')!.addEventListener('click', (e) => {
    animate = !animate;
    (e.target as HTMLButtonElement).textContent = animate ? 'Pause' : 'Play';
  });
  controls.querySelector('[data-act="speed"]')!.addEventListener('input', (e) => {
    intensity = Number((e.target as HTMLInputElement).value) / 100;
  });

  const loop = startLoop(
    30,
    () => {
      if (animate) time += 1 / 30;
    },
    () => {
      const { ctx, width, height } = surface;

      ctx.fillStyle = '#171C24';
      ctx.fillRect(0, 0, width, height);

      // Ground line, so hoof contact can actually be judged.
      const bigY = Math.min(height * 0.42, 260);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, bigY);
      ctx.lineTo(width, bigY);
      ctx.stroke();

      // ---- One large horse, for judging the drawing itself ----------------
      const bigScale = Math.min(3.4, width / 210);
      const phase = (time * (0.9 + intensity)) % 1;
      drawHorseShadow(ctx, width * 0.5, bigY, bigScale);
      drawHorse(ctx, width * 0.5, bigY, {
        coat: 'bay',
        silks: RIVAL_SILKS[0]!,
        pose: { phase, intensity, drive: 0.5 },
        scale: bigScale,
      });

      // ---- The stride, frozen at eight points ------------------------------
      const stripY = bigY + 116;
      const cols = 8;
      const cellW = width / cols;
      const smallScale = Math.min(1.05, cellW / 130);

      ctx.fillStyle = 'rgba(232,237,244,0.45)';
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('ONE STRIDE', 12, stripY - 74);

      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.moveTo(0, stripY);
      ctx.lineTo(width, stripY);
      ctx.stroke();

      for (let i = 0; i < cols; i++) {
        const p = i / cols;
        const x = cellW * (i + 0.5);
        drawHorseShadow(ctx, x, stripY, smallScale);
        drawHorse(ctx, x, stripY, {
          coat: 'bay',
          silks: RIVAL_SILKS[0]!,
          pose: { phase: p, intensity, drive: 0.5 },
          scale: smallScale,
        });
      }

      // ---- Every coat ------------------------------------------------------
      const coatY = stripY + 118;
      if (coatY < height - 10) {
        ctx.fillStyle = 'rgba(232,237,244,0.45)';
        ctx.textAlign = 'left';
        ctx.fillText('COATS', 12, coatY - 74);

        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(0, coatY);
        ctx.lineTo(width, coatY);
        ctx.stroke();

        const cw = width / COAT_IDS.length;
        const cs = Math.min(1.0, cw / 130);
        COAT_IDS.forEach((id, i) => {
          const x = cw * (i + 0.5);
          drawHorseShadow(ctx, x, coatY, cs);
          drawHorse(ctx, x, coatY, {
            coat: id,
            silks: RIVAL_SILKS[i % RIVAL_SILKS.length]!,
            pose: { phase, intensity, drive: 0.4 },
            scale: cs,
          });
          ctx.fillStyle = 'rgba(232,237,244,0.5)';
          ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(coatFor(id).name, x, coatY + 20);
        });
      }
    },
  );

  return (): void => {
    loop.stop();
    surface.destroy();
    controls.remove();
  };
}
