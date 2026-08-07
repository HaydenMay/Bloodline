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
 * Displays race details (distance, going, field size, prize) with a fade-in
 * animation. Advances on tap/click so the player can appreciate the screen.
 *
 * Returns a teardown function.
 *
 * NOTE: drawHorse() is deprecated for now — the vectorized rig doesn't render
 * well at small scales or as watermarks. Consider sprite-based horse visuals
 * or alternative background treatments for Phase 6 visual polish.
 */
export function mountRaceIntro(
  host: HTMLElement,
  config: RaceIntroConfig,
  onContinue: () => void,
): () => void {
  const container = document.createElement('div');
  container.className = 'race-intro';

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
    <div class="race-intro-cue">Tap to continue</div>
  `;

  container.appendChild(content);
  host.appendChild(container);

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
    container.removeEventListener('click', onClick);
    container.remove();
  };

  return cleanup;
}
