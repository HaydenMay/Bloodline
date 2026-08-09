import type { Horse } from '../sim/types.js';
import type { RivalDossier } from './career.js';
import { hashId, RIVAL_SILKS } from '../render/palette.js';
import { mountCarousel } from './carousel.js';
import { createBadgeElement } from './badgeLoader.js';

export function mountDossierScreen(
  host: HTMLElement,
  field: Horse[],
  player: Horse,
  dossier: RivalDossier,
  onContinue: () => void,
): () => void {
  const rivals = field.filter((h) => h.id !== player.id);

  if (rivals.length === 0) {
    console.error('Dossier: no rivals in field', { fieldLength: field.length, playerID: player.id });
  }

  // Map rival IDs to their silks (consistent across carousel)
  const silksFor = new Map<string, typeof RIVAL_SILKS[0]>();
  const taken = new Set<number>();

  silksFor.set(player.id, RIVAL_SILKS[0]!); // Reserve player's slot
  taken.add(0);

  for (const rival of rivals) {
    let slot = hashId(rival.id) % RIVAL_SILKS.length;
    while (taken.has(slot)) slot = (slot + 1) % RIVAL_SILKS.length;
    taken.add(slot);
    silksFor.set(rival.id, RIVAL_SILKS[slot]!);
  }

  const badgeCache = new Map<string, string>();

  const renderItem = (rival: Horse): HTMLElement => {
    const entry = dossier[rival.id];
    const formText = entry
      ? `${entry.starts} starts · ${entry.wins}W ${entry.places}P ${entry.shows}S`
      : 'No prior races';

    const container = document.createElement('div');
    container.className = 'dc-carousel-box';

    const badgeWrap = createBadgeElement(rival.coat, silksFor.get(rival.id)!, badgeCache, rival.id, 'dc-badge', 'Rival badge');
    const infoEl = document.createElement('div');
    infoEl.className = 'dc-carousel-info';

    container.appendChild(badgeWrap);
    container.appendChild(infoEl);

    infoEl.innerHTML = `
      <div class="dc-head">
        <h3>${rival.name}</h3>
        <p class="dc-sub">${formText}</p>
      </div>
      <div class="dc-section">Details</div>
      <div class="dc-row">
        <div><span class="dc-k">Style</span><span class="dc-v">${styleLabel(rival.style)}</span></div>
        <div><span class="dc-k">Timing</span><span class="dc-v">${momentLabel(rival.moment)}</span></div>
      </div>
      <div class="dc-section">Distance</div>
      <div class="dc-apt">
        <span>${rival.preferredDistance.min}–${rival.preferredDistance.max} m</span>
      </div>
      <div class="dc-section">Attributes</div>
      <div class="dc-stats">
        <div class="dc-stat" title="Acceleration and top speed during races">
          <span class="dc-stat-label">Speed</span>
          <span class="dc-stat-value">${Math.round(rival.stats.speed)}</span>
        </div>
        <div class="dc-stat" title="Endurance to maintain effort over distance">
          <span class="dc-stat-label">Stamina</span>
          <span class="dc-stat-value">${Math.round(rival.stats.stamina)}</span>
        </div>
        <div class="dc-stat" title="Ability to accelerate rapidly in short bursts">
          <span class="dc-stat-label">Burst</span>
          <span class="dc-stat-value">${Math.round(rival.stats.burst)}</span>
        </div>
        <div class="dc-stat" title="Resilience and ability to recover when fatigued">
          <span class="dc-stat-label">Grit</span>
          <span class="dc-stat-value">${Math.round(rival.stats.grit)}</span>
        </div>
        <div class="dc-stat" title="Composure and ability to handle pressure in close races">
          <span class="dc-stat-label">Temper</span>
          <span class="dc-stat-value">${Math.round(rival.stats.temper)}</span>
        </div>
        <div class="dc-stat" title="Reliable performance across different race conditions">
          <span class="dc-stat-label">Consistency</span>
          <span class="dc-stat-value">${Math.round(rival.stats.consistency)}</span>
        </div>
      </div>
    `;

    return container;
  };

  const { teardown, state } = mountCarousel(host, {
    items: rivals,
    renderItem,
    onSelect: onContinue,
    title: 'Field Dossier',
    selectLabel: 'Start Race',
    className: 'dossier-carousel',
    cssPrefix: 'dc',
    showCounter: true,
    showDots: true,
    showArrows: true,
  });

  // Swipe support
  let touchStartX = 0;
  let touchStartY = 0;
  const onTouchStart = (e: TouchEvent): void => {
    touchStartX = e.touches[0]!.clientX;
    touchStartY = e.touches[0]!.clientY;
  };
  const onTouchEnd = (e: TouchEvent): void => {
    const dx = e.changedTouches[0]!.clientX - touchStartX;
    const dy = e.changedTouches[0]!.clientY - touchStartY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) state.prev();
      else state.next();
    }
  };

  host.addEventListener('touchstart', onTouchStart, { passive: true });
  host.addEventListener('touchend', onTouchEnd, { passive: true });

  const originalTeardown = teardown;
  return (): void => {
    host.removeEventListener('touchstart', onTouchStart);
    host.removeEventListener('touchend', onTouchEnd);
    originalTeardown();
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
