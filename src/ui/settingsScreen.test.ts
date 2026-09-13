// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStable } from './career.js';
import { mountSettingsScreen } from './settingsScreen.js';

describe('settings screen', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('persists only settings with a live release effect', () => {
    const stable = createStable('settings-screen');
    const onSave = vi.fn();
    mountSettingsScreen(document.body, stable, { onSave, onBack: vi.fn() });

    const reducedMotion = document.querySelector<HTMLInputElement>('#reduced-motion')!;
    const textScale = document.querySelector<HTMLSelectElement>('#text-scale')!;
    const autopilot = document.querySelector<HTMLInputElement>('#autopilot-default')!;
    reducedMotion.click();
    textScale.value = '1.2';
    textScale.dispatchEvent(new Event('change'));
    autopilot.click();

    expect(stable.settings).toEqual({ reducedMotion: true, textScale: 1.2, autopilotEnabled: true });
    expect(onSave).toHaveBeenCalledTimes(3);
    expect(document.body.textContent).not.toContain('3D');
  });
});
