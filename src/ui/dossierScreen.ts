import type { Horse } from '../sim/types.js';
import type { RivalDossier } from './career.js';
import { toGrade } from '../sim/types.js';

export function mountDossierScreen(
  host: HTMLElement,
  field: Horse[],
  player: Horse,
  dossier: RivalDossier,
  onContinue: () => void,
): () => void {
  const container = document.createElement('div');
  container.className = 'dossier-screen';

  const header = document.createElement('div');
  header.className = 'dossier-header';
  header.innerHTML = `
    <h1>Field Dossier</h1>
    <p class="dossier-subtitle">You're about to face these horses. Research them before you run.</p>
  `;
  container.appendChild(header);

  const fieldList = document.createElement('div');
  fieldList.className = 'dossier-field';

  // Rivals only (skip player)
  const rivals = field.filter((h) => h.id !== player.id);

  rivals.forEach((rival) => {
    const entry = dossier[rival.id];
    const card = createRivalCard(rival, entry);
    fieldList.appendChild(card);
  });

  container.appendChild(fieldList);

  const footer = document.createElement('div');
  footer.className = 'dossier-footer';
  footer.innerHTML = `
    <p class="dossier-tip">Tap a rival to see full stats</p>
    <button class="btn btn-primary" id="start-race-btn">Start Race</button>
  `;
  container.appendChild(footer);

  host.appendChild(container);

  const startBtn = container.querySelector<HTMLButtonElement>('#start-race-btn')!;
  startBtn.addEventListener('click', onContinue);

  return () => {
    container.remove();
  };
}

function createRivalCard(rival: Horse, entry: RivalDossier[string] | undefined): HTMLElement {
  const card = document.createElement('div');
  card.className = 'dossier-card';

  const winRatio = entry ? `${entry.wins}W` : 'Unraced';
  const placeRatio = entry ? `${entry.places}P` : '';
  const formText = entry
    ? `${entry.starts} starts · ${entry.wins}W ${entry.places}P ${entry.shows}S`
    : 'No history';

  const speedGrade = toGrade(rival.stats.speed);
  const staminaGrade = toGrade(rival.stats.stamina);
  const burstGrade = toGrade(rival.stats.burst);
  const gritGrade = toGrade(rival.stats.grit);
  const consistencyGrade = toGrade(rival.stats.consistency);

  const styleLabel = getStyleLabel(rival.style);
  const momentLabel = getMomentLabel(rival.moment);

  card.innerHTML = `
    <div class="dossier-card-header">
      <div class="dossier-name">${rival.name}</div>
      <div class="dossier-record">${winRatio} ${placeRatio}</div>
    </div>
    <div class="dossier-card-body">
      <div class="dossier-details">
        <span class="dossier-label">Style:</span>
        <span class="dossier-value">${styleLabel}</span>
      </div>
      <div class="dossier-details">
        <span class="dossier-label">Timing:</span>
        <span class="dossier-value">${momentLabel}</span>
      </div>
      <div class="dossier-details">
        <span class="dossier-label">Distance:</span>
        <span class="dossier-value">${rival.preferredDistance.min}–${rival.preferredDistance.max}m</span>
      </div>
      <div class="dossier-form-text">${formText}</div>
    </div>
    <div class="dossier-card-grades">
      <div class="grade-item" title="Speed">
        <span class="grade-label">Spd</span>
        <span class="grade-value">${speedGrade}</span>
      </div>
      <div class="grade-item" title="Stamina">
        <span class="grade-label">Stm</span>
        <span class="grade-value">${staminaGrade}</span>
      </div>
      <div class="grade-item" title="Burst">
        <span class="grade-label">Bst</span>
        <span class="grade-value">${burstGrade}</span>
      </div>
      <div class="grade-item" title="Grit">
        <span class="grade-label">Grt</span>
        <span class="grade-value">${gritGrade}</span>
      </div>
      <div class="grade-item" title="Consistency">
        <span class="grade-label">Con</span>
        <span class="grade-value">${consistencyGrade}</span>
      </div>
    </div>
  `;

  // Click to expand and show all stats
  card.addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  return card;
}

function getStyleLabel(style: string): string {
  const labels: Record<string, string> = {
    frontRunner: 'Front-runner',
    stalker: 'Stalker',
    midPack: 'Mid-pack',
    closer: 'Closer',
  };
  return labels[style] || style;
}

function getMomentLabel(moment: string): string {
  const labels: Record<string, string> = {
    early: 'Early',
    earlyMid: 'Early-mid',
    midLate: 'Mid-late',
    late: 'Late',
  };
  return labels[moment] || moment;
}
