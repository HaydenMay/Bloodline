import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import { MAX_LENGTH } from '../data/names.js';
import { TRAITS } from '../data/traits.js';
import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';
import { attachStatReveal, renderStatRows } from './statDisplay.js';
import { mountPortrait } from './breedingScreen.js';

/**
 * Confirming a starter (Hayden: "we should add it after start[er] selection
 * too") — the same reveal-and-rename step `foalBornScreen.ts` shows for a
 * bred foal, applied to the horse just picked from the carousel.
 *
 * No parents to derive a name from here — a starter inherits nothing (§1) —
 * so Randomize draws a plain fresh suggestion rather than
 * `suggestFromParents`. No sell option either: choosing this horse already
 * happened in the carousel: this is a last look and a chance to rename it,
 * not a second decision.
 */

export interface StarterConfirmOptions {
  horse: Horse;
  silks: Silks;
  /** Every name already in the yard's history, so Randomize never collides. */
  usedNames: Iterable<string>;
  onConfirm: (horse: Horse) => void;
}

export function mountStarterConfirmScreen(
  container: HTMLElement,
  { horse, silks, usedNames, onConfirm }: StarterConfirmOptions,
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

  const usedList = Array.from(usedNames);
  let rerolls = 0;

  const traits = horse.traits
    .map((id) => TRAITS[id]?.name)
    .filter(Boolean)
    .join(' · ');

  root.innerHTML = `
    <div class="breeding-container">
      <div class="breeding-top-bar">
        <h2>Meet Your Starter</h2>
        <div style="width: 80px;"></div>
      </div>

      <section class="breeding-section horse-reveal-section">
        <div class="horse-reveal-portrait" id="starter-confirm-portrait"></div>

        <label class="horse-reveal-name-label">
          Name
          <div class="horse-reveal-name-row">
            <input type="text" id="starter-confirm-name" class="horse-reveal-name-input"
                   value="${horse.name}" maxlength="${MAX_LENGTH}" />
            <button type="button" class="btn btn-secondary" id="starter-confirm-randomize" title="Suggest a different name">
              🎲 Randomize
            </button>
          </div>
        </label>

        <p class="breeding-hint">
          A ${horse.gender === 'stallion' ? 'colt' : 'filly'}, generation 1 — a starter inherits nothing but what it shows here.
        </p>

        <div class="stat-rows" id="starter-confirm-stats">
          ${renderStatRows(horse, { showPotential: true })}
        </div>

        ${traits ? `<p class="horse-reveal-traits">${traits}</p>` : ''}
      </section>

      <section class="breeding-section">
        <div class="horse-reveal-actions">
          <button class="btn btn-primary" id="starter-confirm-start">Start Training</button>
        </div>
      </section>
    </div>
  `;

  const portraitHost = root.querySelector<HTMLElement>('#starter-confirm-portrait')!;
  const stopPortrait = mountPortrait(portraitHost, horse, silks);

  const statsHost = root.querySelector<HTMLElement>('#starter-confirm-stats')!;
  const detachReveal = attachStatReveal(statsHost);

  const nameInput = root.querySelector<HTMLInputElement>('#starter-confirm-name')!;

  const finalName = (): string => nameInput.value.trim() || horse.name;

  on(root.querySelector('#starter-confirm-randomize'), 'click', () => {
    rerolls += 1;
    const rng = createRng(`starter-confirm-${horse.id}-${rerolls}-${Date.now()}`);
    const names = createNameGenerator(rng, usedList);
    nameInput.value = names.next();
    nameInput.focus();
  });

  on(root.querySelector('#starter-confirm-start'), 'click', () => {
    horse.name = finalName();
    onConfirm(horse);
  });

  return () => {
    listeners.splice(0).forEach((off) => off());
    stopPortrait();
    detachReveal();
    root.remove();
  };
}
