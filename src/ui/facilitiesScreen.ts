import type { Career } from './career.js';
import { FACILITIES, checkFacilityUpgrade, getLevelCapForTier } from '../data/facilities.js';
import { getStableLegacyPoints, getTier, getTierFromPoints, LEGACY_TIERS } from '../data/legacy.js';
import { saveCareer } from './career.js';
import { showNotice } from './noticeModal.js';

export function mountFacilitiesScreen(
  container: HTMLElement,
  career: Career,
  onBack: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'facilities-screen';

  const stable = career.stable;
  const prestige = getStableLegacyPoints(stable.legacy, career.horseLegacy);
  const tierIndex = getTierFromPoints(prestige);
  const tier = getTier(prestige);
  const cap = getLevelCapForTier(tierIndex);
  const nextTier = LEGACY_TIERS[tierIndex + 1];

  root.innerHTML = `
    <div class="facilities-container">
      <div class="facilities-top-bar">
        <button class="btn-back" id="back-btn-top">← Back</button>
        <h2>Stable Facilities</h2>
        <div style="width: 80px;"></div>
      </div>

      <div class="facilities-header">
        <p class="subtitle">Cash builds the yard. Prestige decides how far it can go.</p>
        <div class="cash-display">
          <span class="label">Available Cash:</span>
          <span class="amount">$${stable.cash.toLocaleString()}</span>
        </div>
        <div class="facilities-tier">
          <span class="facilities-tier-name">${tier.icon} ${tier.name} Stable</span>
          <span class="facilities-tier-cap">Building up to level ${cap}</span>
          ${
            nextTier
              ? `<span class="facilities-tier-next">${nextTier.minPoints - prestige} more prestige unlocks level ${getLevelCapForTier(tierIndex + 1)}</span>`
              : ''
          }
        </div>
      </div>

      <div class="facilities-grid">
        ${Object.entries(FACILITIES)
          .map(([facilityId, facility]) => {
            const level = stable.facilities[facilityId] || 0;
            const check = checkFacilityUpgrade(facility, level, stable.cash, tierIndex);

            let action: string;
            if (check.atMax) {
              action = `<button class="upgrade-button disabled" disabled>Fully Built</button>`;
            } else if (check.tierLocked) {
              action = `<div class="facility-locked">Level ${check.nextLevel} needs a ${nextTier?.name ?? 'higher'} stable</div>`;
            } else {
              action = `
                <div class="upgrade-cost">
                  <span class="cost-label">Upgrade to Level ${check.nextLevel}</span>
                  <span class="cost-amount">$${check.cost.toLocaleString()}</span>
                </div>
                <button class="upgrade-button ${check.canAfford ? '' : 'disabled'}"
                        data-facility="${facilityId}" ${check.canAfford ? '' : 'disabled'}>
                  ${check.canAfford ? 'Upgrade' : 'Not Enough Cash'}
                </button>`;
            }

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
                      .map(
                        (l) =>
                          `<div class="level-pip ${l <= level ? 'filled' : ''} ${l > cap ? 'capped' : ''}"></div>`,
                      )
                      .join('')}
                  </div>
                  <span class="level-text">${level}/5</span>
                </div>

                <p class="facility-benefit">${facility.effectAt(level)}</p>

                <div class="upgrade-section">${action}</div>
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

  root.querySelectorAll<HTMLButtonElement>('.upgrade-button:not(.disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const facilityId = btn.dataset.facility;
      const facility = facilityId ? FACILITIES[facilityId] : undefined;
      if (!facilityId || !facility) return;

      const level = stable.facilities[facilityId] || 0;
      const check = checkFacilityUpgrade(facility, level, stable.cash, tierIndex);

      if (!check.canUpgrade) {
        showNotice(container, {
          icon: check.tierLocked ? '🔒' : '💰',
          title: check.tierLocked ? 'Prestige Too Low' : 'Not Enough Cash',
          lines: check.tierLocked
            ? [
                `A ${tier.name} stable can build the ${facility.name} to level ${cap}.`,
                `Level ${check.nextLevel} needs a more established yard.`,
              ]
            : [
                `Level ${check.nextLevel} of the ${facility.name} costs $${check.cost.toLocaleString()}.`,
                `You have $${stable.cash.toLocaleString()}.`,
              ],
          hint: check.tierLocked
            ? 'Prestige comes from how your horses run — keep winning and the yard grows with them.'
            : 'Prize money from your next few races will cover the difference.',
          tone: 'warning',
        });
        return;
      }

      stable.cash -= check.cost;
      stable.facilities[facilityId] = check.nextLevel;
      saveCareer(career);

      root.remove();
      mountFacilitiesScreen(container, career, onBack);
    });
  });

  root.querySelector('#back-btn')?.addEventListener('click', onBack);
  root.querySelector('#back-btn-top')?.addEventListener('click', onBack);

  return () => {
    root.remove();
  };
}
