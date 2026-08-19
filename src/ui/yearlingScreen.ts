import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import { generateStarterSix } from '../sim/horse.js';
import type { Horse } from '../sim/types.js';
import { TRAITS } from '../data/traits.js';
import { YEARLING_OFFERS, yearlingPrice } from '../data/yearling.js';
import type { Stable } from './career.js';
import { allKnownHorses } from './archiveTree.js';

/**
 * The sale ring — buying a yearling instead of breeding one.
 *
 * The other half of ROADMAP.md's "breed or buy, with buying explicitly weaker".
 * Everything on offer here is generation 1 and inherits nothing, which is why
 * the screen shows what the horse *is* rather than a projection: there is no
 * pairing behind it to project from, and that absence is the point.
 */

export interface YearlingScreenOptions {
  stable: Stable;
  /** Hands back the horse bought and the yard that paid for it. */
  onBuy: (horse: Horse, stable: Stable) => void;
  onBack: () => void;
  backLabel?: string;
}

const styleLabel = (style: string): string => style.charAt(0).toUpperCase() + style.slice(1);

export function mountYearlingScreen(
  container: HTMLElement,
  { stable, onBuy, onBack, backLabel = '← Back' }: YearlingScreenOptions,
): () => void {
  const root = document.createElement('div');
  root.className = 'breeding-screen';
  container.appendChild(root);

  const price = yearlingPrice(stable.legacy.archivedPoints);
  const affordable = stable.cash >= price;

  // Seeded from the yard's own history rather than the clock, so the sale ring
  // holds the same three horses however often the screen is redrawn. A list
  // that rerolled on every render would be a slot machine.
  const rng = createRng(`yearlings-${stable.careersCompleted}-${stable.bloodstock.length}`);
  // Every name already in the yard's history, not just bloodstock — a
  // yearling that only checked retired horses could still be handed the
  // same name as a rival out in the world.
  const names = createNameGenerator(
    rng,
    allKnownHorses(stable).map((horse) => horse.name),
  );
  const offers = generateStarterSix(rng, names, stable.legacy.archivedPoints).slice(
    0,
    YEARLING_OFFERS,
  );

  let chosen: Horse | undefined;
  const listeners: Array<() => void> = [];
  const on = (el: Element | null, event: string, handler: EventListener): void => {
    if (!el) return;
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  };

  function render(): void {
    listeners.splice(0).forEach((off) => off());

    root.innerHTML = `
      <div class="breeding-container">
        <div class="breeding-top-bar">
          <button class="btn-back" id="back-btn">${backLabel}</button>
          <h2>The Sale Ring</h2>
          <div style="width: 80px;"></div>
        </div>

        <section class="breeding-section">
          <h3>Yearlings on offer · $${price.toLocaleString()} each</h3>
          <p class="breeding-empty">
            A bought horse inherits nothing — no bloodline, no first-cross bonus, no
            ancestry. It is a way out of a dead end rather than a shortcut past one.
          </p>
          <div class="stud-list" id="offer-list">
            ${offers
              .map(
                (horse) => `
              <button type="button" class="stud-card${horse.id === chosen?.id ? ' selected' : ''}" data-id="${horse.id}">
                <span class="stud-card-head">
                  <span class="stud-card-name">${horse.name}</span>
                  <span class="stud-card-badge">${horse.gender === 'stallion' ? 'Colt' : 'Filly'}</span>
                </span>
                <span class="stud-card-meta">${styleLabel(horse.style)} · ${horse.preferredDistance.min}–${horse.preferredDistance.max} m</span>
                <span class="stud-card-note">Two-year-old, unraced</span>
                <span class="stud-card-traits">${
                  horse.traits
                    .map((id) => TRAITS[id]?.name)
                    .filter(Boolean)
                    .join(' · ') || 'No notable traits'
                }</span>
              </button>`,
              )
              .join('')}
          </div>
        </section>

        <section class="breeding-section">
          <h3>Purchase</h3>
          <p class="breeding-empty">
            Your yard holds $${stable.cash.toLocaleString()}.
            ${affordable ? '' : ' That is not enough for this year&rsquo;s crop.'}
          </p>
          <button class="btn btn-primary" id="buy-btn" ${!chosen || !affordable ? 'disabled' : ''}>
            ${chosen ? `Buy ${chosen.name} — $${price.toLocaleString()}` : 'Pick a yearling'}
          </button>
        </section>
      </div>`;

    on(root.querySelector('#back-btn'), 'click', onBack);

    root.querySelectorAll<HTMLElement>('#offer-list .stud-card').forEach((card) => {
      on(card, 'click', () => {
        chosen = offers.find((horse) => horse.id === card.dataset.id);
        render();
      });
    });

    on(root.querySelector('#buy-btn'), 'click', () => {
      if (!chosen || stable.cash < price) return;
      stable.cash -= price;
      onBuy(chosen, stable);
    });
  }

  render();

  return () => {
    listeners.splice(0).forEach((off) => off());
    root.remove();
  };
}
