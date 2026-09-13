import type { Stable } from './career.js';

export interface SettingsScreenCallbacks {
  onSave: (stable: Stable) => void;
  onBack: () => void;
}

/**
 * Release settings deliberately contain only controls with a live effect.
 * Audio, difficulty and driving assists are not shown until their systems can
 * honour a saved choice on every supported device.
 */
export function mountSettingsScreen(
  container: HTMLElement,
  stable: Stable,
  callbacks: SettingsScreenCallbacks,
): () => void {
  const root = document.createElement('main');
  root.className = 'settings-screen';
  root.innerHTML = `
    <div class="settings-container">
      <div class="settings-topbar">
        <button class="btn-back" type="button" id="settings-back">← Back</button>
        <h1>Settings</h1>
        <span aria-hidden="true"></span>
      </div>
      <section class="settings-card" aria-labelledby="accessibility-heading">
        <h2 id="accessibility-heading">Accessibility</h2>
        <label class="settings-row" for="reduced-motion">
          <span><strong>Reduced motion</strong><small>Shortens decorative transitions and animation.</small></span>
          <input id="reduced-motion" type="checkbox" ${stable.settings.reducedMotion ? 'checked' : ''} />
        </label>
        <label class="settings-row" for="text-scale">
          <span><strong>Text and interface size</strong><small>Applies immediately across menus and race controls.</small></span>
          <select id="text-scale">
            <option value="0.9" ${stable.settings.textScale === 0.9 ? 'selected' : ''}>Small</option>
            <option value="1" ${stable.settings.textScale === 1 ? 'selected' : ''}>Default</option>
            <option value="1.1" ${stable.settings.textScale === 1.1 ? 'selected' : ''}>Large</option>
            <option value="1.2" ${stable.settings.textScale === 1.2 ? 'selected' : ''}>Largest</option>
          </select>
        </label>
      </section>
      <section class="settings-card" aria-labelledby="race-heading">
        <h2 id="race-heading">Race controls</h2>
        <label class="settings-row" for="autopilot-default">
          <span><strong>Start races on autopilot</strong><small>You can still choose to take over before the race begins.</small></span>
          <input id="autopilot-default" type="checkbox" ${stable.settings.autopilotEnabled ? 'checked' : ''} />
        </label>
      </section>
      <p class="settings-note">Bloodline Early Access uses the polished 2D race view on every supported device.</p>
    </div>
  `;
  container.appendChild(root);

  const save = (): void => {
    stable.settings.reducedMotion = root.querySelector<HTMLInputElement>('#reduced-motion')!.checked;
    stable.settings.textScale = Number(root.querySelector<HTMLSelectElement>('#text-scale')!.value);
    stable.settings.autopilotEnabled = root.querySelector<HTMLInputElement>('#autopilot-default')!.checked;
    callbacks.onSave(stable);
  };

  root.querySelector<HTMLInputElement>('#reduced-motion')!.addEventListener('change', save);
  root.querySelector<HTMLSelectElement>('#text-scale')!.addEventListener('change', save);
  root.querySelector<HTMLInputElement>('#autopilot-default')!.addEventListener('change', save);
  root.querySelector<HTMLButtonElement>('#settings-back')!.addEventListener('click', callbacks.onBack);

  return () => root.remove();
}
