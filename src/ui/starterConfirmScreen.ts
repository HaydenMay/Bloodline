import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';
import { mountHorseRevealCard } from './horseRevealCard.js';

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

  root.innerHTML = `
    <div class="breeding-container">
      <div class="breeding-top-bar">
        <h2>Meet Your Starter</h2>
        <div style="width: 80px;"></div>
      </div>

      <section class="breeding-section horse-reveal-section" id="starter-confirm-card-host"></section>

      <section class="breeding-section">
        <div class="horse-reveal-actions">
          <button class="btn btn-primary" id="starter-confirm-start">Start Training</button>
        </div>
      </section>
    </div>
  `;

  const cardHost = root.querySelector<HTMLElement>('#starter-confirm-card-host')!;
  const card = mountHorseRevealCard(cardHost, {
    horse,
    silks,
    subtitle: `${horse.gender === 'stallion' ? 'Colt' : 'Filly'} · Generation 1 — inherits nothing but what it shows here.`,
  });

  const finalName = (): string => card.nameInput.value.trim() || horse.name;

  on(card.randomizeButton, 'click', () => {
    rerolls += 1;
    const rng = createRng(`starter-confirm-${horse.id}-${rerolls}-${Date.now()}`);
    const names = createNameGenerator(rng, usedList);
    card.nameInput.value = names.next();
    card.nameInput.focus();
  });

  on(root.querySelector('#starter-confirm-start'), 'click', () => {
    horse.name = finalName();
    onConfirm(horse);
  });

  return () => {
    listeners.splice(0).forEach((off) => off());
    card.teardown();
    root.remove();
  };
}
