/**
 * The material key — one palette every recolourable asset is authored against.
 *
 * Bloodline recolours its art at runtime, so every asset needs a MASK: one
 * material id per pixel, saying what that pixel is. Building a mask means
 * looking at a pixel and deciding which material it belongs to, and how hard
 * that is depends entirely on how the art was painted.
 *
 * `racer.png` was not painted for it. Its mane, tail, cannons, boots and saddle
 * are all the same black, so `tools/bake-sprites.ts` has to separate them by
 * where they sit in the frame — a page of geometry that a new pose could break.
 * See SPRITE_MASK.md §5.3.
 *
 * This key exists so nothing else has to be that hard. Author an asset with
 * each material's base colour taken from the table below, and masking collapses
 * to a colour lookup: no geometry, no blob analysis, no per-asset tuning.
 *
 * HOW THE BANDS ARE LAID OUT. Three materials are neutral and are told apart by
 * LIGHTNESS — points is nearly black, body is mid, trim is nearly white. The
 * other two are saturated and are told apart by HUE. One test picks the axis:
 *
 *     chroma >= CHROMA_KEY  ->  hue decides    (silks, hair)
 *     chroma <  CHROMA_KEY  ->  lightness decides  (points, body, trim)
 *
 * `fixed` is whatever falls through, which is what makes skin and leather work:
 * they are the one thing the player sees in its authored colour, so they keep
 * their natural warm tones and land on `fixed` by not being anything else.
 *
 * SHADE WITHIN A MATERIAL BY MOVING LIGHTNESS, NOT HUE. Two limits come out of
 * the layout above and both matter:
 *
 *   - A saturated material must stay between L 0.20 and L 0.85. Chroma is
 *     max-min, so it collapses toward zero at both ends of the lightness range
 *     — shade the violet mane down to L 0.10 and its chroma falls under
 *     CHROMA_KEY, the hue test stops applying, and it reads as `points`.
 *   - A neutral material must stay inside its lightness band with room to
 *     spare. The bands below leave a gap either side; spend it on shading, not
 *     on drifting the base colour.
 */

export const MATERIAL = {
  none: 0,
  /** The coat. Tinted by the body gene. */
  body: 1,
  /** Mane and tail. Tinted by the hair gene. */
  hair: 2,
  /** Cannons and hooves. Tinted by the points gene. */
  points: 3,
  /** Jacket, cap and saddle cloth. Tinted by the runner's silks. */
  silks: 4,
  /** Breeches and collar. Tinted by the silks' secondary colour. */
  trim: 5,
  /** Skin, leather, hoof horn — never tinted. */
  fixed: 6,
} as const;

export type Material = (typeof MATERIAL)[keyof typeof MATERIAL];

export const MATERIAL_NAMES = ['none', 'body', 'hair', 'points', 'silks', 'trim', 'fixed'] as const;

export const materialByName = (name: string): Material | null => {
  const i = MATERIAL_NAMES.indexOf(name as (typeof MATERIAL_NAMES)[number]);
  return i > 0 ? (i as Material) : null;
};

// ---- The bands --------------------------------------------------------------

/** Above this a colour is saturated enough for its hue to be trusted. */
export const CHROMA_KEY = 28;

/** Neutral lightness bands. The gaps between them are the shading budget. */
export const L_POINTS_MAX = 0.22;
export const L_BODY_MIN = 0.28;
export const L_BODY_MAX = 0.68;
export const L_TRIM_MIN = 0.72;

/** Hue windows for the saturated materials. A window may wrap zero. */
export const HUE_SILKS: [number, number] = [185, 250];
export const HUE_HAIR: [number, number] = [260, 325];

/**
 * The colour to paint each material. Shading around these is expected and fine
 * — what matters is landing inside the band, which every entry does with the
 * margin printed by `npm run check-art`.
 *
 * `fixed` has no key colour on purpose: it is the fall-through, and its whole
 * job is to hold the things that should keep the colour they were painted.
 * `#12B36A` is offered only for TACK — bridles, reins, saddles, boots — which
 * would otherwise be dark leather and collide with `points`.
 */
export const KEY: Record<string, { hex: string; note: string }> = {
  body: { hex: '#8C8C8F', note: 'neutral grey, mid lightness' },
  hair: { hex: '#A032D0', note: 'violet — clear of the silks window and of skin' },
  points: { hex: '#1A1A1C', note: 'near-black' },
  silks: { hex: '#1E6FD9', note: 'blue' },
  trim: { hex: '#F0F0F2', note: 'near-white' },
  fixed: { hex: '#12B36A', note: 'tack only; skin and leather keep natural tones' },
};

/**
 * Shading ramps — the colours to actually paint with, dark to light.
 *
 * "Stay inside the band" is a rule about numbers, and nobody mixes paint by
 * checking numbers. These are pre-checked steps, wide enough to model with and
 * far enough inside each band to survive a resave; `material-key.test.ts`
 * asserts every one of them still classifies as its own material, so the ramps
 * cannot drift away from the rules they were derived from.
 *
 * Ramps move LIGHTNESS and hold HUE. Look at the two saturated ones and notice
 * their hue barely moves — 280-282 for hair, 212-214 for silks — while their
 * lightness spans 0.28 to 0.68. That is the shape every extra shade should
 * have. Note also that neither ramp reaches for black or white at its ends:
 * chroma is max-minus-min, so it collapses at both extremes, and a violet
 * shaded to L 0.10 stops being violet as far as the classifier is concerned.
 *
 * `fixed` gets a longer list because it is the fall-through and holds unlike
 * things: a green for tack, and natural leather and skin tones that are only
 * `fixed` by virtue of being nothing else.
 */
export const RAMPS: Record<string, string[]> = {
  body: ['#55555A', '#70707A', '#8C8C8F', '#A0A0A4'],
  hair: ['#5A1C75', '#7B26A2', '#A032D0', '#C070E8'],
  points: ['#101012', '#1A1A1C', '#26262A', '#2E2E33'],
  silks: ['#12447F', '#1857AB', '#1E6FD9', '#6BA6F0'],
  trim: ['#C8C8CC', '#DCDCE0', '#F0F0F2', '#FAFAFC'],
  fixed: ['#0B6B40', '#12B36A', '#3FD693', '#8A5A3C', '#C98A5E'],
};

// ---- Colour maths -----------------------------------------------------------

/**
 * Chroma on the 0-255 scale, NOT HSL saturation.
 *
 * HSL saturation divides by a term that goes to zero at both ends of the
 * lightness range, so it explodes near white and near black. The breeches on
 * `racer.png` are (246,244,248): a saturation of 0.22, high enough to trip any
 * threshold set low enough to catch blue silks — but a chroma of 4. Every
 * colour test in this codebase is a chroma test for that reason.
 */
export const chromaOf = (r: number, g: number, b: number): number =>
  Math.max(r, g, b) - Math.min(r, g, b);

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Is `h` inside a hue window? The window may start below zero to wrap. */
export const hueIn = (h: number, [lo, hi]: [number, number]): boolean => {
  const t = ((h % 360) + 360) % 360;
  return (t >= lo && t <= hi) || (t - 360 >= lo && t - 360 <= hi);
};

/** Parse `#rrggbb`. */
export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * Which material is this colour, by the key alone.
 *
 * No context, no neighbours, no geometry — which is the entire point. An asset
 * painted to the key can be masked one pixel at a time.
 */
export function classifyByKey(r: number, g: number, b: number): Material {
  const c = chromaOf(r, g, b);
  const [h, , l] = rgbToHsl(r, g, b);
  if (c >= CHROMA_KEY) {
    if (hueIn(h, HUE_SILKS)) return MATERIAL.silks;
    if (hueIn(h, HUE_HAIR)) return MATERIAL.hair;
    return MATERIAL.fixed; // tack green, skin warm, anything else coloured
  }
  if (l < L_POINTS_MAX) return MATERIAL.points;
  if (l > L_TRIM_MIN) return MATERIAL.trim;
  if (l >= L_BODY_MIN && l <= L_BODY_MAX) return MATERIAL.body;
  return MATERIAL.fixed; // in a gap between two neutral bands
}

/**
 * A GIMP palette, which LibreSprite and Aseprite both open.
 *
 * Load it, switch the sprite to Indexed colour mode, and editing a palette
 * entry recolours every pixel of that material at once — see SPRITE_MASK.md
 * §11 for the workflow.
 */
export function paletteGpl(): string {
  const lines = ['GIMP Palette', 'Name: Bloodline material key', 'Columns: 5', '#'];
  const pad = (v: number): string => String(v).padStart(3, ' ');
  for (const [name, ramp] of Object.entries(RAMPS)) {
    lines.push(`# ${name} — ${KEY[name]!.note}`);
    ramp.forEach((hex, i) => {
      const [r, g, b] = hexToRgb(hex);
      lines.push(`${pad(r)} ${pad(g)} ${pad(b)}\t${name} ${i + 1}${hex === KEY[name]!.hex ? ' (base)' : ''}`);
    });
  }
  return `${lines.join('\n')}\n`;
}
