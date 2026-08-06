import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import { generateStarterSix } from '../sim/horse.js';
import type { Horse } from '../sim/types.js';
import { hashId, RIVAL_SILKS, type Silks } from '../render/palette.js';
import { getBadgeDataUri } from '../render/shieldBadge.js';
import { TRAITS } from '../data/traits.js';
import { mountCarousel } from './carousel.js';

export function mountStarterSelection(
  container: HTMLElement,
  onSelect: (horse: Horse, silks: Silks) => void,
): () => void {
  const rng = createRng(`starter-${Date.now()}`);
  const names = createNameGenerator(rng);
  const starters = generateStarterSix(rng, names, 0);

  const silksFor = new Map<string, Silks>();
  const taken = new Set<number>();
  for (const h of starters) {
    let slot = hashId(h.id) % RIVAL_SILKS.length;
    while (taken.has(slot)) slot = (slot + 1) % RIVAL_SILKS.length;
    taken.add(slot);
    silksFor.set(h.id, RIVAL_SILKS[slot]!);
  }

  const badgeCache = new Map<string, string>();

  const renderItem = (horse: Horse): HTMLElement => {
    const container = document.createElement('div');
    container.className = 'sc-container';

    const wrapper = document.createElement('div');
    wrapper.className = 'sc-inner';
    container.appendChild(wrapper);

    const badgeWrap = document.createElement('div');
    badgeWrap.className = 'sc-badge-wrap';

    const badgeCol = document.createElement('div');
    badgeCol.className = 'sc-badge-col';

    const infoCol = document.createElement('div');
    infoCol.className = 'sc-info-col';

    const infoEl = document.createElement('div');
    infoEl.className = 'sc-info';

    badgeCol.appendChild(badgeWrap);
    infoCol.appendChild(infoEl);
    wrapper.appendChild(badgeCol);
    wrapper.appendChild(infoCol);

    // Load or use cached badge
    if (badgeCache.has(horse.id)) {
      const img = document.createElement('img');
      img.alt = 'Horse badge';
      img.className = 'sc-badge';
      img.src = badgeCache.get(horse.id)!;
      badgeWrap.appendChild(img);
    } else {
      void getBadgeDataUri({ coat: horse.coat, silks: silksFor.get(horse.id)! }).then((uri) => {
        if (uri) {
          badgeCache.set(horse.id, uri);
          const img = badgeWrap.querySelector('img') as HTMLImageElement;
          if (img) img.src = uri;
        }
      });
      const img = document.createElement('img');
      img.alt = 'Horse badge';
      img.className = 'sc-badge';
      badgeWrap.appendChild(img);
    }

    infoEl.innerHTML = `
      <h3>${horse.name}</h3>
      <p class="sc-style">${styleLabel(horse.style)} &middot; ${momentLabel(horse.moment)}</p>
      <div class="sc-distance">
        <span class="sc-label">Preferred distance</span>
        <span class="sc-value">${horse.preferredDistance.min}&ndash;${horse.preferredDistance.max} m</span>
      </div>
      <div class="sc-stats">
        <div class="stat">
          <span class="stat-label">Speed</span>
          <span class="stat-value">${Math.round(horse.stats.speed)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Stamina</span>
          <span class="stat-value">${Math.round(horse.stats.stamina)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Burst</span>
          <span class="stat-value">${Math.round(horse.stats.burst)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Grit</span>
          <span class="stat-value">${Math.round(horse.stats.grit)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Temper</span>
          <span class="stat-value">${Math.round(horse.stats.temper)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Consistency</span>
          <span class="stat-value">${Math.round(horse.stats.consistency)}</span>
        </div>
      </div>
      <div class="sc-traits">
        <span class="sc-label">Traits &middot; tap to see what one does</span>
        <div class="traits-list">
          ${horse.traits
            .map(
              (t) =>
                `<button type="button" class="trait-tag" data-trait="${t}">${TRAITS[t].name}</button>`,
            )
            .join('')}
        </div>
        <div class="trait-desc" id="trait-desc-${horse.id}" hidden></div>
      </div>
    `;

    const traitDesc = infoEl.querySelector<HTMLDivElement>(`#trait-desc-${horse.id}`)!;
    const traitTags = infoEl.querySelectorAll<HTMLButtonElement>('.trait-tag');
    traitTags.forEach((tag) => {
      tag.addEventListener('click', () => {
        const id = tag.dataset.trait as keyof typeof TRAITS;
        const isCurrentlyOpen = tag.classList.contains('is-open');
        traitTags.forEach((other) => other.classList.remove('is-open'));
        traitDesc.hidden = true;
        if (!isCurrentlyOpen) {
          tag.classList.add('is-open');
          const trait = TRAITS[id];
          const affinityHtml = trait.statAffinity
            ? `<span class="trait-affinity trait-aff-${trait.statAffinity} ${trait.statEffect === 1 ? 'raises' : trait.statEffect === -1 ? 'lowers' : ''}">${trait.statAffinity}</span>`
            : '';
          const tagsHtml = trait.tags && trait.tags.length > 0
            ? `<div class="trait-tags-list">${trait.tags.map((t) => `<span class="trait-tag-item">${t}</span>`).join('')}</div>`
            : '';
          traitDesc.innerHTML = `
            <p class="trait-desc-text">${trait.description}</p>
            ${affinityHtml}
            ${tagsHtml}
          `;
          traitDesc.hidden = false;
        }
      });
    });

    return container;
  };

  const { teardown, state } = mountCarousel(container, {
    items: starters,
    renderItem,
    onSelect: (horse) => onSelect(horse, silksFor.get(horse.id)!),
    title: 'Choose Your Starter',
    selectLabel: 'Select',
    className: 'starter-carousel',
    cssPrefix: 'sc',
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

  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchend', onTouchEnd, { passive: true });

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
