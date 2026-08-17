import type { Horse } from '../sim/types.js';
import { TRAITS } from '../data/traits.js';
import type { BreedingPartner } from '../sim/breeding.js';
import type { RetiredHorse, Stable } from './career.js';
import { attachStatReveal, renderRangeRows } from './statDisplay.js';
import {
  breedFoal,
  breedingStock,
  partnersFor,
  projectFoal,
  timesBred,
  toPartner,
  type PartnerOption,
} from './studBook.js';

/**
 * The pairing screen (DESIGN.md §10).
 *
 * **Show the outcome, not the theory.** You pick two horses and see the foal's
 * projected potential ranges — and nothing else. No relatedness rating, no
 * budget figure, no diversity percentage. The bands come out wider for an
 * outcross and narrower for close family on their own, so the mechanic is felt
 * at the moment of decision rather than explained at it. The explanation lives
 * in the breeding manual (§13) for anyone who goes looking.
 *
 * Reached between careers, so it takes a `Stable` rather than a `Career` — at
 * the moment this matters most, the horse that just retired is the yard's
 * newest bloodstock and there is no career left to belong to.
 */

export interface BreedingScreenOptions {
  stable: Stable;
  /** Hands back the foal to campaign, and the yard that now records it. */
  onBred: (foal: Horse, stable: Stable) => void;
  onBack: () => void;
  backLabel?: string;
  /**
   * `breed` produces a foal; `browse` shows the same pairings without the
   * button.
   *
   * A yard reached mid-career has a horse in training already, and a foal bred
   * then would have nowhere to go — one career at a time is the shape of the
   * game. Browsing still earns its place: §10 wants the pedigree freely
   * browsable, and seeing which pairing your line is heading toward is half the
   * reason to keep a mare. The foal itself is bred at the moment the current
   * horse retires, which is when there is a place for it.
   */
  mode?: 'breed' | 'browse';
}

/** Division names are stored lower case; they are proper nouns on screen. */
const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

function describe(horse: Horse): string {
  const traits = horse.traits
    .slice(0, 2)
    .map((id) => TRAITS[id]?.name)
    .filter(Boolean)
    .join(' · ');
  return traits || 'No notable traits';
}

/** One selectable horse: yours or a rival's. */
function renderCard(
  horse: Horse,
  opts: { selected: boolean; note: string; badge?: string },
): string {
  return `
    <button type="button" class="stud-card${opts.selected ? ' selected' : ''}" data-id="${horse.id}">
      <span class="stud-card-head">
        <span class="stud-card-name">${horse.name}</span>
        ${opts.badge ? `<span class="stud-card-badge">${opts.badge}</span>` : ''}
      </span>
      <span class="stud-card-meta">${horse.gender === 'stallion' ? 'Stallion' : 'Mare'} · ${horse.age}yo · ${titleCase(horse.division)}</span>
      <span class="stud-card-note">${opts.note}</span>
      <span class="stud-card-traits">${describe(horse)}</span>
    </button>`;
}

export function mountBreedingScreen(
  container: HTMLElement,
  { stable, onBred, onBack, backLabel = '← Back', mode = 'breed' }: BreedingScreenOptions,
): () => void {
  const root = document.createElement('div');
  root.className = 'breeding-screen';
  container.appendChild(root);

  const stock = breedingStock(stable);
  let mine: RetiredHorse | undefined = stock[0];
  let chosen: PartnerOption | undefined;
  let detachReveal: (() => void) | undefined;

  const listeners: Array<() => void> = [];
  const on = (el: Element | null, event: string, handler: EventListener): void => {
    if (!el) return;
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  };

  function partners(): PartnerOption[] {
    return mine ? partnersFor(stable, mine.horse) : [];
  }

  function render(): void {
    detachReveal?.();
    listeners.splice(0).forEach((off) => off());

    const options = partners();
    // A selection made before the list changed may no longer be in it.
    if (chosen && !options.some((o) => o.partner.horse.id === chosen!.partner.horse.id)) {
      chosen = undefined;
    }

    const projection =
      mine && chosen
        ? projectFoal(toPartner(mine), chosen.partner, chosen.timesBred)
        : null;

    root.innerHTML = `
      <div class="breeding-container">
        <div class="breeding-top-bar">
          <button class="btn-back" id="back-btn">${backLabel}</button>
          <h2>Breeding</h2>
          <div style="width: 80px;"></div>
        </div>

        ${
          stock.length === 0
            ? `<p class="breeding-empty">
                 You have no horses to breed from yet. Every horse you retire joins your
                 bloodstock — the first one is the start of the line.
               </p>`
            : `
          <section class="breeding-section">
            <h3>From your yard</h3>
            <div class="stud-list">
              ${stock
                .map((entry) =>
                  renderCard(entry.horse, {
                    selected: entry.horse.id === mine?.horse.id,
                    note: `${entry.wins} wins from ${entry.starts} starts`,
                    ...(entry.hallOfFame ? { badge: '🏛️ Hall of Fame' } : {}),
                  }),
                )
                .join('')}
            </div>
          </section>

          <section class="breeding-section">
            <h3>Partner</h3>
            ${
              options.length === 0
                ? `<p class="breeding-empty">Nothing available to pair with this horse.</p>`
                : `<div class="stud-list" id="partner-list">
                     ${options
                       .map((option) =>
                         renderCard(option.partner.horse, {
                           selected: option.partner.horse.id === chosen?.partner.horse.id,
                           note:
                             option.timesBred === 0
                               ? 'A new cross'
                               : `Bred ${option.timesBred} time${option.timesBred === 1 ? '' : 's'} before`,
                           ...(option.source === 'bloodstock'
                             ? { badge: 'Your yard' }
                             : { badge: 'Outside' }),
                         }),
                       )
                       .join('')}
                   </div>`
            }
          </section>

          <section class="breeding-section">
            <h3>The foal</h3>
            ${
              projection
                ? `<div class="stat-rows" id="projection">${renderRangeRows(projection)}</div>
                   <p class="breeding-hint">Where this pairing usually lands. Tap for numbers.</p>
                   ${
                     mode === 'breed'
                       ? `<button class="btn btn-primary" id="breed-btn">Breed ${mine!.horse.name} &amp; ${chosen!.partner.horse.name}</button>`
                       : `<p class="breeding-empty">You have a horse in training. This pairing is
                            yours to make the day that career ends.</p>`
                   }`
                : `<p class="breeding-empty">Pick a partner to see what the pairing could produce.</p>`
            }
          </section>`
        }
      </div>`;

    on(root.querySelector('#back-btn'), 'click', onBack);

    root.querySelectorAll<HTMLElement>('.breeding-section:first-of-type .stud-card').forEach(
      (card) => {
        on(card, 'click', () => {
          mine = stock.find((entry) => entry.horse.id === card.dataset.id);
          chosen = undefined;
          render();
        });
      },
    );

    root.querySelectorAll<HTMLElement>('#partner-list .stud-card').forEach((card) => {
      on(card, 'click', () => {
        chosen = options.find((option) => option.partner.horse.id === card.dataset.id);
        render();
      });
    });

    const projectionEl = root.querySelector<HTMLElement>('#projection');
    if (projectionEl) detachReveal = attachStatReveal(projectionEl);

    on(root.querySelector('#breed-btn'), 'click', () => {
      if (!mine || !chosen) return;
      const partner: BreedingPartner = chosen.partner;
      const { foal } = breedFoal(stable, toPartner(mine), partner);
      onBred(foal, stable);
    });
  }

  render();

  return () => {
    detachReveal?.();
    listeners.splice(0).forEach((off) => off());
    root.remove();
  };
}

/** Whether a yard has anything to breed at all, for the screens that offer it. */
export function canBreedHere(stable: Stable): boolean {
  const stock = breedingStock(stable);
  return stock.some((entry) => partnersFor(stable, entry.horse).length > 0);
}

/** Re-exported so callers can show a repeat count without reaching into the stud book. */
export { timesBred };
