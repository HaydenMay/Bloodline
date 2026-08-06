import type { RunnerSnapshot } from '../sim/race/engine.js';
import { RIVAL_SILKS, type Silks } from '../render/palette.js';
import { attachInfoBox } from './infoBox.js';

export function mountResultsScreen(
  container: HTMLElement,
  placings: RunnerSnapshot[],
  playerHorseId: string,
  onReturn: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'results-screen';

  const playerHorse = placings.find((p) => p.id === playerHorseId);
  if (!playerHorse) throw new Error('Player horse not found in results');

  const playerPosition = placings.findIndex((p) => p.id === playerHorseId) + 1;

  root.innerHTML = `
    <div class="results-container">
      <div class="results-header">
        <h2>Race Results</h2>
        <div class="results-player-badge">
          <span class="badge-position">${playerPosition}</span>
          <span class="badge-name">${playerHorse.name}</span>
        </div>
      </div>
      <div class="results-list" id="results-list"></div>
      <button class="btn btn-primary results-return" id="return-btn">Return to Menu</button>
    </div>
  `;

  container.appendChild(root);

  const resultsList = root.querySelector<HTMLDivElement>('#results-list')!;
  const returnBtn = root.querySelector<HTMLButtonElement>('#return-btn')!;

  // Build results table
  const winnerTime = placings[0]!.finishTime ?? 0;
  placings.forEach((placing, i) => {
    const position = i + 1;
    const marginSecs = (placing.finishTime ?? winnerTime) - winnerTime;
    const marginLengths = Math.round(marginSecs * 20 * 10) / 10; // Rough conversion: 20 m/s ≈ horse length per 0.05s
    const isPlayer = placing.id === playerHorseId;

    const row = document.createElement('div');
    row.className = `results-row ${isPlayer ? 'is-player' : ''}`;
    row.innerHTML = `
      <span class="results-pos">${position}</span>
      <span class="results-name">${placing.name}</span>
      <span class="results-margin">${position === 1 ? 'WIN' : `+${marginLengths}L`}</span>
    `;

    row.addEventListener('click', () => {
      // Show info box for this horse
      const silks = RIVAL_SILKS[i % RIVAL_SILKS.length]!;
      showHorseInfo(placing, silks);
    });

    resultsList.appendChild(row);
  });

  returnBtn.addEventListener('click', onReturn);

  function showHorseInfo(horse: RunnerSnapshot, silks: Silks): void {
    const modal = document.createElement('div');
    modal.className = 'info-modal';

    const infoBox = document.createElement('div');
    infoBox.className = 'info-modal-content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'info-modal-close';
    closeBtn.textContent = '✕';

    const infoContent = document.createElement('div');
    infoContent.className = 'info-modal-horse';
    infoContent.innerHTML = `
      <h3>${horse.name}</h3>
      <p class="info-modal-rank">Finished: ${placings.findIndex((p) => p.id === horse.id) + 1}${['st', 'nd', 'rd'][Math.min(2, (placings.findIndex((p) => p.id === horse.id) + 1) % 10 - 1)] || 'th'}</p>
    `;

    infoBox.appendChild(closeBtn);
    infoBox.appendChild(infoContent);
    modal.appendChild(infoBox);

    closeBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    container.appendChild(modal);
  }

  return () => {
    root.remove();
  };
}
