import type { Horse } from '../sim/types.js';
import type { RivalDossier } from './career.js';

export function mountDossierScreen(
  host: HTMLElement,
  field: Horse[],
  player: Horse,
  dossier: RivalDossier,
  onContinue: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'dossier-carousel';

  root.innerHTML = `
    <div class="dc-header">
      <h2>Field Dossier</h2>
      <span class="dc-counter" id="dc-counter"></span>
    </div>
    <div class="dc-stage">
      <button class="dc-arrow dc-arrow-prev" id="dc-prev" aria-label="Previous opponent">&#8249;</button>
      <div class="dc-info" id="dc-info"></div>
      <button class="dc-arrow dc-arrow-next" id="dc-next" aria-label="Next opponent">&#8250;</button>
    </div>
    <div class="dc-dots" id="dc-dots"></div>
    <button class="btn btn-primary dc-start" id="dc-start">Start Race</button>
  `;

  host.appendChild(root);

  // Rivals only (skip player)
  const rivals = field.filter((h) => h.id !== player.id);
  let index = 0;

  const infoEl = root.querySelector<HTMLDivElement>('#dc-info')!;
  const counterEl = root.querySelector<HTMLSpanElement>('#dc-counter')!;
  const dotsEl = root.querySelector<HTMLDivElement>('#dc-dots')!;
  const prevBtn = root.querySelector<HTMLButtonElement>('#dc-prev')!;
  const nextBtn = root.querySelector<HTMLButtonElement>('#dc-next')!;
  const startBtn = root.querySelector<HTMLButtonElement>('#dc-start')!;

  const goTo = (i: number): void => {
    index = ((i % rivals.length) + rivals.length) % rivals.length;
    renderDots();
    renderInfo();
  };

  function renderDots(): void {
    dotsEl.innerHTML = rivals
      .map(
        (_, i) =>
          `<button class="dc-dot ${i === index ? 'is-active' : ''}" data-i="${i}" aria-label="Opponent ${i + 1}"></button>`,
      )
      .join('');
    dotsEl.querySelectorAll<HTMLButtonElement>('.dc-dot').forEach((dot) => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });
  }

  function renderInfo(): void {
    const rival = rivals[index]!;
    const entry = dossier[rival.id];

    counterEl.textContent = `${index + 1} / ${rivals.length}`;

    const formText = entry
      ? `${entry.starts} starts · ${entry.wins}W ${entry.places}P ${entry.shows}S`
      : 'No prior races';

    infoEl.innerHTML = `
      <h3>${rival.name}</h3>
      <p class="dc-form">${formText}</p>
      <div class="dc-style">
        <span class="dc-label">Style:</span>
        <span class="dc-value">${styleLabel(rival.style)}</span>
      </div>
      <div class="dc-timing">
        <span class="dc-label">Timing:</span>
        <span class="dc-value">${momentLabel(rival.moment)}</span>
      </div>
      <div class="dc-distance">
        <span class="dc-label">Preferred distance</span>
        <span class="dc-value">${rival.preferredDistance.min}–${rival.preferredDistance.max} m</span>
      </div>
      <div class="dc-stats">
        <div class="dc-stat">
          <span class="dc-stat-label">Speed</span>
          <span class="dc-stat-value">${Math.round(rival.stats.speed)}</span>
        </div>
        <div class="dc-stat">
          <span class="dc-stat-label">Stamina</span>
          <span class="dc-stat-value">${Math.round(rival.stats.stamina)}</span>
        </div>
        <div class="dc-stat">
          <span class="dc-stat-label">Burst</span>
          <span class="dc-stat-value">${Math.round(rival.stats.burst)}</span>
        </div>
        <div class="dc-stat">
          <span class="dc-stat-label">Grit</span>
          <span class="dc-stat-value">${Math.round(rival.stats.grit)}</span>
        </div>
        <div class="dc-stat">
          <span class="dc-stat-label">Temper</span>
          <span class="dc-stat-value">${Math.round(rival.stats.temper)}</span>
        </div>
        <div class="dc-stat">
          <span class="dc-stat-label">Consistency</span>
          <span class="dc-stat-value">${Math.round(rival.stats.consistency)}</span>
        </div>
      </div>
    `;
  }

  prevBtn.addEventListener('click', () => goTo(index - 1));
  nextBtn.addEventListener('click', () => goTo(index + 1));
  startBtn.addEventListener('click', onContinue);

  renderDots();
  renderInfo();

  return () => {
    root.remove();
  };
}

function styleLabel(style: string): string {
  const labels: Record<string, string> = {
    frontRunner: 'Front-runner',
    stalker: 'Stalker',
    midPack: 'Mid-pack',
    closer: 'Closer',
  };
  return labels[style] || style;
}

function momentLabel(moment: string): string {
  const labels: Record<string, string> = {
    early: 'Early',
    earlyMid: 'Early-mid',
    midLate: 'Mid-late',
    late: 'Late',
  };
  return labels[moment] || moment;
}
