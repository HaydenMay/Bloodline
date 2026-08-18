import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import { generateStarterSix } from '../sim/horse.js';
import type { Horse } from '../sim/types.js';
import { coatForHorse, hashId, RIVAL_SILKS, type Silks } from '../render/palette.js';
import { TRAITS } from '../data/traits.js';
import { mountCarousel } from './carousel.js';
import { createBadgeElement } from './badgeLoader.js';

export function mountStarterSelection(
  container: HTMLElement,
  onSelect: (horse: Horse, silks: Silks) => void,
  /**
   * The yard's prestige. DESIGN.md §13: the pool scales with the stable so a
   * fresh line is never a punishment — a well-known yard is offered better
   * yearlings. It scales *with* the stable, not past it: a starter is still
   * generation 1 and inherits nothing, so it never matches what a good
   * bloodline produces (§1).
   */
  stablePrestige = 0,
): () => void {
  const rng = createRng(`starter-${Date.now()}`);
  const names = createNameGenerator(rng);
  const starters = generateStarterSix(rng, names, stablePrestige);

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
    // Close any open trait tooltips from previous horse
    document.querySelectorAll<HTMLButtonElement>('.trait-tag.is-open').forEach((tag) => {
      tag.classList.remove('is-open');
    });
    document.querySelectorAll<HTMLDivElement>('.trait-desc').forEach((desc) => {
      desc.hidden = true;
    });

    const container = document.createElement('div');
    container.className = 'sc-carousel-box';

    const badgeWrap = createBadgeElement(coatForHorse(horse), silksFor.get(horse.id)!, badgeCache, horse.id, 'sc-badge', 'Horse badge');
    const infoEl = document.createElement('div');
    infoEl.className = 'sc-carousel-info';

    container.appendChild(badgeWrap);
    container.appendChild(infoEl);

    infoEl.innerHTML = `
      <div class="sc-head">
        <h3>${horse.name}</h3>
        <p class="sc-sub">${styleLabel(horse.style)} &middot; ${momentLabel(horse.moment)}</p>
      </div>
      <div class="sc-section">Distance</div>
      <div class="sc-apt">
        <span>${horse.preferredDistance.min}–${horse.preferredDistance.max} m</span>
      </div>
      <div class="sc-section">Attributes</div>
      <div class="sc-stats">
        <div class="sc-stat" title="Acceleration and top speed during races">
          <span class="sc-stat-label">Speed</span>
          <span class="sc-stat-value">${Math.round(horse.stats.speed)}</span>
        </div>
        <div class="sc-stat" title="Endurance to maintain effort over distance">
          <span class="sc-stat-label">Stamina</span>
          <span class="sc-stat-value">${Math.round(horse.stats.stamina)}</span>
        </div>
        <div class="sc-stat" title="Ability to accelerate rapidly in short bursts">
          <span class="sc-stat-label">Burst</span>
          <span class="sc-stat-value">${Math.round(horse.stats.burst)}</span>
        </div>
        <div class="sc-stat" title="Resilience and ability to recover when fatigued">
          <span class="sc-stat-label">Grit</span>
          <span class="sc-stat-value">${Math.round(horse.stats.grit)}</span>
        </div>
        <div class="sc-stat" title="Composure and ability to handle pressure in close races">
          <span class="sc-stat-label">Temper</span>
          <span class="sc-stat-value">${Math.round(horse.stats.temper)}</span>
        </div>
        <div class="sc-stat" title="Reliable performance across different race conditions">
          <span class="sc-stat-label">Consistency</span>
          <span class="sc-stat-value">${Math.round(horse.stats.consistency)}</span>
        </div>
      </div>
      <div class="sc-section">Traits</div>
      <div class="sc-traits">
        ${horse.traits
          .map(
            (t) =>
              `<button type="button" class="trait-tag" data-trait="${t}">${TRAITS[t].name}</button>`,
          )
          .join('')}
      </div>
    `;

    // Create portal element for trait description (outside container)
    const traitDesc = document.createElement('div');
    traitDesc.className = 'trait-desc';
    traitDesc.hidden = true;
    document.body.appendChild(traitDesc);

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

          // Position near the clicked tag
          const tagRect = tag.getBoundingClientRect();
          const descRect = traitDesc.getBoundingClientRect();
          const top = Math.max(8, tagRect.bottom + 8);
          const left = Math.max(8, Math.min(tagRect.left + tagRect.width / 2 - descRect.width / 2, window.innerWidth - descRect.width - 8));
          traitDesc.style.left = `${left}px`;
          traitDesc.style.top = `${top}px`;
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

  return () => {
    // Clean up all trait tooltips before tearing down
    document.querySelectorAll<HTMLDivElement>('.trait-desc').forEach((desc) => {
      desc.remove();
    });
    teardown();
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
