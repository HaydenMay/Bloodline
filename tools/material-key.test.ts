import { describe, expect, it } from 'vitest';
import {
  CHROMA_KEY,
  HUE_HAIR,
  HUE_SILKS,
  KEY,
  RAMPS,
  chromaOf,
  classifyByKey,
  hexToRgb,
  hueIn,
  materialByName,
  rgbToHsl,
} from './material-key.js';

/**
 * The material key is a promise to whoever paints the art: paint this colour
 * and the baker will read it as this material. These tests are that promise
 * held in place. They fail the moment a band is nudged without its ramp being
 * re-derived — which is exactly the change that would otherwise be discovered
 * as a badge silently losing its mane three commits later.
 */
describe('material key', () => {
  it('classifies every key colour as its own material', () => {
    for (const [name, { hex }] of Object.entries(KEY)) {
      expect(classifyByKey(...hexToRgb(hex)), `${name} ${hex}`).toBe(materialByName(name));
    }
  });

  it('classifies every ramp step as its own material', () => {
    for (const [name, ramp] of Object.entries(RAMPS)) {
      for (const hex of ramp) {
        expect(classifyByKey(...hexToRgb(hex)), `${name} ${hex}`).toBe(materialByName(name));
      }
    }
  });

  it('keeps each ramp on one hue while moving lightness', () => {
    for (const [name, ramp] of Object.entries(RAMPS)) {
      if (name === 'fixed') continue; // the fall-through, deliberately mixed
      const ls = ramp.map((hex) => rgbToHsl(...hexToRgb(hex))[2]);
      // Monotonic, and wide enough to model with. The floor is 0.10 because
      // `points` has to fit its whole ramp under L 0.22 and cannot span more.
      for (let i = 1; i < ls.length; i++) expect(ls[i], `${name} step ${i}`).toBeGreaterThan(ls[i - 1]!);
      expect(ls[ls.length - 1]! - ls[0]!, name).toBeGreaterThan(0.1);

      if (chromaOf(...hexToRgb(ramp[0]!)) < CHROMA_KEY) continue; // neutral ramp, no hue to hold
      const hues = ramp.map((hex) => rgbToHsl(...hexToRgb(hex))[0]);
      expect(Math.max(...hues) - Math.min(...hues), `${name} hue spread`).toBeLessThan(10);
    }
  });

  it('keeps saturated ramps clear of the chroma floor at both ends', () => {
    // Chroma is max-minus-min, so it collapses toward black and toward white.
    // A ramp that reaches too far in either direction stops being its own hue.
    for (const name of ['hair', 'silks']) {
      for (const hex of RAMPS[name]!) {
        expect(chromaOf(...hexToRgb(hex)), `${name} ${hex}`).toBeGreaterThan(CHROMA_KEY * 2);
      }
    }
  });

  it('keeps the two hue windows apart', () => {
    for (let h = 0; h < 360; h++) {
      expect(hueIn(h, HUE_SILKS) && hueIn(h, HUE_HAIR), `hue ${h}`).toBe(false);
    }
  });

  it('leaves skin and leather outside both windows, so they fall through to fixed', () => {
    // Every warm hue a face, a hand or a bridle can land on.
    for (let h = 335; h < 335 + 80; h++) {
      const t = h % 360;
      expect(hueIn(t, HUE_SILKS) || hueIn(t, HUE_HAIR), `hue ${t}`).toBe(false);
    }
  });
});
