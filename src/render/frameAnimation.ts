/**
 * Frame-based animation rendering.
 *
 * Loads individual frame images from a sequence directory and renders them
 * based on animation phase (0-1).
 */

interface FrameSequence {
  name: string;
  frames: HTMLImageElement[];
}

const sequences = new Map<string, FrameSequence>();
const loadingPromises = new Map<string, Promise<FrameSequence>>();

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`failed to load ${src}`));
    img.src = src;
  });

/**
 * Load a frame sequence (e.g., "east-run" with 8 frames: frame_000.png ... frame_007.png)
 * Sequence name maps to src/assets/horse-positions/{name}/ directory.
 */
export async function loadFrameSequence(
  name: string,
  frameCount: number,
): Promise<FrameSequence> {
  const cached = sequences.get(name);
  if (cached) return cached;

  const pending = loadingPromises.get(name);
  if (pending) return pending;

  const promise = (async () => {
    const frames: HTMLImageElement[] = [];
    for (let i = 0; i < frameCount; i++) {
      const padded = String(i).padStart(3, '0');
      const src = new URL(
        `../assets/horse-positions/${name}/frame_${padded}.png`,
        import.meta.url,
      ).href;
      frames.push(await loadImage(src));
    }
    const sequence: FrameSequence = { name, frames };
    sequences.set(name, sequence);
    loadingPromises.delete(name);
    return sequence;
  })();

  loadingPromises.set(name, promise);
  return promise;
}

export interface DrawFrameOptions {
  /** 0-1 through animation cycle */
  phase: number;
  /** Pixels per sprite pixel */
  scale: number;
  faded?: boolean;
}

/**
 * Draw a frame from a loaded sequence, anchored at the center bottom (hooves).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sequence: FrameSequence,
  opts: DrawFrameOptions,
): boolean {
  if (!sequence.frames.length) return false;

  const frameIndex = Math.floor(opts.phase * sequence.frames.length) % sequence.frames.length;
  const frame = sequence.frames[frameIndex]!;

  if (!frame.complete) return false;

  const w = frame.width * opts.scale;
  const h = frame.height * opts.scale;
  const dx = x - w / 2;
  const dy = y - h / 2;

  ctx.save();
  if (opts.faded) ctx.globalAlpha = 0.5;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, dx, dy, w, h);
  ctx.restore();
  return true;
}
