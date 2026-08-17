import { STAT_KEYS, toGrade, type Horse, type StatKey } from '../sim/types.js';
import { TRAITS, type TraitId } from '../data/traits.js';
import { STAT_LABELS } from './statDisplay.js';
import {
  APTITUDE_STEP,
  TRAIT_COST,
  applyDevelopment,
  developmentPool,
  emptyPlan,
  headroomFor,
  latentTraits,
  planCost,
  type DevelopmentPlan,
} from '../data/foalDevelopment.js';
import type { Stable } from './career.js';
import { pedigreeOf } from './studBook.js';

/**
 * The foal development phase (DESIGN.md §10).
 *
 * Short, significant, and **skippable** — the skip is a first-class button
 * rather than something hidden, because §10 wants anyone who just came to race
 * to be able to race. A player who skips loses the points and nothing else.
 *
 * Everything on this screen moves what the foal *starts* with. Nothing here
 * touches its ceilings, which belong to the inheritance budget.
 */

export interface FoalDevelopmentOptions {
  foal: Horse;
  stable: Stable;
  /** Hands back the developed foal, ready to be campaigned. */
  onDone: (developed: Horse) => void;
}

export function mountFoalDevelopment(
  container: HTMLElement,
  { foal, stable, onDone }: FoalDevelopmentOptions,
): () => void {
  const root = document.createElement('div');
  root.className = 'breeding-screen';
  container.appendChild(root);

  const pool = developmentPool(stable.facilities);
  const pedigree = pedigreeOf(stable);
  const latent = latentTraits(
    foal,
    foal.sireId ? pedigree(foal.sireId) : undefined,
    foal.damId ? pedigree(foal.damId) : undefined,
  );

  let plan: DevelopmentPlan = emptyPlan();

  const listeners: Array<() => void> = [];
  const on = (el: Element | null, event: string, handler: EventListener): void => {
    if (!el) return;
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  };

  function render(): void {
    listeners.splice(0).forEach((off) => off());
    const spent = planCost(plan);
    const left = pool - spent;
    const developed = applyDevelopment(foal, plan);

    const statRow = (key: StatKey): string => {
      const value = developed.stats[key];
      const added = plan.stats[key] ?? 0;
      const room = headroomFor(foal, plan, key, pool);
      const ceiling = Math.floor(foal.potential[key]);
      return `
        <div class="dev-row">
          <span class="dev-name">${STAT_LABELS[key]}</span>
          <span class="stat-row-bar">
            <i class="stat-row-ceiling" style="width:${ceiling}%"></i>
            <i class="stat-row-fill" style="width:${value}%"></i>
          </span>
          <span class="stat-row-grade grade-${toGrade(value)}">${toGrade(value)}</span>
          <span class="dev-value">${value}${added > 0 ? ` <em>+${added}</em>` : ''}</span>
          <span class="dev-buttons">
            <button type="button" class="dev-step" data-minus="${key}" ${added <= 0 ? 'disabled' : ''}>−</button>
            <button type="button" class="dev-step" data-plus="${key}" ${room <= 0 ? 'disabled' : ''}>+</button>
          </span>
        </div>`;
    };

    root.innerHTML = `
      <div class="breeding-container">
        <div class="breeding-top-bar">
          <div style="width: 80px;"></div>
          <h2>${foal.name}</h2>
          <div style="width: 80px;"></div>
        </div>

        <section class="breeding-section">
          <h3>Development · ${left} of ${pool} points left</h3>
          <p class="breeding-empty">
            A year in the paddock before it ever sees a racecourse. Points raise what it
            <em>starts</em> with — never its ceiling, which its parents already decided.
          </p>
          <div class="dev-rows">${STAT_KEYS.map(statRow).join('')}</div>
        </section>

        <section class="breeding-section">
          <h3>Preferred trip · ${developed.preferredDistance.min}–${developed.preferredDistance.max} m</h3>
          <p class="breeding-empty">
            Where it wants to run. Each step moves the whole range ${APTITUDE_STEP} m for a point.
          </p>
          <div class="dev-aptitude">
            <button type="button" class="btn btn-secondary" id="apt-down" ${left <= 0 ? 'disabled' : ''}>
              ← Shorter
            </button>
            <span class="dev-value">${plan.aptitudeShift === 0 ? 'As bred' : `${plan.aptitudeShift > 0 ? '+' : ''}${plan.aptitudeShift * APTITUDE_STEP} m`}</span>
            <button type="button" class="btn btn-secondary" id="apt-up" ${left <= 0 ? 'disabled' : ''}>
              Longer →
            </button>
          </div>
        </section>

        ${
          latent.length === 0
            ? ''
            : `<section class="breeding-section">
                 <h3>In the blood · ${TRAIT_COST} points each</h3>
                 <p class="breeding-empty">
                   Its parents carried these and it did not show them. The points coax one out.
                 </p>
                 <div class="stud-list">
                   ${latent
                     .map((trait) => {
                       const taken = plan.traits.includes(trait);
                       const affordable = taken || left >= TRAIT_COST;
                       return `
                       <button type="button" class="stud-card${taken ? ' selected' : ''}${
                         affordable ? '' : ' barred'
                       }" data-trait="${trait}">
                         <span class="stud-card-head">
                           <span class="stud-card-name">${TRAITS[trait]?.name ?? trait}</span>
                           <span class="stud-card-badge">${taken ? 'Coaxed out' : `${TRAIT_COST} pts`}</span>
                         </span>
                         <span class="stud-card-traits">${TRAITS[trait]?.description ?? ''}</span>
                       </button>`;
                     })
                     .join('')}
                 </div>
               </section>`
        }

        <section class="breeding-section">
          <button class="btn btn-primary" id="done-btn">
            ${spent === 0 ? 'Skip — take it racing as bred' : `Take ${foal.name} Into Training`}
          </button>
          ${
            spent === 0
              ? '<p class="breeding-hint">Skipping costs nothing but the points themselves.</p>'
              : `<p class="breeding-hint">${spent} points spent, ${left} unused.</p>`
          }
        </section>
      </div>`;

    root.querySelectorAll<HTMLElement>('[data-plus]').forEach((btn) => {
      on(btn, 'click', () => {
        const key = btn.dataset.plus as StatKey;
        if (headroomFor(foal, plan, key, pool) <= 0) return;
        plan.stats[key] = (plan.stats[key] ?? 0) + 1;
        render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-minus]').forEach((btn) => {
      on(btn, 'click', () => {
        const key = btn.dataset.minus as StatKey;
        const current = plan.stats[key] ?? 0;
        if (current <= 0) return;
        plan.stats[key] = current - 1;
        render();
      });
    });

    const shiftBy = (steps: number): void => {
      const next: DevelopmentPlan = { ...plan, aptitudeShift: plan.aptitudeShift + steps };
      if (planCost(next) > pool) return;
      plan = next;
      render();
    };
    on(root.querySelector('#apt-down'), 'click', () => shiftBy(-1));
    on(root.querySelector('#apt-up'), 'click', () => shiftBy(1));

    root.querySelectorAll<HTMLElement>('[data-trait]').forEach((card) => {
      on(card, 'click', () => {
        const trait = card.dataset.trait as TraitId;
        const taken = plan.traits.includes(trait);
        const next: DevelopmentPlan = {
          ...plan,
          traits: taken ? plan.traits.filter((t) => t !== trait) : [...plan.traits, trait],
        };
        if (planCost(next) > pool) return;
        plan = next;
        render();
      });
    });

    on(root.querySelector('#done-btn'), 'click', () => onDone(applyDevelopment(foal, plan)));
  }

  render();

  return () => {
    listeners.splice(0).forEach((off) => off());
    root.remove();
  };
}
