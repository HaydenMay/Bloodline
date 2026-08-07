/**
 * Pre-race decision screen.
 *
 * Lets the player choose whether to view the dossier (opponents/form)
 * or go straight to the race intro.
 */
export function mountPreRaceScreen(
  host: HTMLElement,
  onShowOpponents: () => void,
  onGoToRace: () => void,
): () => void {
  const container = document.createElement('div');
  container.className = 'pre-race-screen';

  const content = document.createElement('div');
  content.className = 'pre-race-content';

  content.innerHTML = `
    <div class="prs-header">
      <h2>Ready to race?</h2>
    </div>
    <div class="prs-buttons">
      <button class="prs-btn prs-dossier" data-action="opponents">
        <div class="prs-btn-label">Show Opponents</div>
        <div class="prs-btn-hint">See rival form and stats</div>
      </button>
      <button class="prs-btn prs-go" data-action="go">
        <div class="prs-btn-label">Go to Race</div>
        <div class="prs-btn-hint">Skip to the race intro</div>
      </button>
    </div>
  `;

  container.appendChild(content);
  host.appendChild(container);

  const handleOpponents = (): void => {
    cleanup();
    onShowOpponents();
  };

  const handleGo = (): void => {
    cleanup();
    onGoToRace();
  };

  const opponentsBtn = container.querySelector('[data-action="opponents"]') as HTMLButtonElement;
  const goBtn = container.querySelector('[data-action="go"]') as HTMLButtonElement;

  opponentsBtn.addEventListener('click', handleOpponents);
  goBtn.addEventListener('click', handleGo);

  // Trigger animation
  requestAnimationFrame(() => {
    container.classList.add('show');
  });

  const cleanup = (): void => {
    opponentsBtn.removeEventListener('click', handleOpponents);
    goBtn.removeEventListener('click', handleGo);
    container.remove();
  };

  return cleanup;
}
