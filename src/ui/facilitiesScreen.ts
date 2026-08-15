import type { Career } from './career.js';
import { FACILITIES, getUpgradeCost } from '../data/facilities.js';
import { saveCareer } from './career.js';
import { showNotice } from './noticeModal.js';

export function mountFacilitiesScreen(
  container: HTMLElement,
  career: Career,
  onBack: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'facilities-screen';

  const facilityEntries = Object.entries(FACILITIES);

  root.innerHTML = `
    <div class="facilities-container">
      <div class="facilities-top-bar">
        <button class="btn-back" id="back-btn-top">← Back</button>
        <h2>Stable Facilities</h2>
        <div style="width: 80px;"></div>
      </div>
      <div class="facilities-header">
        <p class="subtitle">Upgrade your facilities to improve your horse's performance</p>
        <div class="cash-display">
          <span class="label">Available Cash:</span>
          <span class="amount">$${career.stats.cash.toLocaleString()}</span>
        </div>
      </div>

      <div class="facilities-grid">
        ${facilityEntries
          .map(([facilityId, facility]) => {
            const currentLevel = career.stable.facilities[facilityId] || 0;
            const isMaxed = currentLevel >= 5;
            const nextLevel = currentLevel + 1;
            const upgradeCost = isMaxed ? 0 : getUpgradeCost(facility.baseCost, nextLevel);
            const canAfford = career.stats.cash >= upgradeCost;

            return `
              <div class="facility-card" data-facility="${facilityId}">
                <div class="facility-header">
                  <div class="facility-icon">${facility.baseIcon}</div>
                  <div class="facility-info">
                    <h3>${facility.name}</h3>
                    <p class="facility-desc">${facility.description}</p>
                  </div>
                </div>

                <div class="facility-level">
                  <span class="level-label">Level</span>
                  <div class="level-bar">
                    ${[1, 2, 3, 4, 5]
                      .map((level) => `<div class="level-pip ${level <= currentLevel ? 'filled' : ''}"></div>`)
                      .join('')}
                  </div>
                  <span class="level-text">${currentLevel}/5</span>
                </div>

                <p class="facility-benefit">${facility.benefit}</p>

                ${
                  isMaxed
                    ? `
                  <div class="upgrade-section">
                    <div class="upgrade-button disabled">
                      <span>Maxed Out</span>
                    </div>
                  </div>
                `
                    : `
                  <div class="upgrade-section">
                    <div class="upgrade-cost">
                      <span class="cost-label">Upgrade to Level ${nextLevel}:</span>
                      <span class="cost-amount">$${upgradeCost.toLocaleString()}</span>
                    </div>
                    <button class="upgrade-button ${canAfford ? '' : 'disabled'}"
                            data-facility="${facilityId}"
                            ${!canAfford ? 'disabled' : ''}>
                      ${canAfford ? 'Upgrade' : 'Not Enough Cash'}
                    </button>
                  </div>
                `
                }
              </div>
            `;
          })
          .join('')}
      </div>

      <div class="facilities-actions">
        <button class="btn btn-secondary" id="back-btn">Back to Hub</button>
      </div>
    </div>
  `;

  container.appendChild(root);

  // Attach upgrade button listeners
  const upgradeButtons = root.querySelectorAll('.upgrade-button:not(.disabled)');
  upgradeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const facilityId = (btn as HTMLElement).dataset.facility;
      if (!facilityId) return;

      const facility = FACILITIES[facilityId];
      if (!facility) return;

      const currentLevel = career.stable.facilities[facilityId] || 0;
      const nextLevel = currentLevel + 1;
      const cost = getUpgradeCost(facility.baseCost, nextLevel);

      if (career.stats.cash < cost) {
        showNotice(container, {
          icon: '💰',
          title: 'Not Enough Cash',
          lines: [
            `Upgrading the ${facility.name} to level ${nextLevel} costs $${cost.toLocaleString()}.`,
            `You have $${career.stats.cash.toLocaleString()}.`,
          ],
          hint: 'Prize money from your next few races will cover the difference.',
          tone: 'warning',
        });
        return;
      }

      // Deduct cost and upgrade facility
      const updatedCareer = { ...career };
      updatedCareer.stats.cash -= cost;
      updatedCareer.stable.facilities[facilityId] = nextLevel;
      saveCareer(updatedCareer);

      // Refresh screen
      root.remove();
      mountFacilitiesScreen(container, updatedCareer, onBack);
    });
  });

  // Back buttons
  root.querySelector('#back-btn')?.addEventListener('click', onBack);
  root.querySelector('#back-btn-top')?.addEventListener('click', onBack);

  return () => {
    root.remove();
  };
}
