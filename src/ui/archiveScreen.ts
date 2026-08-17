import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';
import { hashId, RIVAL_SILKS } from '../render/palette.js';
import { createBadgeElement } from './badgeLoader.js';
import { TRAITS } from '../data/traits.js';
import { attachStatReveal, renderStatRows } from './statDisplay.js';
import { pedigreeOf } from './studBook.js';
import {
  allKnownHorses,
  buildAncestry,
  isSoldFoal,
  retiredRecordOf,
  rowsOf,
  siblingsOf,
  type AncestorNode,
} from './archiveTree.js';
import type { Stable } from './career.js';

/**
 * The Archive (DESIGN.md 10, NEXT_PLAN.md Step 1-2).
 *
 * "A CK3-style family tree — portrait cards on generational rows, connecting
 * lines, click any ancestor for a detail card." Direct line in full, side
 * branches folded until asked for — the render budget is drawing, not
 * storage (ROADMAP.md Phase 6: a thousand-horse tree is 825 KB).
 *
 * Rows render oldest generation first (top of the page) down to the root
 * horse last (bottom), so scrolling up is walking backward through the
 * pedigree — which is also what "jump to the top" means here: a scroll
 * position, not a re-rooted tree. A horse's ancestry has no single founder
 * once outside studs enter a line, so there is no one horse to re-root on.
 */

export interface ArchiveOptions {
  stable: Stable;
  /** The horse the tree is rooted on — the one in training, or the newest retiree. */
  root: Horse;
  /** The active career's silks, worn by the root card if it is the living horse. */
  playerSilks?: Silks | undefined;
  onBack: () => void;
  /** Reaches the stud book from inside the Archive, where breeding now lives. */
  onBreed?: () => void;
}

const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
const genderLabel = (horse: Horse): string => (horse.gender === 'stallion' ? 'Stallion' : 'Mare');

function silksFor(horse: Horse, root: Horse, playerSilks?: Silks): Silks {
  if (playerSilks && horse.id === root.id) return playerSilks;
  return RIVAL_SILKS[hashId(horse.id) % RIVAL_SILKS.length]!;
}

/** Where a horse in the tree came from, for the detail card. */
function statusOf(horse: Horse, stable: Stable, isLivingRoot: boolean): string {
  if (isLivingRoot) return 'Still racing — this is the horse in training now.';
  const retired = retiredRecordOf(horse, stable);
  if (retired) {
    const reason =
      retired.retirementReason === 'injured'
        ? 'retired by injury'
        : retired.retirementReason === 'faded'
          ? 'raced out its career'
          : 'retired sound';
    return `In your bloodstock — ${reason}${retired.hallOfFame ? ', Hall of Fame' : ''}.`;
  }
  if (isSoldFoal(horse, stable)) return 'Sold from your line as a foal — racing in the world.';
  return 'An outside horse your line has bred to.';
}

export function mountArchiveScreen(container: HTMLElement, options: ArchiveOptions): () => void {
  const { stable, root, playerSilks, onBack, onBreed } = options;

  const el = document.createElement('div');
  el.className = 'archive-screen';
  container.appendChild(el);

  el.innerHTML = `
    <div class="archive-container">
      <div class="archive-top-bar">
        <button class="btn-back" id="archive-back">← Back</button>
        <h2>The Archive</h2>
        ${onBreed ? '<button class="btn btn-secondary" id="archive-breed">Stud Book</button>' : '<div style="width: 80px;"></div>'}
      </div>
      <div class="archive-controls">
        <label class="archive-toggle">
          <input type="checkbox" id="archive-siblings" />
          Show every foal in each generation
        </label>
        <label class="archive-toggle archive-toggle-nested" id="archive-sold-wrap" hidden>
          <input type="checkbox" id="archive-sold" />
          Include foals sold to rivals
        </label>
        <button class="menu-link" id="archive-top">Jump to Top ↑</button>
      </div>
      <div class="archive-scroll" id="archive-scroll">
        <div class="archive-canvas" id="archive-canvas">
          <svg class="archive-lines" id="archive-lines"></svg>
        </div>
      </div>
    </div>
    <div class="archive-detail" id="archive-detail" hidden>
      <div class="archive-detail-panel">
        <button class="archive-detail-close" id="archive-detail-close" aria-label="Close">×</button>
        <div class="archive-detail-body" id="archive-detail-body"></div>
      </div>
    </div>
  `;

  const listeners: Array<() => void> = [];
  const cardListeners: Array<() => void> = [];
  const on = (target: Element | Window | null, event: string, handler: EventListener): void => {
    if (!target) return;
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  };

  const badgeCache = new Map<string, string>();
  const pedigree = pedigreeOf(stable);
  const tree = buildAncestry(root, pedigree);
  const rows = rowsOf(tree);
  const known = allKnownHorses(stable);

  let showSiblings = false;
  let showSold = false;
  let firstRender = true;

  const scrollEl = el.querySelector<HTMLElement>('#archive-scroll')!;
  const canvasEl = el.querySelector<HTMLElement>('#archive-canvas')!;
  const linesEl = el.querySelector<SVGSVGElement>('#archive-lines')!;
  const detailEl = el.querySelector<HTMLElement>('#archive-detail')!;
  const detailBody = el.querySelector<HTMLElement>('#archive-detail-body')!;

  let detachReveal: (() => void) | undefined;

  function buildCard(horse: Horse, opts: { path: string; isRoot: boolean; isSibling: boolean }): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `archive-card${opts.isRoot ? ' archive-card-root' : ''}${
      opts.isSibling ? ' archive-card-sibling' : ''
    }`;
    button.dataset.path = opts.path;
    button.dataset.id = horse.id;

    const badge = createBadgeElement(
      horse.coat,
      silksFor(horse, root, playerSilks),
      badgeCache,
      horse.id,
      'archive-card-badge',
      `${horse.name} badge`,
    );
    button.appendChild(badge);

    const info = document.createElement('span');
    info.className = 'archive-card-info';
    const retired = retiredRecordOf(horse, stable);
    info.innerHTML = `
      <span class="archive-card-name">${horse.name}</span>
      <span class="archive-card-meta">${genderLabel(horse)} · Gen ${horse.generation ?? 1}</span>
      ${retired?.hallOfFame ? '<span class="archive-card-hof">🏛️ Hall of Fame</span>' : ''}
    `;
    button.appendChild(info);

    return button;
  }

  function renderRows(): void {
    canvasEl.innerHTML = '';
    canvasEl.appendChild(linesEl);
    linesEl.innerHTML = '';

    // Oldest generation first, root last — see the module comment for why.
    for (let depth = rows.length - 1; depth >= 0; depth--) {
      const rowNodes = rows[depth];
      if (!rowNodes || rowNodes.length === 0) continue;

      const rowEl = document.createElement('div');
      rowEl.className = 'archive-row';

      for (const node of rowNodes) {
        const cluster = document.createElement('div');
        cluster.className = 'archive-cluster';
        cluster.appendChild(
          buildCard(node.horse, { path: node.path, isRoot: node.horse.id === root.id, isSibling: false }),
        );

        if (showSiblings) {
          const siblings = siblingsOf(node.horse, known).filter(
            (sibling) => showSold || !isSoldFoal(sibling, stable),
          );
          for (const sibling of siblings) {
            cluster.appendChild(
              buildCard(sibling, { path: `${node.path}-sib-${sibling.id}`, isRoot: false, isSibling: true }),
            );
          }
        }

        rowEl.appendChild(cluster);
      }

      canvasEl.appendChild(rowEl);
    }
  }

  /**
   * Straight lines from each ancestor's card to the child it belongs to.
   *
   * Positions are measured relative to `canvasEl`'s own box rather than the
   * viewport, so they stay correct across scroll without recomputing on every
   * scroll event — the card and the canvas move together.
   */
  function drawLines(): void {
    const canvasBox = canvasEl.getBoundingClientRect();
    linesEl.setAttribute('width', String(canvasEl.scrollWidth));
    linesEl.setAttribute('height', String(canvasEl.scrollHeight));
    linesEl.innerHTML = '';

    const centerOf = (path: string): { x: number; bottom: number; top: number } | undefined => {
      const cardEl = canvasEl.querySelector<HTMLElement>(`[data-path="${path}"]`);
      if (!cardEl) return undefined;
      const box = cardEl.getBoundingClientRect();
      return {
        x: box.left - canvasBox.left + box.width / 2,
        top: box.top - canvasBox.top,
        bottom: box.bottom - canvasBox.top,
      };
    };

    const walk = (node: AncestorNode): void => {
      const child = centerOf(node.path);
      if (child) {
        for (const parentNode of [node.sire, node.dam]) {
          if (!parentNode) continue;
          const parent = centerOf(parentNode.path);
          if (parent) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(parent.x));
            line.setAttribute('y1', String(parent.bottom));
            line.setAttribute('x2', String(child.x));
            line.setAttribute('y2', String(child.top));
            line.setAttribute('class', 'archive-line');
            linesEl.appendChild(line);
          }
          walk(parentNode);
        }
      } else {
        if (node.sire) walk(node.sire);
        if (node.dam) walk(node.dam);
      }
    };
    walk(tree);
  }

  function openDetail(horse: Horse): void {
    detachReveal?.();

    const isLivingRoot = horse.id === root.id && !retiredRecordOf(root, stable);
    const traits = horse.traits
      .map((id) => TRAITS[id]?.name)
      .filter(Boolean)
      .join(' · ');
    const retired = retiredRecordOf(horse, stable);

    detailBody.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'archive-detail-head';
    head.appendChild(
      createBadgeElement(
        horse.coat,
        silksFor(horse, root, playerSilks),
        badgeCache,
        horse.id,
        'archive-detail-badge',
        `${horse.name} badge`,
      ),
    );
    const headInfo = document.createElement('div');
    headInfo.innerHTML = `
      <h3>${horse.name}</h3>
      <p class="archive-detail-meta">
        ${genderLabel(horse)} · ${horse.age}yo · ${titleCase(horse.division)} · Generation ${horse.generation ?? 1}
      </p>
      <p class="archive-detail-status">${statusOf(horse, stable, isLivingRoot)}</p>
    `;
    head.appendChild(headInfo);
    detailBody.appendChild(head);

    const record = document.createElement('div');
    record.className = 'archive-detail-section';
    record.innerHTML = `
      <h4>Record</h4>
      <p>${horse.wins} wins · ${horse.places} places · ${horse.shows} shows from ${horse.starts} starts</p>
      ${
        retired
          ? `<p>Legacy banked ${retired.legacyBanked} (peaked at ${retired.legacyPeak}) · $${retired.earnings.toLocaleString()} earned</p>`
          : ''
      }
    `;
    detailBody.appendChild(record);

    if (traits) {
      const traitsSection = document.createElement('div');
      traitsSection.className = 'archive-detail-section';
      traitsSection.innerHTML = `<h4>Traits</h4><p>${traits}</p>`;
      detailBody.appendChild(traitsSection);
    }

    const statsSection = document.createElement('div');
    statsSection.className = 'archive-detail-section';
    statsSection.innerHTML = `
      <h4>Stats</h4>
      <div class="stat-rows">${renderStatRows(horse, { revealNumbers: false, showPotential: isLivingRoot })}</div>
    `;
    detailBody.appendChild(statsSection);
    detachReveal = attachStatReveal(statsSection);

    detailEl.hidden = false;
  }

  function closeDetail(): void {
    detachReveal?.();
    detailEl.hidden = true;
  }

  function render(): void {
    const prevScrollTop = firstRender ? undefined : scrollEl.scrollTop;

    renderRows();

    requestAnimationFrame(() => {
      drawLines();
      if (firstRender) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
        firstRender = false;
      } else if (prevScrollTop !== undefined) {
        scrollEl.scrollTop = prevScrollTop;
      }
    });

    cardListeners.splice(0).forEach((off) => off());
    canvasEl.querySelectorAll<HTMLButtonElement>('.archive-card').forEach((card) => {
      const handler = (): void => {
        const horse =
          known.find((h) => h.id === card.dataset.id) ?? (card.dataset.id === root.id ? root : undefined);
        if (horse) openDetail(horse);
      };
      card.addEventListener('click', handler);
      cardListeners.push(() => card.removeEventListener('click', handler));
    });
  }

  on(el.querySelector('#archive-back'), 'click', onBack);
  if (onBreed) on(el.querySelector('#archive-breed'), 'click', onBreed);
  on(el.querySelector('#archive-top'), 'click', () => {
    scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
  });
  on(el.querySelector('#archive-detail-close'), 'click', closeDetail);
  on(detailEl, 'click', (e: Event) => {
    if (e.target === detailEl) closeDetail();
  });
  on(el.querySelector('#archive-siblings'), 'change', (e: Event) => {
    showSiblings = (e.target as HTMLInputElement).checked;
    el.querySelector<HTMLElement>('#archive-sold-wrap')!.hidden = !showSiblings;
    if (!showSiblings) showSold = false;
    render();
  });
  on(el.querySelector('#archive-sold'), 'change', (e: Event) => {
    showSold = (e.target as HTMLInputElement).checked;
    render();
  });
  on(window, 'resize', () => drawLines());

  render();

  return () => {
    detachReveal?.();
    cardListeners.splice(0).forEach((off) => off());
    listeners.splice(0).forEach((off) => off());
    el.remove();
  };
}
