import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';
import { hashId, RIVAL_SILKS } from '../render/palette.js';
import { createBadgeElement } from './badgeLoader.js';
import { TRAITS } from '../data/traits.js';
import { attachStatReveal, renderStatRows } from './statDisplay.js';
import { pedigreeOf } from './studBook.js';
import { peakDivision } from '../sim/division.js';
import { createSurface, startLoop } from '../render/canvas.js';
import { drawFrame, loadFrameSequence } from '../render/frameAnimation.js';
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
  /**
   * The living root's current legacy score. Retired horses read their own
   * `legacyBanked`; the horse still in training has no bloodstock entry to
   * read one from, so its `Career`'s own tally is threaded through instead.
   */
  rootLegacyPoints?: number | undefined;
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
  const { stable, root, playerSilks, rootLegacyPoints, onBack, onBreed } = options;

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
  let stopIdlePreview: (() => void) | undefined;

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
   * A curved line from each ancestor's card down to the child it belongs to.
   *
   * Positions are measured relative to `canvasEl`'s own box rather than the
   * viewport, so they stay correct across scroll without recomputing on every
   * scroll event — the card and the canvas move together. Each path carries
   * the two paths it connects as data attributes, so hovering a card can find
   * every line on its route back to the root without re-walking the tree.
   */
  function drawLines(): void {
    const SVG_NS = 'http://www.w3.org/2000/svg';
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
            // A vertical bezier: control points sit at the row midpoint, at
            // each end's own x, so the curve eases out of one card and into
            // the next rather than crossing them at a hard angle.
            const midY = (parent.bottom + child.top) / 2;
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute(
              'd',
              `M ${parent.x} ${parent.bottom} C ${parent.x} ${midY}, ${child.x} ${midY}, ${child.x} ${child.top}`,
            );
            path.setAttribute('class', 'archive-line');
            path.dataset.parent = parentNode.path;
            path.dataset.child = node.path;
            linesEl.appendChild(path);
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

  /** Every path on the route from a card back to the root, root-first. */
  function ancestryChain(basePath: string): string[] {
    const chain: string[] = [];
    for (let i = 1; i <= basePath.length; i++) chain.push(basePath.slice(0, i));
    return chain;
  }

  /**
   * Hovering a card highlights its own route to the root and dims everything
   * else — the direct-line-in-full chart is dense once siblings are on, and
   * this is how you follow one animal's line through it without counting rows.
   */
  function highlightRoute(hoveredPath: string | undefined): void {
    canvasEl.classList.toggle('archive-hovering', !!hoveredPath);
    if (!hoveredPath) return;

    const basePath = hoveredPath.split('-sib-')[0]!;
    const onRoute = new Set(ancestryChain(basePath));
    onRoute.add(hoveredPath); // the hovered card itself, sibling or not

    canvasEl.querySelectorAll<HTMLElement>('.archive-card').forEach((card) => {
      card.classList.toggle('archive-card-highlight', onRoute.has(card.dataset.path ?? ''));
    });
    linesEl.querySelectorAll<SVGPathElement>('.archive-line').forEach((line) => {
      const onIt = onRoute.has(line.dataset.parent ?? '') && onRoute.has(line.dataset.child ?? '');
      line.classList.toggle('archive-line-highlight', onIt);
    });
  }

  /**
   * The idle animation, the same spritesheet and tinting `trainingScreen.ts`
   * uses for its own horse preview — scaled down to fit a card corner instead
   * of a full panel. Only one detail card is open at a time, so this is at
   * most one animation loop running.
   */
  function mountIdlePreview(host: HTMLElement, horse: Horse): () => void {
    const surface = createSurface(host);
    let stopped = false;
    let stopLoop: (() => void) | undefined;

    void loadFrameSequence('southwest-idle', 9).then((sequence) => {
      if (stopped) return;
      let time = 0;
      const loop = startLoop(
        30,
        () => {
          time += 1 / 30;
        },
        () => {
          const { ctx, width, height } = surface;
          ctx.fillStyle = '#0e1218';
          ctx.fillRect(0, 0, width, height);
          drawFrame(ctx, width / 2, height * 0.92, sequence, {
            phase: (time * 0.1) % 1,
            scale: width / 100,
            scheme: { coat: horse.coat, silks: silksFor(horse, root, playerSilks) },
          });
        },
      );
      stopLoop = () => loop.stop();
    });

    return () => {
      stopped = true;
      stopLoop?.();
      surface.destroy();
    };
  }

  function openDetail(horse: Horse): void {
    detachReveal?.();
    stopIdlePreview?.();

    const isLivingRoot = horse.id === root.id && !retiredRecordOf(root, stable);
    const traits = horse.traits
      .map((id) => TRAITS[id]?.name)
      .filter(Boolean)
      .join(' · ');
    const retired = retiredRecordOf(horse, stable);
    const legacy = retired ? retired.legacyBanked : isLivingRoot ? rootLegacyPoints : undefined;
    const top3 = horse.wins + horse.places + horse.shows;

    detailBody.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'archive-detail-head';

    const heading = document.createElement('div');
    heading.className = 'archive-detail-heading';
    heading.innerHTML = `
      <h3>${horse.name}</h3>
      ${legacy !== undefined ? `<p class="archive-detail-legacy">Legacy ${legacy}</p>` : ''}
      <p class="archive-detail-meta">
        ${genderLabel(horse)} · ${horse.age}yo · ${titleCase(horse.division)} · Generation ${horse.generation ?? 1}
      </p>
      <p class="archive-detail-status">${statusOf(horse, stable, isLivingRoot)}</p>
      ${traits ? `<p class="archive-detail-traits">${traits}</p>` : ''}
    `;
    head.appendChild(heading);

    const preview = document.createElement('div');
    preview.className = 'archive-detail-preview';
    head.appendChild(preview);
    detailBody.appendChild(head);
    stopIdlePreview = mountIdlePreview(preview, horse);

    const record = document.createElement('div');
    record.className = 'archive-detail-section archive-detail-record';
    record.innerHTML = `
      <div><b>${horse.wins}</b><span>Wins</span></div>
      <div><b>${top3}</b><span>Top 3</span></div>
      <div><b>${titleCase(peakDivision(horse))}</b><span>Peaked in</span></div>
    `;
    detailBody.appendChild(record);

    const attrsSection = document.createElement('div');
    attrsSection.className = 'archive-detail-section';
    attrsSection.innerHTML = `
      <button type="button" class="archive-attrs-toggle" id="archive-attrs-toggle">Show attributes ▾</button>
      <div class="stat-rows" id="archive-attrs-rows" hidden>
        ${renderStatRows(horse, { revealNumbers: false, showPotential: isLivingRoot })}
      </div>
    `;
    detailBody.appendChild(attrsSection);

    const attrsRows = attrsSection.querySelector<HTMLElement>('#archive-attrs-rows')!;
    const attrsToggle = attrsSection.querySelector<HTMLButtonElement>('#archive-attrs-toggle')!;
    attrsToggle.addEventListener('click', () => {
      const showing = !attrsRows.hidden;
      attrsRows.hidden = showing;
      attrsToggle.textContent = showing ? 'Show attributes ▾' : 'Hide attributes ▴';
    });
    detachReveal = attachStatReveal(attrsRows);

    detailEl.hidden = false;
  }

  function closeDetail(): void {
    detachReveal?.();
    stopIdlePreview?.();
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
      const clickHandler = (): void => {
        const horse =
          known.find((h) => h.id === card.dataset.id) ?? (card.dataset.id === root.id ? root : undefined);
        if (horse) openDetail(horse);
      };
      const enterHandler = (): void => highlightRoute(card.dataset.path);
      const leaveHandler = (): void => highlightRoute(undefined);

      card.addEventListener('click', clickHandler);
      card.addEventListener('pointerenter', enterHandler);
      card.addEventListener('pointerleave', leaveHandler);
      cardListeners.push(() => {
        card.removeEventListener('click', clickHandler);
        card.removeEventListener('pointerenter', enterHandler);
        card.removeEventListener('pointerleave', leaveHandler);
      });
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
    stopIdlePreview?.();
    cardListeners.splice(0).forEach((off) => off());
    listeners.splice(0).forEach((off) => off());
    el.remove();
  };
}
