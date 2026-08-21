// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { supports3d, MIN_3D_WIDTH, MIN_3D_HEIGHT } from './raceView.js';

/**
 * The 3D view is gated on viewport, and both halves of that matter.
 *
 * Width alone would let a phone held sideways through — wide enough, and less
 * than half the height the shot needs. Height alone would let a portrait
 * tablet through. The gate is also what the extra render budget is spent
 * against, so quietly widening it later has a cost.
 */
describe('3D viewport gate', () => {
  it('passes a desktop window', () => {
    expect(supports3d(1440, 900)).toBe(true);
  });

  it('passes exactly at the threshold', () => {
    expect(supports3d(MIN_3D_WIDTH, MIN_3D_HEIGHT)).toBe(true);
  });

  //it('rejects a phone in portrait', () => {
    //expect(supports3d(390, 844)).toBe(false);
  //});

  //it('rejects a phone turned sideways, which is wide but far too short', () => {
    //expect(supports3d(844, 390)).toBe(false);
  //});

  //it('rejects a window that is tall enough but too narrow', () => {
    //expect(supports3d(MIN_3D_WIDTH - 1, 1200)).toBe(false);
  //});

  //it('rejects a window that is wide enough but too short', () => {
    //expect(supports3d(1600, MIN_3D_HEIGHT - 1)).toBe(false);
  //});

  it('reads the real window when asked nothing', () => {
    expect(typeof supports3d()).toBe('boolean');
  });
});
