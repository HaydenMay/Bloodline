import type { Horse } from '../sim/types.js';
import type { RivalDossier } from './career.js';
import { hashId, RIVAL_SILKS } from '../render/palette.js';
import { getBadgeDataUri } from '../render/shieldBadge.js';
import { mountCarousel } from './carousel.js';

export function mountDossierScreen(
  host: HTMLElement,
  field: Horse[],
  player: Horse,
  dossier: RivalDossier,
  onContinue: () => void,
): () => void {
  const rivals = field.filter((h) => h.id !== player.id);

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

    const wrapper = document.createElement('div');
    wrapper.className = 'dc-inner';

    const badgeWrap = document.createElement('div');
    badgeWrap.className = 'dc-badge-wrap';

    // Load or use cached badge
    if (badgeCache.has(rival.id)) {
      const img = document.createElement('img');
      img.alt = 'Rival badge';
      img.className = 'dc-badge';
      img.src = badgeCache.get(rival.id)!;
      badgeWrap.appendChild(img);
    } else {
      void getBadgeDataUri({ coat: rival.coat, silks: silksFor.get(rival.id)! }).then((uri) => {
        if (uri) {
          badgeCache.set(rival.id, uri);
          const img = badgeWrap.querySelector('img') as HTMLImageElement;
          if (img) img.src = uri;
        }
      });
      const img = document.createElement('img');
      img.alt = 'Rival badge';
      img.className = 'dc-badge';
      badgeWrap.appendChild(img);
    }

    const infoEl = document.createElement('div');
    infoEl.className = 'dc-info-wrap';
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

    wrapper.appendChild(badgeWrap);
    wrapper.appendChild(infoEl);

    return wrapper;
  };

  const { teardown } = mountCarousel(host, {
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

  return teardown;
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
