import { MAX_LENGTH } from '../data/names.js';
import { TRAITS } from '../data/traits.js';
import type { Horse } from '../sim/types.js';
import { coatForHorse, type Silks } from '../render/palette.js';
import { createBadgeElement } from './badgeLoader.js';
import { attachStatReveal, renderStatRows } from './statDisplay.js';

/**
 * The horse-reveal card shared by `foalBornScreen.ts` and
 * `starterConfirmScreen.ts` — a foal being born, or a starter just chosen.
 *
 * Found wonky in its first pass: a centred idle-animation sprite floating in
 * a mostly-empty square, disconnected from the data below it. Rebuilt on the
 * starter carousel's own layout instead of inventing a new one — badge left,
 * everything else in a column to its right, the same `sc-*` classes the
 * carousel the player just came from already uses, so the reveal reads as
 * the same screen continuing rather than a style change.
 */

export interface HorseRevealCardOptions {
  horse: Horse;
  silks: Silks;
  /** e.g. "A colt by Storm Signal and Quiet Lantern, generation 2." */
  subtitle: string;
}

export interface HorseRevealCard {
  nameInput: HTMLInputElement;
  randomizeButton: HTMLButtonElement;
  teardown: () => void;
}

export function mountHorseRevealCard(host: HTMLElement, options: HorseRevealCardOptions): HorseRevealCard {
  const { horse, silks, subtitle } = options;

  const box = document.createElement('div');
  box.className = 'sc-carousel-box horse-reveal-box';
  host.appendChild(box);

  const badgeCache = new Map<string, string>();
  const badgeWrap = createBadgeElement(coatForHorse(horse), silks, badgeCache, horse.id, 'sc-badge', 'Horse badge');
  box.appendChild(badgeWrap);

  const info = document.createElement('div');
  info.className = 'sc-carousel-info';
  box.appendChild(info);

  const traits = horse.traits.map((id) => TRAITS[id]).filter((t): t is (typeof TRAITS)[keyof typeof TRAITS] => Boolean(t));

  info.innerHTML = `
    <div class="horse-reveal-name-row">
      <input type="text" class="horse-reveal-name-input" value="${horse.name}" maxlength="${MAX_LENGTH}" />
      <button type="button" class="btn btn-secondary horse-reveal-randomize" title="Suggest a different name">
        🎲 Randomize
      </button>
    </div>
    <p class="sc-sub">${subtitle}</p>
    <div class="sc-section">Attributes</div>
    <div class="stat-rows">${renderStatRows(horse, { showPotential: true })}</div>
    ${
      traits.length
        ? `<div class="sc-section">Traits</div>
           <div class="sc-traits">${traits.map((t) => `<span class="trait-tag">${t.name}</span>`).join('')}</div>`
        : ''
    }
  `;

  const nameInput = info.querySelector<HTMLInputElement>('.horse-reveal-name-input')!;
  const randomizeButton = info.querySelector<HTMLButtonElement>('.horse-reveal-randomize')!;
  const statsHost = info.querySelector<HTMLElement>('.stat-rows')!;
  const detachReveal = attachStatReveal(statsHost);

  return {
    nameInput,
    randomizeButton,
    teardown: () => {
      detachReveal();
      box.remove();
    },
  };
}
