/**
 * Canvas setup and the frame loop.
 *
 * Handles device pixel ratio so the game is sharp on phones, and keeps the
 * drawing surface sized to its container. Everything is drawn in CSS pixels;
 * the DPR scaling is applied once here and never thought about again.
 */

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Logical size in CSS pixels. */
  width: number;
  height: number;
  destroy(): void;
}

export interface SurfaceOptions {
  /**
   * Whether the surface may be see-through.
   *
   * Opaque by default — the 2D view fills every pixel with its backdrop, and
   * telling the browser so is free performance. The 3D view draws the world on
   * its own WebGL canvas underneath and leaves this one carrying nothing but
   * chrome, which only composites if there is transparency to composite
   * through.
   */
  alpha?: boolean;
}

export function createSurface(host: HTMLElement, options: SurfaceOptions = {}): Surface {
  const canvas = document.createElement('canvas');
  canvas.className = 'race-canvas';
  host.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: options.alpha ?? false });
  if (!ctx) throw new Error('Canvas 2D is unavailable');

  const surface: Surface = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    destroy() {
      observer.disconnect();
      canvas.remove();
    },
  };

  const resize = (): void => {
    // Cap DPR at 2: beyond that the pixel cost is real and the gain is not.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = host.getBoundingClientRect();
    surface.width = Math.max(1, Math.round(rect.width));
    surface.height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(surface.width * dpr);
    canvas.height = Math.round(surface.height * dpr);
    canvas.style.width = `${surface.width}px`;
    canvas.style.height = `${surface.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return surface;
}

/**
 * A fixed-timestep loop.
 *
 * The simulation runs at a fixed 30 Hz regardless of display refresh rate, and
 * the renderer interpolates between ticks. Without this the race would run
 * faster on a 120 Hz phone than a 60 Hz laptop — and worse, would stop being
 * reproducible from a seed.
 */
export interface Loop {
  stop(): void;
}

export function startLoop(
  hz: number,
  onTick: () => void,
  onDraw: (alpha: number, dt: number) => void,
): Loop {
  const stepMs = 1000 / hz;
  let last = performance.now();
  let accumulator = 0;
  let raf = 0;
  let running = true;

  const frame = (now: number): void => {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    // Clamp the delta so a backgrounded tab doesn't try to catch up on
    // thousands of ticks the instant it becomes visible again.
    const dt = Math.min(now - last, 250);
    last = now;
    accumulator += dt;

    while (accumulator >= stepMs) {
      onTick();
      accumulator -= stepMs;
    }

    onDraw(accumulator / stepMs, dt / 1000);
  };

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
