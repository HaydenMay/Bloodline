import type { Career } from './career.js';
import type { RivalRecord } from './career.js';

type SortKey = 'recent' | 'meetings' | 'record' | 'name';

/**
 * The permanent dossier: every rival this yard has ever faced, kept across
 * careers. Unlike the pre-race field viewer, this is a record of history — who
 * keeps beating you, and who you have the measure of.
 */
export function mountRivalDossierScreen(
  container: HTMLElement,
  career: Career,
  onBack: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'dossier-screen';

  let sort: SortKey = 'recent';
  let query = '';

  const entries = (): Array<[string, RivalRecord]> => {
    let list = Object.entries(career.stable.dossier);

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(([, r]) => r.name?.toLowerCase().includes(q));
    }

    const winRate = (r: RivalRecord): number =>
      r.meetings > 0 ? r.beaten / r.meetings : 0;

    switch (sort) {
      case 'meetings':
        return list.sort((a, b) => b[1].meetings - a[1].meetings);
      case 'record':
        // Worst head-to-head first: the rivals actually worth worrying about.
        return list.sort((a, b) => winRate(a[1]) - winRate(b[1]) || b[1].meetings - a[1].meetings);
      case 'name':
        return list.sort((a, b) => (a[1].name ?? '').localeCompare(b[1].name ?? ''));
      default:
        return list.sort((a, b) => b[1].lastSeen - a[1].lastSeen);
    }
  };

  const render = (): void => {
    const list = entries();
    const total = Object.keys(career.stable.dossier).length;

    // A nemesis is only meaningful once you have met a few times.
    const contested = Object.values(career.stable.dossier).filter((r) => r.meetings >= 3);
    const nemesis = contested.sort(
      (a, b) => a.beaten / a.meetings - b.beaten / b.meetings,
    )[0];

    root.innerHTML = `
      <div class="dossier-container">
        <div class="dossier-top-bar">
          <button class="btn-back" id="back-btn">← Back</button>
          <h2>Rival Dossier</h2>
          <div style="width: 80px;"></div>
        </div>

        ${
          total === 0
            ? `<p class="dossier-empty">You haven't raced anyone yet. Every rival you meet is recorded here, and the record survives your horses.</p>`
            : `
          <div class="dossier-summary">
            <div class="dossier-stat">
              <span class="dossier-stat-label">Rivals faced</span>
              <span class="dossier-stat-value">${total}</span>
            </div>
            ${
              nemesis
                ? `<div class="dossier-stat">
                     <span class="dossier-stat-label">Nemesis</span>
                     <span class="dossier-stat-value">${nemesis.name}</span>
                     <span class="dossier-stat-sub">beaten ${nemesis.beaten} of ${nemesis.meetings}</span>
                   </div>`
                : ''
            }
          </div>

          <div class="dossier-controls">
            <input type="text" id="dossier-search" class="dossier-search"
                   placeholder="Search rivals" value="${query.replace(/"/g, '&quot;')}" />
            <div class="dossier-sorts">
              ${(
                [
                  ['recent', 'Recent'],
                  ['record', 'Toughest'],
                  ['meetings', 'Most met'],
                  ['name', 'A–Z'],
                ] as Array<[SortKey, string]>
              )
                .map(
                  ([key, label]) =>
                    `<button class="dossier-sort ${sort === key ? 'active' : ''}" data-sort="${key}">${label}</button>`,
                )
                .join('')}
            </div>
          </div>

          ${
            list.length === 0
              ? `<p class="dossier-empty">No rival matches "${query}".</p>`
              : `<div class="dossier-list">
              ${list
                .map(([id, r]) => {
                  const rate = r.meetings > 0 ? Math.round((r.beaten / r.meetings) * 100) : 0;
                  const edge = rate >= 60 ? 'ahead' : rate <= 40 ? 'behind' : 'level';
                  return `
                    <div class="dossier-row" data-id="${id}">
                      <div class="dossier-row-main">
                        <span class="dossier-rival-name">${r.name ?? 'Unknown'}</span>
                        <span class="dossier-rival-div">${(r.division ?? '').charAt(0).toUpperCase() + (r.division ?? '').slice(1)}</span>
                      </div>
                      <div class="dossier-row-record">
                        <span class="dossier-h2h ${edge}">${r.beaten}–${r.meetings - r.beaten}</span>
                        <span class="dossier-h2h-label">head to head</span>
                      </div>
                      <div class="dossier-row-form">
                        <span>${r.wins}w · ${r.places}p from ${r.starts}</span>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>`
          }
        `
        }

        <div class="dossier-actions">
          <button class="btn btn-secondary" id="back-btn-bottom">Back to Hub</button>
        </div>
      </div>
    `;

    root.querySelector('#back-btn')?.addEventListener('click', onBack);
    root.querySelector('#back-btn-bottom')?.addEventListener('click', onBack);

    root.querySelectorAll<HTMLButtonElement>('.dossier-sort').forEach((btn) => {
      btn.addEventListener('click', () => {
        sort = btn.dataset.sort as SortKey;
        render();
      });
    });

    const search = root.querySelector<HTMLInputElement>('#dossier-search');
    search?.addEventListener('input', () => {
      query = search.value;
      render();
      // Re-rendering blows away focus, so put the caret back where it was.
      const next = root.querySelector<HTMLInputElement>('#dossier-search');
      next?.focus();
      next?.setSelectionRange(next.value.length, next.value.length);
    });
  };

  render();
  container.appendChild(root);

  return () => {
    root.remove();
  };
}
