import { createSurface, startLoop, type Loop } from '../render/canvas.js';
import { drawBackdrop } from '../render/track.js';
import type { Camera } from '../render/track.js';

export interface RaceIntroConfig {
  name: string;
  distance: number;
  going: string;
  fieldSize: number;
  prize: number;
}

/**
 * Race intro screen.
 *
 * Displays race details over a blurred, panning track background with cinematic
 * atmosphere. On click: fades out details, shows "Riders....take your marks",
 * then transitions to race screen.
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

  // Canvas for blurred track background
  const surface = createSurface(container);
  surface.canvas.className = 'race-intro-canvas';
  surface.canvas.style.filter = 'blur(8px)';
  surface.canvas.style.position = 'absolute';
  surface.canvas.style.top = '0';
  surface.canvas.style.left = '0';
  surface.canvas.style.zIndex = '1';

  // Content overlay
  const content = document.createElement('div');
  content.className = 'race-intro-content';
  content.style.position = 'relative';
  content.style.zIndex = '2';

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
    <div class="race-intro-cue">Tap to continue</div>
  `;

  container.appendChild(content);
  host.appendChild(container);

  // Track background animation
  let time = 0;
  const camera: Camera = {
    scrollMetres: 0,
    pixelsPerMetre: 2,
  };

  const loop: Loop | null = startLoop(
    30,
    () => {
      time += 1 / 30;
      // Pan camera slowly across track (subtle motion)
      camera.scrollMetres = (time * 50) % 1400;
    },
    () => {
      const ctx = surface.ctx;
      drawBackdrop(ctx, surface.canvas.width, surface.canvas.height, camera, 0.5);
    },
  );

  let clicked = false;

  // Click/tap to advance
  const onClick = (): void => {
    if (clicked) return;
    clicked = true;

    // Unfade the background (reduce blur)
    surface.canvas.classList.add('unfade');

    // Fade out intro details
    content.classList.add('fade-out');

    // Show "Riders...." first
    setTimeout(() => {
      const ridersText = document.createElement('div');
      ridersText.className = 'race-intro-marker riders';
      ridersText.textContent = 'Riders....';
      container.appendChild(ridersText);

      // Then "take your marks" slides in
      setTimeout(() => {
        const marksText = document.createElement('div');
        marksText.className = 'race-intro-marker marks';
        marksText.textContent = 'take your marks';
        container.appendChild(marksText);

        // After all animations, continue to race
        setTimeout(() => {
          cleanup();
          onContinue();
        }, 1200);
      }, 600);
    }, 300);
  };

  container.addEventListener('click', onClick);

  // Trigger animation
  requestAnimationFrame(() => {
    container.classList.add('show');
  });

  const cleanup = (): void => {
    container.removeEventListener('click', onClick);
    loop?.stop();
    container.remove();
  };

  return cleanup;
}
