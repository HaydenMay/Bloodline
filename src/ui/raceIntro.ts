import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';
import { drawHorse, type HorsePose } from '../render/horse.js';

export interface RaceIntroConfig {
  name: string;
  distance: number;
  going: string;
  fieldSize: number;
  prize: number;
  playerHorse?: Horse;
  playerSilks?: Silks;
}

/**
 * Race intro screen.
 *
 * Displays race details (distance, going, field size, prize) with a fade-in
 * animation. Auto-advances after 2.5 seconds or on tap/click.
 *
 * Returns a teardown function.
 */
export function mountRaceIntro(
  host: HTMLElement,
  config: RaceIntroConfig,
  onContinue: () => void,
): () => void {
  const container = document.createElement('div');
  container.className = 'race-intro';

  // Add horse canvas if we have a player horse
  if (config.playerHorse && config.playerSilks) {
    const canvas = document.createElement('canvas');
    canvas.className = 'race-intro-horse-canvas';
    canvas.width = 300;
    canvas.height = 300;
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw horse in relaxed standing pose
      const pose: HorsePose = {
        phase: 0.25, // Standing position
        intensity: 0,
        drive: 0,
      };

      drawHorse(ctx, 150, 180, {
        coat: config.playerHorse.coat,
        silks: config.playerSilks,
        pose,
        scale: 1.2,
        faded: true,
      });
    }
  }

  const content = document.createElement('div');
  content.className = 'race-intro-content';

  content.innerHTML = `
    <div class="race-intro-title">${config.name}</div>
    <div class="race-intro-details">
      <div class="rid-row">
        <span class="rid-label">Distance</span>
        <span class="rid-value">${config.distance} m</span>
      </div>
      <div class="rid-row">
        <span class="rid-label">Going</span>
        <span class="rid-value">${config.going}</span>
      </div>
      <div class="rid-row">
        <span class="rid-label">Field</span>
        <span class="rid-value">${config.fieldSize} runners</span>
      </div>
      <div class="rid-row">
        <span class="rid-label">Prize</span>
        <span class="rid-value">$${config.prize.toLocaleString()}</span>
      </div>
    </div>
    <div class="race-intro-cue">Tap to continue · Auto-start in 2s</div>
  `;

  container.appendChild(content);
  host.appendChild(container);

  // Auto-advance after 2.5s
  const timer = setTimeout(() => {
    cleanup();
    onContinue();
  }, 2500);

  // Click/tap to advance
  const onClick = (): void => {
    cleanup();
    onContinue();
  };
  container.addEventListener('click', onClick);

  // Trigger animation
  requestAnimationFrame(() => {
    container.classList.add('show');
  });

  const cleanup = (): void => {
    clearTimeout(timer);
    container.removeEventListener('click', onClick);
    container.remove();
  };

  return cleanup;
}
