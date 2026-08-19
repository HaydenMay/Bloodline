import { createSurface, startLoop, type Loop } from '../render/canvas.js';
import { chooseRaceSky, drawBackdrop, loadRaceBackgroundImages } from '../render/track.js';
import type { Camera } from '../render/track.js';

export interface RaceIntroConfig {
  name: string;
  distance: number;
  going: string;
  fieldSize: number;
  /** Total purse for the race. */
  prize: number;
  /** What first place actually collects, if the caller knows it. */
  toWinner?: number;
}

/**
 * Race intro screen.
 *
 * Race details over a blurred, panning track. Tapping fades them out, shows
 * "Riders…. take your marks", and hands over to the race screen.
 *
 * **Nothing is decided here.** Every choice — studying the opposition, race-day
 * items, backing your own horse — belongs to the Race Day screen before it. By
 * the time this plays the horse is walking to the gate, so the intro is a
 * loading screen with atmosphere rather than a place to press things.
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

  // Picked here, once per race — raceIntro mounts before raceScreen on every
  // path into a race, so picking anywhere else risks the sky changing
  // between the intro card and the race itself.
  void loadRaceBackgroundImages().then(chooseRaceSky);

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
        <span class="rid-label">Purse</span>
        <span class="rid-value">$${config.prize.toLocaleString()}</span>
      </div>
      ${
        config.toWinner === undefined
          ? ''
          : `<div class="rid-row">
        <span class="rid-label">To the winner</span>
        <span class="rid-value">$${config.toWinner.toLocaleString()}</span>
      </div>`
      }
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
