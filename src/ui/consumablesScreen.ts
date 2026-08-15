import type { Career } from './career.js';
import { CONSUMABLES, consumableCatalogue } from '../data/consumables.js';
import { saveCareer } from './career.js';
import { showNotice } from './noticeModal.js';

export function mountConsumablesScreen(
  container: HTMLElement,
  career: Career,
  onBack: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'consumables-screen';

  const stable = career.stable;
  const horse = career.horse;
  const catalogue = consumableCatalogue(stable.reputation);

  const owned = Object.entries(stable.consumables).filter(([, n]) => n > 0);

  root.innerHTML = `
    <div class="consumables-container">
      <div class="consumables-top-bar">
        <button class="btn-back" id="back-btn">← Back</button>
        <h2>Supplies</h2>
        <div style="width: 80px;"></div>
      </div>

      <div class="consumables-currencies">
        <div class="currency-chip">
          <span class="currency-label">Cash</span>
          <span class="currency-value">$${stable.cash.toLocaleString()}</span>
        </div>
        <div class="currency-chip">
          <span class="currency-label">${horse.name}</span>
          <span class="currency-value">${Math.round(horse.condition)} cond · ${Math.round(horse.morale)} mor</span>
        </div>
      </div>

      <div class="consumables-section">
        <h3>In the Store</h3>
        ${
          owned.length === 0
            ? `<p class="consumables-empty">Nothing in the store. Buy something below.</p>`
            : `<div class="owned-grid">
                ${owned
                  .map(([id, count]) => {
                    const item = CONSUMABLES[id];
                    if (!item) return '';
                    return `
                      <div class="owned-item">
                        <span class="owned-icon">${item.icon}</span>
                        <div class="owned-info">
                          <span class="owned-name">${item.name} ×${count}</span>
                          <span class="owned-effect">${item.effectLabel}</span>
                        </div>
                        ${
                          item.kind === 'upkeep'
                            ? `<button class="use-button" data-use="${id}">Use</button>`
                            : `<span class="owned-tag">Race day</span>`
                        }
                      </div>
                    `;
                  })
                  .join('')}
              </div>`
        }
        <p class="consumables-note">
          Race-day items are chosen on the race calendar and last for that race only.
        </p>
      </div>

      <div class="consumables-section">
        <h3>Buy</h3>
        <div class="shop-grid">
          ${catalogue
            .map(({ item, unlocked }) => {
              const affordable = stable.cash >= item.cost;
              const held = stable.consumables[item.id] ?? 0;
              return `
                <div class="shop-item ${unlocked ? '' : 'locked'}">
                  <div class="shop-item-head">
                    <span class="shop-icon">${item.icon}</span>
                    <div>
                      <div class="shop-name">${item.name}${held > 0 ? ` <span class="held-badge">${held} held</span>` : ''}</div>
                      <div class="shop-kind">${item.kind === 'upkeep' ? 'Upkeep' : 'Race day'}</div>
                    </div>
                  </div>
                  <p class="shop-desc">${item.description}</p>
                  <p class="shop-effect">${item.effectLabel}</p>
                  ${
                    unlocked
                      ? `<button class="buy-button ${affordable ? '' : 'disabled'}"
                                 data-buy="${item.id}" ${affordable ? '' : 'disabled'}>
                           ${affordable ? `Buy — $${item.cost.toLocaleString()}` : `Needs $${item.cost.toLocaleString()}`}
                         </button>`
                      : `<div class="shop-locked">Unlocks at ${item.reputationRequired} reputation</div>`
                  }
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <div class="consumables-actions">
        <button class="btn btn-secondary" id="back-btn-bottom">Back to Hub</button>
      </div>
    </div>
  `;

  container.appendChild(root);

  const refresh = (): void => {
    root.remove();
    mountConsumablesScreen(container, career, onBack);
  };

  root.querySelectorAll<HTMLButtonElement>('.buy-button:not(.disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = CONSUMABLES[btn.dataset.buy ?? ''];
      if (!item || stable.cash < item.cost) return;
      stable.cash -= item.cost;
      stable.consumables[item.id] = (stable.consumables[item.id] ?? 0) + 1;
      saveCareer(career);
      refresh();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('.use-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.use ?? '';
      const item = CONSUMABLES[id];
      if (!item || (stable.consumables[id] ?? 0) <= 0) return;

      const before = { condition: horse.condition, morale: horse.morale };
      item.apply(horse);
      stable.consumables[id] = (stable.consumables[id] ?? 0) - 1;
      saveCareer(career);

      const dCond = Math.round(horse.condition - before.condition);
      const dMor = Math.round(horse.morale - before.morale);
      const parts: string[] = [];
      if (dCond) parts.push(`${dCond > 0 ? '+' : ''}${dCond} condition`);
      if (dMor) parts.push(`${dMor > 0 ? '+' : ''}${dMor} morale`);

      refresh();
      showNotice(container, {
        icon: item.icon,
        title: item.name,
        lines: [
          parts.length
            ? `${horse.name}: ${parts.join(', ')}.`
            : `${horse.name} was already in peak order — no change.`,
        ],
        tone: parts.length ? 'positive' : 'neutral',
      });
    });
  });

  root.querySelector('#back-btn')?.addEventListener('click', onBack);
  root.querySelector('#back-btn-bottom')?.addEventListener('click', onBack);

  return () => {
    root.remove();
  };
}
