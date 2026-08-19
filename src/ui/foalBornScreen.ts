import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';
import { allKnownHorses } from './archiveTree.js';
import { mountHorseRevealCard } from './horseRevealCard.js';
import type { Stable } from './career.js';

/**
 * The foal reveal (DESIGN.md §13, and Hayden in play: "currently I have no
 * reason to think I should sell cause idk what I got").
 *
 * The old flow asked Keep-or-Sell off two lines of text with no stats and no
 * name to speak of — a decision with nothing to decide from. This shows the
 * actual foal via `mountHorseRevealCard` — coat, silks, potential, traits —
 * and a name suggestion the player can retype or reroll before either
 * button commits it.
 *
 * Naming is editable **here only**, per Hayden — not a general rename
 * feature reachable from the archive or anywhere else, just the one moment
 * it was asked for.
 */

export interface FoalBornOptions {
  foal: Horse;
  stable: Stable;
  playerSilks: Silks;
  sireName: string;
  damName: string;
  /** What passing on this foal is worth, for the sell button's label. */
  sellPrice: number;
  onKeep: (foal: Horse) => void;
  onSell: (foal: Horse) => void;
}

export function mountFoalBornScreen(
  container: HTMLElement,
  { foal, stable, playerSilks, sireName, damName, sellPrice, onKeep, onSell }: FoalBornOptions,
): () => void {
  const root = document.createElement('div');
  root.className = 'breeding-screen';
  container.appendChild(root);

  const listeners: Array<() => void> = [];
  const on = (el: Element | null, event: string, handler: EventListener): void => {
    if (!el) return;
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  };

  // Every name already in the yard's history — the same guard starter and
  // yearling selection use — so a randomized suggestion never collides with
  // a rival, and never with a name the player has already given one of
  // their own horses.
  const usedNames = allKnownHorses(stable).map((horse) => horse.name);
  let rerolls = 0;

  root.innerHTML = `
    <div class="breeding-container">
      <div class="breeding-top-bar">
        <h2>A Foal Is Born</h2>
        <div style="width: 80px;"></div>
      </div>

      <section class="breeding-section horse-reveal-section" id="foal-born-card-host"></section>

      <section class="breeding-section">
        <h3>What Next</h3>
        <p class="breeding-empty">Passing costs a covering season — every horse at stud ages a year.</p>
        <div class="horse-reveal-actions">
          <button class="btn btn-primary" id="foal-born-keep">Take It Into Training</button>
          <button class="btn btn-secondary" id="foal-born-sell">Pass — sell for $${sellPrice.toLocaleString()}</button>
        </div>
      </section>
    </div>
  `;

  const cardHost = root.querySelector<HTMLElement>('#foal-born-card-host')!;
  const card = mountHorseRevealCard(cardHost, {
    horse: foal,
    silks: playerSilks,
    subtitle: `${foal.gender === 'stallion' ? 'Colt' : 'Filly'} by ${sireName} and ${damName} · Generation ${foal.generation ?? 2}`,
  });

  const finalName = (): string => card.nameInput.value.trim() || foal.name;

  on(card.randomizeButton, 'click', () => {
    rerolls += 1;
    const rng = createRng(`foal-born-${foal.id}-${rerolls}-${Date.now()}`);
    const names = createNameGenerator(rng, usedNames);
    card.nameInput.value = names.suggestFromParents(sireName, damName);
    card.nameInput.focus();
  });

  on(root.querySelector('#foal-born-keep'), 'click', () => {
    foal.name = finalName();
    onKeep(foal);
  });

  on(root.querySelector('#foal-born-sell'), 'click', () => {
    foal.name = finalName();
    onSell(foal);
  });

  return () => {
    listeners.splice(0).forEach((off) => off());
    card.teardown();
    root.remove();
  };
}
