import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import { generateStarterSix } from '../sim/horse.js';
import type { Horse } from '../sim/types.js';
import { loadSprites, drawSpriteHorse } from '../render/spriteHorse.js';
import { RIVAL_SILKS } from '../render/palette.js';

export function mountStarterSelection(
  container: HTMLElement,
  onSelect: (horse: Horse) => void,
): () => void {
  const selection = document.createElement('div');
  selection.className = 'starter-selection';

  selection.innerHTML = `
    <div class="starter-header">
      <h2>Choose Your Starter</h2>
      <p>Select a horse to begin your career</p>
    </div>
    <div class="starter-grid" id="starter-grid"></div>
    <div class="starter-details" id="starter-details" style="display: none;"></div>
  `;

  container.appendChild(selection);

  // Generate starters
  const rng = createRng(`starter-${Date.now()}`);
  const names = createNameGenerator(rng);
  const starters = generateStarterSix(rng, names, 0);

  // Ensure sprites are loaded
  void loadSprites().then(() => {
    renderStarters(selection, starters, onSelect);
  });

  return () => {
    selection.remove();
  };
}

function renderStarters(container: HTMLElement, starters: Horse[], onSelect: (h: Horse) => void) {
  const grid = container.querySelector<HTMLDivElement>('#starter-grid')!;
  const detailsPanel = container.querySelector<HTMLDivElement>('#starter-details')!;

  for (const horse of starters) {
    const card = document.createElement('div');
    card.className = 'starter-card';

    // Canvas for sprite
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 150;
    const ctx = canvas.getContext('2d')!;

    // Draw the sprite
    drawSpriteHorse(ctx, 75, 100, {
      coat: horse.coat,
      silks: RIVAL_SILKS[0]!,
      phase: 0.5,
      scale: 0.6,
    });

    card.appendChild(canvas);

    const showCard = (): void => {
      showDetails(detailsPanel, horse, onSelect);
    };

    const hideCard = (): void => {
      detailsPanel.style.display = 'none';
    };

    card.addEventListener('mouseenter', showCard);
    card.addEventListener('mouseleave', hideCard);
    card.addEventListener('touchstart', (e) => {
      e.preventDefault();
      showCard();
    });
    card.addEventListener('touchend', hideCard);

    grid.appendChild(card);
  }
}

function showDetails(panel: HTMLDivElement, horse: Horse, onSelect: (h: Horse) => void) {
  const styleLabel = (style: string): string => {
    switch (style) {
      case 'frontRunner':
        return 'Front-runner';
      case 'stalker':
        return 'Stalker';
      case 'midPack':
        return 'Mid-pack';
      default:
        return 'Closer';
    }
  };

  const momentLabel = (moment: string): string => {
    switch (moment) {
      case 'early':
        return 'goes early';
      case 'earlyMid':
        return 'goes before halfway';
      case 'midLate':
        return 'goes off the turn';
      default:
        return 'goes late';
    }
  };

  panel.innerHTML = `
    <div class="starter-detail-card">
      <div class="detail-header">
        <h3>${horse.name}</h3>
        <p class="detail-style">${styleLabel(horse.style)} · ${momentLabel(horse.moment)}</p>
      </div>
      <div class="detail-distance">
        <span class="detail-label">Preferred distance</span>
        <span class="detail-value">${horse.preferredDistance.min}–${horse.preferredDistance.max} m</span>
      </div>
      <div class="detail-stats">
        <div class="stat">
          <span class="stat-label">Speed</span>
          <span class="stat-value">${Math.round(horse.stats.speed)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Stamina</span>
          <span class="stat-value">${Math.round(horse.stats.stamina)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Grit</span>
          <span class="stat-value">${Math.round(horse.stats.grit)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Burst</span>
          <span class="stat-value">${Math.round(horse.stats.burst)}</span>
        </div>
      </div>
      <div class="detail-traits">
        <span class="detail-label">Traits</span>
        <div class="traits-list">${horse.traits.map((t) => `<span class="trait-tag">${t}</span>`).join('')}</div>
      </div>
      <button class="btn btn-primary btn-select">Select</button>
    </div>
  `;

  panel.style.display = 'block';

  const selectBtn = panel.querySelector<HTMLButtonElement>('.btn-select')!;
  selectBtn.addEventListener('click', () => onSelect(horse));
}
