import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import { generateStarterSix } from '../sim/horse.js';
import type { Horse } from '../sim/types.js';
import { createSurface, startLoop, type Loop } from '../render/canvas.js';
import { drawSpriteHorse, loadSprites } from '../render/spriteHorse.js';
import { hashId, RIVAL_SILKS, type Silks } from '../render/palette.js';
import { TRAITS } from '../data/traits.js';

/**
 * Starter selection, as a full-screen carousel.
 *
 * One horse at a time rather than a scrolling grid: six cards side by side
 * either got too small to read on a phone or needed a hover/scroll gesture
 * that doesn't exist on touch. A stepper needs neither — swipe, tap an arrow,
 * or tap a dot, and the horse being looked at always fills the screen.
 */
export function mountStarterSelection(
  container: HTMLElement,
  onSelect: (horse: Horse) => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'starter-carousel';

  root.innerHTML = `
    <div class="sc-header">
      <h2>Choose Your Starter</h2>
      <span class="sc-counter" id="sc-counter"></span>
    </div>
    <div class="sc-stage">
      <button class="sc-arrow sc-arrow-prev" id="sc-prev" aria-label="Previous horse">&#8249;</button>
      <div class="sc-canvas-wrap" id="sc-canvas-wrap"></div>
      <button class="sc-arrow sc-arrow-next" id="sc-next" aria-label="Next horse">&#8250;</button>
    </div>
    <div class="sc-info" id="sc-info"></div>
    <div class="sc-dots" id="sc-dots"></div>
    <button class="btn btn-primary sc-select" id="sc-select">Select</button>
  `;

  container.appendChild(root);

  const rng = createRng(`starter-${Date.now()}`);
  const names = createNameGenerator(rng);
  const starters = generateStarterSix(rng, names, 0);

  // Same silks-by-id rule as the race screen, but with collisions broken
  // across just these six — with only eight rival colours, a plain hash
  // draws a repeat about 60% of the time, and every option should look
  // distinct in the one moment they are all being compared.
  const silksFor = new Map<string, Silks>();
  const taken = new Set<number>();
  for (const h of starters) {
    let slot = hashId(h.id) % RIVAL_SILKS.length;
    while (taken.has(slot)) slot = (slot + 1) % RIVAL_SILKS.length;
    taken.add(slot);
    silksFor.set(h.id, RIVAL_SILKS[slot]!);
  }

  let index = 0;
  let phase = 0;

  const canvasWrap = root.querySelector<HTMLDivElement>('#sc-canvas-wrap')!;
  const infoEl = root.querySelector<HTMLDivElement>('#sc-info')!;
  const counterEl = root.querySelector<HTMLSpanElement>('#sc-counter')!;
  const dotsEl = root.querySelector<HTMLDivElement>('#sc-dots')!;
  const prevBtn = root.querySelector<HTMLButtonElement>('#sc-prev')!;
  const nextBtn = root.querySelector<HTMLButtonElement>('#sc-next')!;
  const selectBtn = root.querySelector<HTMLButtonElement>('#sc-select')!;

  const surface = createSurface(canvasWrap);
  void loadSprites();

  const goTo = (i: number): void => {
    index = ((i % starters.length) + starters.length) % starters.length;
    renderDots();
    renderInfo();
  };

  function renderDots(): void {
    dotsEl.innerHTML = starters
      .map(
        (_, i) =>
          `<button class="sc-dot ${i === index ? 'is-active' : ''}" data-i="${i}" aria-label="Horse ${i + 1}"></button>`,
      )
      .join('');
    dotsEl.querySelectorAll<HTMLButtonElement>('.sc-dot').forEach((dot) => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });
  }

  function renderInfo(): void {
    const horse = starters[index]!;
    counterEl.textContent = `${index + 1} / ${starters.length}`;
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
          <span class="stat-label">Grit</span>
          <span class="stat-value">${Math.round(horse.stats.grit)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Burst</span>
          <span class="stat-value">${Math.round(horse.stats.burst)}</span>
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
        <div class="trait-desc" id="trait-desc" hidden></div>
      </div>
    `;

    const traitDesc = infoEl.querySelector<HTMLDivElement>('#trait-desc')!;
    const traitTags = infoEl.querySelectorAll<HTMLButtonElement>('.trait-tag');
    traitTags.forEach((tag) => {
      tag.addEventListener('click', () => {
        const id = tag.dataset.trait as keyof typeof TRAITS;
        const opening = !tag.classList.contains('is-open');
        traitTags.forEach((other) => other.classList.remove('is-open'));
        traitDesc.hidden = true;
        if (opening) {
          tag.classList.add('is-open');
          const trait = TRAITS[id];
          const affinityHtml = trait.statAffinity
            ? `<span class="trait-affinity trait-aff-${trait.statAffinity}">${trait.statAffinity}</span>`
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
  }

  prevBtn.addEventListener('click', () => goTo(index - 1));
  nextBtn.addEventListener('click', () => goTo(index + 1));
  selectBtn.addEventListener('click', () => onSelect(starters[index]!));

  // Swipe: a horizontal drag past the threshold steps the carousel; anything
  // shorter (a tap, a vertical scroll attempt) is left alone.
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
      goTo(dx > 0 ? index - 1 : index + 1);
    }
  };
  canvasWrap.addEventListener('touchstart', onTouchStart, { passive: true });
  canvasWrap.addEventListener('touchend', onTouchEnd, { passive: true });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft') goTo(index - 1);
    if (e.key === 'ArrowRight') goTo(index + 1);
  };
  window.addEventListener('keydown', onKey);

  const loop: Loop = startLoop(
    30,
    () => {
      phase = (phase + (1 / 30) * 0.5) % 1;
    },
    () => {
      const { ctx, width, height } = surface;
      ctx.fillStyle = '#161c25';
      ctx.fillRect(0, 0, width, height);
      const horse = starters[index]!;
      const scale = Math.min(2.6, width / 220, height / 160);
      drawSpriteHorse(ctx, width / 2, height * 0.72, {
        coat: horse.coat,
        silks: silksFor.get(horse.id)!,
        phase,
        scale,
      });
    },
  );

  renderDots();
  renderInfo();

  return () => {
    loop.stop();
    window.removeEventListener('keydown', onKey);
    canvasWrap.removeEventListener('touchstart', onTouchStart);
    canvasWrap.removeEventListener('touchend', onTouchEnd);
    surface.destroy();
    root.remove();
  };
}

function styleLabel(style: string): string {
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
}

function momentLabel(moment: string): string {
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
}
