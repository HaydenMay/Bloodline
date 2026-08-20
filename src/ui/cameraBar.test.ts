// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountCameraBar, type RaceCameraMode } from './raceScreen.js';
import type { RaceView3d } from '../render/raceView3d.js';

/**
 * The in-race camera picker.
 *
 * Three things here are invisible until they break. The picker has to reach
 * the 3D view — it is the only caller of `setCameraMode`, so nothing else
 * would notice if the wiring went. Collapsed, it has to keep naming the camera
 * you are on, or it says nothing at all. And a press on it must not reach the
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

const bar = (): HTMLElement => document.querySelector('.race-cams')!;
const toggle = (): HTMLButtonElement => document.querySelector('.race-cam-toggle')!;
const option = (cam: RaceCameraMode): HTMLButtonElement =>
  document.querySelector(`.race-cam-btn[data-cam="${cam}"]`)!;
const isOpen = (): boolean => bar().classList.contains('is-open');

describe('camera bar', () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('opens closed, naming the camera the race was started with', () => {
    mountCameraBar(host, fakeView(), 'aerial');

    expect(isOpen()).toBe(false);
    expect(toggle().textContent).toContain('Aerial');
    expect(option('aerial').classList.contains('is-active')).toBe(true);
  });

  it('names the broadcast camera when none was asked for', () => {
    mountCameraBar(host, fakeView(), undefined);
    expect(toggle().textContent).toContain('Broadcast');
  });

  it('shows the options on a click, and hides them again', () => {
    mountCameraBar(host, fakeView(), undefined);

    toggle().click();
    expect(isOpen()).toBe(true);
    toggle().click();
    expect(isOpen()).toBe(false);
  });

  it('tells the view about a pick, then collapses onto it', () => {
    const view = fakeView();
    mountCameraBar(host, view, undefined);

    toggle().click();
    option('chase').click();

    expect(view.modes).toEqual(['chase']);
    expect(isOpen()).toBe(false);
    expect(toggle().textContent).toContain('Chase');
    const active = document.querySelectorAll('.race-cam-btn.is-active');
    expect(active.length).toBe(1);
    expect(active[0]!.getAttribute('data-cam')).toBe('chase');
  });

  it('shuts when the press lands on the race instead', () => {
    mountCameraBar(host, fakeView(), undefined);
    toggle().click();

    host.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(isOpen()).toBe(false);
  });

  it('keeps its own presses off the stage, so changing camera costs no charge', () => {
    const ridden = vi.fn();
    host.addEventListener('pointerdown', ridden);
    mountCameraBar(host, fakeView(), undefined);

    toggle().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    option('aerial').dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(ridden).not.toHaveBeenCalled();
  });

  it('takes its window listeners with it when the race ends', () => {
    const picker = mountCameraBar(host, fakeView(), undefined);
    const off = vi.spyOn(window, 'removeEventListener');

    picker.destroy();

    expect(document.querySelector('.race-cams')).toBeNull();
    expect(off).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(off).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
