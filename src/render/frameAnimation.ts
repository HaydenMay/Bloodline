/**
 * Frame-based animation rendering using spritesheets.
 *
 * Loads a spritesheet image and extracts frames in a 3x3 grid layout
 * (92x92 pixels per frame, 276x276 total).
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

const spritesheetNames: Record<string, string> = {
  'east-run': 'east-run.png',
  'southwest-idle': 'idle-horse.png',
};

const extractFramesFromSpritesheet = async (
  spritesheet: HTMLImageElement,
  frameCount: number,
): Promise<HTMLImageElement[]> => {
  const FRAME_WIDTH = 92;
  const FRAME_HEIGHT = 92;
  const GRID_COLS = 3;

  const frames: HTMLImageElement[] = [];

  for (let i = 0; i < frameCount; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);

    const canvas = document.createElement('canvas');
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(
      spritesheet,
      col * FRAME_WIDTH,
      row * FRAME_HEIGHT,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      0,
      0,
      FRAME_WIDTH,
      FRAME_HEIGHT,
    );

    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const image = new Image();
      image.onload = () => res(image);
      image.onerror = () => rej(new Error(`Failed to create frame ${i}`));
      image.src = canvas.toDataURL();
    });

    frames.push(img);
  }

  return frames;
};

/**
 * Load a frame sequence from a spritesheet.
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
    const spritesheetName = spritesheetNames[name];
    if (!spritesheetName) {
      throw new Error(`Unknown sequence: ${name}`);
    }

    const spritesheetSrc = new URL(
      `../assets/horse-positions/${name}/${spritesheetName}`,
      import.meta.url,
    ).href;

    const spritesheet = await loadImage(spritesheetSrc);
    const frames = await extractFramesFromSpritesheet(spritesheet, frameCount);

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
