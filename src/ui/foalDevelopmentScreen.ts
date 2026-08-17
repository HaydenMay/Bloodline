import { STAT_KEYS, toGrade, type Horse, type StatKey } from '../sim/types.js';
import { createRng } from '../sim/rng.js';
import { TRAITS, type TraitId } from '../data/traits.js';
import { STAT_LABELS } from './statDisplay.js';
import {
  TRAIT_COST_SHARE,
  applyYear,
  developmentPool,
  latentTraits,
  resolveYear,
  totalGain,
  type RearingPlan,
  type YearResult,
} from '../data/foalDevelopment.js';
import type { Stable } from './career.js';
import { pedigreeOf } from './studBook.js';

/**
 * The foal's first year (DESIGN.md §10).
 *
 * Two beats. **Set a rearing plan** — what the yearling is brought along for —
 * then **see what the year did with it**, which is not always what you asked.
 * The plan ends in one real decision: whether to spend what is left of the year
 * bringing out something its parents carried.
 *
 * Skipping is a first-class button on the first beat, because §10 wants anyone
 * who came to race to be able to race. A skipped year still grows the foal; it
 * simply grows it however it likes.
 */

export interface FoalDevelopmentOptions {
  foal: Horse;
  stable: Stable;
  onDone: (developed: Horse) => void;
}

/** What each stat means for a young horse, in the yard's own words. */
const FOCUS_BLURB: Record<StatKey, string> = {
  speed: 'Sharp work on the gallops',
  stamina: 'Long, slow miles',
  burst: 'Standing starts and short bursts',
  grit: 'Company work, and being made to fight',
  temper: 'Handling, patience, and the horsebox',
  consistency: 'Routine, and plenty of it',
};

export function mountFoalDevelopment(
  container: HTMLElement,
  { foal, stable, onDone }: FoalDevelopmentOptions,
): () => void {
  const root = document.createElement('div');
  root.className = 'breeding-screen';
  container.appendChild(root);

  const pool = developmentPool(stable.facilities, stable.staff?.trainer?.level ?? 1);
  const pedigree = pedigreeOf(stable);
  const latent = latentTraits(
    foal,
    foal.sireId ? pedigree(foal.sireId) : undefined,
    foal.damId ? pedigree(foal.damId) : undefined,
  );

  // Seeded off the foal, so the year is a fact about this horse rather than
  // something a player could reload until they liked it.
  const seed = `year-${foal.id}`;

  let stage: 'plan' | 'result' = 'plan';
  let plan: RearingPlan | null = null;
  let primary: StatKey | null = null;
  let secondary: StatKey | null = null;
  let result: YearResult | null = null;
  let coaxed: TraitId | null = null;

  const listeners: Array<() => void> = [];
  const on = (el: Element | null, event: string, handler: EventListener): void => {
    if (!el) return;
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  };

  /** Re-runs the year. Taking a trait spends part of it, so the growth shrinks. */
  function run(): void {
    const spend = coaxed ? Math.round(pool * (1 - TRAIT_COST_SHARE)) : pool;
    result = resolveYear(createRng(seed), foal, plan, spend);
  }

  function renderPlan(): string {
    const card = (key: StatKey): string => {
      const chosen = key === primary ? 'primary' : key === secondary ? 'secondary' : '';
      return `
        <button type="button" class="stud-card${chosen ? ' selected' : ''}" data-focus="${key}">
          <span class="stud-card-head">
            <span class="stud-card-name">${STAT_LABELS[key]}</span>
            ${chosen ? `<span class="stud-card-badge">${chosen === 'primary' ? 'Main' : 'Second'}</span>` : ''}
          </span>
          <span class="stud-card-traits">${FOCUS_BLURB[key]}</span>
        </button>`;
    };

    return `
      <section class="breeding-section">
        <h3>The year ahead</h3>
        <p class="breeding-empty">
          ${foal.name} spends a year in the paddock before it ever sees a racecourse. What it is
          brought along for is your call — pick what matters most, and a second if you want one.
          The year will not do exactly as it is told.
        </p>
        <div class="stud-list">${STAT_KEYS.map(card).join('')}</div>
      </section>

      <section class="breeding-section">
        <button class="btn btn-primary" id="begin-btn" ${primary ? '' : 'disabled'}>
          ${primary ? `Bring it along for ${STAT_LABELS[primary]}${secondary ? ` and ${STAT_LABELS[secondary]}` : ''}` : 'Pick what it is brought along for'}
        </button>
        <button class="btn btn-secondary" id="skip-btn">Skip — let it come along on its own</button>
        <p class="breeding-hint">
          Skipping still grows the horse. It simply grows however it likes.
        </p>
      </section>`;
  }

  function renderResult(): string {
    const year = result!;
    const developed = applyYear(foal, year, coaxed ?? undefined);
    const grew = totalGain(year);

    const row = (key: StatKey): string => {
      const gain = year.gains[key] ?? 0;
      const value = developed.stats[key];
      const ceiling = Math.floor(foal.potential[key]);
      return `
        <div class="dev-row">
          <span class="dev-name">${STAT_LABELS[key]}</span>
          <span class="stat-row-bar">
            <i class="stat-row-ceiling" style="width:${ceiling}%"></i>
            <i class="stat-row-fill" style="width:${value}%"></i>
          </span>
          <span class="stat-row-grade grade-${toGrade(value)}">${toGrade(value)}</span>
          <span class="dev-value">${value}${gain > 0 ? ` <em>+${gain}</em>` : ''}</span>
        </div>`;
    };

    const headline =
      year.event === 'breakthrough'
        ? `<p class="dev-event dev-good">It thrived. ${STAT_LABELS[year.eventStat!]} came on far better than anyone expected.</p>`
        : year.event === 'setback'
          ? `<p class="dev-event dev-bad">A difficult year. ${STAT_LABELS[year.eventStat!]} never really came along.</p>`
          : '';

    return `
      <section class="breeding-section">
        <h3>${plan ? 'The year it had' : 'A year in the paddock'}</h3>
        ${headline}
        <div class="dev-rows">${STAT_KEYS.map(row).join('')}</div>
        ${
          year.wasted > 0
            ? `<p class="breeding-hint">
                 ${year.wasted} points of work went nowhere — you cannot bring a horse past what it
                 was born with.
               </p>`
            : `<p class="breeding-hint">
                 ${grew} points of growth. An ordinary year at this yard is worth about ${pool} —
                 a good one beats it.
               </p>`
        }
      </section>

      ${
        latent.length === 0
          ? ''
          : `<section class="breeding-section">
               <h3>In the blood</h3>
               <p class="breeding-empty">
                 Its parents carried these and it has not shown them. The rest of the year could be
                 spent bringing one out — at the cost of ${Math.round(TRAIT_COST_SHARE * 100)}% of
                 the growth above.
               </p>
               <div class="stud-list">
                 ${latent
                   .map(
                     (trait) => `
                   <button type="button" class="stud-card${coaxed === trait ? ' selected' : ''}" data-trait="${trait}">
                     <span class="stud-card-head">
                       <span class="stud-card-name">${TRAITS[trait]?.name ?? trait}</span>
                       <span class="stud-card-badge">${coaxed === trait ? 'Being brought out' : 'Leave it'}</span>
                     </span>
                     <span class="stud-card-traits">${TRAITS[trait]?.description ?? ''}</span>
                   </button>`,
                   )
                   .join('')}
               </div>
             </section>`
      }

      <section class="breeding-section">
        <button class="btn btn-primary" id="done-btn">Take ${foal.name} Into Training</button>
      </section>`;
  }

  function render(): void {
    listeners.splice(0).forEach((off) => off());

    root.innerHTML = `
      <div class="breeding-container">
        <div class="breeding-top-bar">
          <div style="width: 80px;"></div>
          <h2>${foal.name}</h2>
          <div style="width: 80px;"></div>
        </div>
        ${stage === 'plan' ? renderPlan() : renderResult()}
      </div>`;

    if (stage === 'plan') {
      root.querySelectorAll<HTMLElement>('[data-focus]').forEach((card) => {
        on(card, 'click', () => {
          const key = card.dataset.focus as StatKey;
          // Tap once for the main focus, again for the second, again to clear.
          if (primary === key) primary = null;
          else if (secondary === key) secondary = null;
          else if (!primary) primary = key;
          else if (!secondary) secondary = key;
          else secondary = key;
          if (!primary && secondary) {
            primary = secondary;
            secondary = null;
          }
          render();
        });
      });

      on(root.querySelector('#begin-btn'), 'click', () => {
        if (!primary) return;
        plan = { primary, secondary };
        run();
        stage = 'result';
        render();
      });

      on(root.querySelector('#skip-btn'), 'click', () => {
        plan = null;
        run();
        stage = 'result';
        render();
      });
      return;
    }

    root.querySelectorAll<HTMLElement>('[data-trait]').forEach((card) => {
      on(card, 'click', () => {
        const trait = card.dataset.trait as TraitId;
        coaxed = coaxed === trait ? null : trait;
        // The year is re-run against what is left of it, so the cost is visible
        // in the same numbers the player is already reading.
        run();
        render();
      });
    });

    on(root.querySelector('#done-btn'), 'click', () =>
      onDone(applyYear(foal, result!, coaxed ?? undefined)),
    );
  }

  render();

  return () => {
    listeners.splice(0).forEach((off) => off());
    root.remove();
  };
}
