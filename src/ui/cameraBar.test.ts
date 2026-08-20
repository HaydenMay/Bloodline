// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountCameraBar, type RaceCameraMode } from './raceScreen.js';
import type { RaceView3d } from '../render/raceView3d.js';

/**
 * The in-race camera picker.
 *
 * Two things here are invisible until they break. The bar has to actually
 * reach the 3D view — it is the only caller of `setCameraMode`, so nothing
 * else would notice if the wiring went. And a press on it must not reach the
 * stage, which turns any press into a kick charge: a player changing camera
 * would otherwise spend a charge every time they looked at the race a
 * different way.
 */

function fakeView(): RaceView3d & { modes: RaceCameraMode[] } {
  const modes: RaceCameraMode[] = [];
  return {
    modes,
    setCameraMode: (m) => void modes.push(m),
    render: () => {},
    dispose: () => {},
  };
}

describe('camera bar', () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('opens on the camera the race was started with', () => {
    mountCameraBar(host, fakeView(), 'aerial');
    expect(host.querySelector('.race-cam-btn.is-active')?.getAttribute('data-cam')).toBe('aerial');
  });

  it('opens on the broadcast camera when none was asked for', () => {
    mountCameraBar(host, fakeView(), undefined);
    expect(host.querySelector('.race-cam-btn.is-active')?.getAttribute('data-cam')).toBe('side-on');
  });

  it('tells the view about a pick, and moves the active state to it', () => {
    const view = fakeView();
    mountCameraBar(host, view, undefined);

    host.querySelector<HTMLButtonElement>('.race-cam-btn[data-cam="chase"]')!.click();

    expect(view.modes).toEqual(['chase']);
    const active = host.querySelectorAll('.race-cam-btn.is-active');
    expect(active.length).toBe(1);
    expect(active[0]!.getAttribute('data-cam')).toBe('chase');
  });

  it('keeps its presses off the stage, so changing camera costs no charge', () => {
    const ridden = vi.fn();
    host.addEventListener('pointerdown', ridden);
    mountCameraBar(host, fakeView(), undefined);

    host
      .querySelector<HTMLButtonElement>('.race-cam-btn[data-cam="aerial"]')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(ridden).not.toHaveBeenCalled();
  });
});
