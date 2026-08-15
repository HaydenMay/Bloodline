import type { Career } from './career.js';
import type { StaffRole } from '../data/staff.js';
import {
  MAX_STAFF_LEVEL,
  STAFF,
  checkStaffUpgrade,
  getJockeySkill,
  getTrainerBonus,
} from '../data/staff.js';
import { saveCareer } from './career.js';
import { showNotice } from './noticeModal.js';

/** What the next level buys, so the player can see the step before paying. */
function nextLevelPreview(role: StaffRole, level: number): string {
  const next = level + 1;
  if (role === 'trainer') {
    return `+${(getTrainerBonus(next) * 100).toFixed(0)}% training gain (from +${(getTrainerBonus(level) * 100).toFixed(0)}%)`;
  }
  return `${getJockeySkill(next)} skill (from ${getJockeySkill(level)})`;
}

export function mountStaffScreen(
  container: HTMLElement,
  career: Career,
  onBack: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'staff-screen';

  const stable = career.stable;
  const roles: StaffRole[] = ['trainer', 'jockey'];

  root.innerHTML = `
    <div class="staff-container">
      <div class="staff-top-bar">
        <button class="btn-back" id="back-btn">← Back</button>
        <h2>Stable Staff</h2>
        <div style="width: 80px;"></div>
      </div>

      <p class="subtitle">Cash pays your staff. Reputation decides who will work for you.</p>

      <div class="staff-currencies">
        <div class="currency-chip">
          <span class="currency-label">Cash</span>
          <span class="currency-value">$${stable.cash.toLocaleString()}</span>
        </div>
        <div class="currency-chip">
          <span class="currency-label">Reputation</span>
          <span class="currency-value">${stable.reputation}</span>
        </div>
      </div>

      <div class="staff-grid">
        ${roles
          .map((role) => {
            const def = STAFF[role];
            const level = stable.staff[role].level;
            const check = checkStaffUpgrade(level, stable.cash, stable.reputation);

            let buttonLabel = `Promote — $${check.cost.toLocaleString()}`;
            if (check.blockedBy === 'max') buttonLabel = 'Fully Developed';
            else if (check.blockedBy === 'reputation')
              buttonLabel = `Needs ${check.reputationRequired} reputation`;
            else if (check.blockedBy === 'cash') buttonLabel = `Needs $${check.cost.toLocaleString()}`;

            return `
              <div class="staff-card" data-role="${role}">
                <div class="staff-header">
                  <div class="staff-icon">${def.icon}</div>
                  <div class="staff-info">
                    <h3>${def.name}</h3>
                    <p class="staff-desc">${def.description}</p>
                  </div>
                </div>

                <div class="staff-level">
                  <span class="level-label">Level ${level} of ${MAX_STAFF_LEVEL}</span>
                  <div class="staff-level-bar">
                    <div class="staff-level-fill" style="width: ${(level / MAX_STAFF_LEVEL) * 100}%"></div>
                  </div>
                </div>

                <p class="staff-effect">${def.effectLabel(level)}</p>

                ${
                  check.atMax
                    ? `<div class="staff-upgrade">
                         <button class="upgrade-button disabled" disabled>Fully Developed</button>
                       </div>`
                    : `<div class="staff-upgrade">
                         <div class="staff-next">
                           <span class="next-label">Next level</span>
                           <span class="next-value">${nextLevelPreview(role, level)}</span>
                         </div>
                         ${
                           check.blockedBy === 'reputation'
                             ? `<p class="staff-locked">Reputation ${stable.reputation} / ${check.reputationRequired} — win races to be taken seriously.</p>`
                             : ''
                         }
                         <button class="upgrade-button ${check.canUpgrade ? '' : 'disabled'}"
                                 data-role="${role}" ${check.canUpgrade ? '' : 'disabled'}>
                           ${buttonLabel}
                         </button>
                       </div>`
                }
              </div>
            `;
          })
          .join('')}
      </div>

      <div class="staff-actions">
        <button class="btn btn-secondary" id="back-btn-bottom">Back to Hub</button>
      </div>
    </div>
  `;

  container.appendChild(root);

  root.querySelectorAll<HTMLButtonElement>('.upgrade-button:not(.disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role as StaffRole | undefined;
      if (!role) return;

      const level = stable.staff[role].level;
      const check = checkStaffUpgrade(level, stable.cash, stable.reputation);
      if (!check.canUpgrade) return;

      stable.cash -= check.cost;
      stable.staff[role].level = check.nextLevel;
      saveCareer(career);

      const def = STAFF[role];
      root.remove();
      mountStaffScreen(container, career, onBack);
      showNotice(container, {
        icon: def.icon,
        title: `${def.name} Promoted`,
        lines: [`Now level ${check.nextLevel}. ${def.effectLabel(check.nextLevel)}.`],
        tone: 'positive',
      });
    });
  });

  root.querySelector('#back-btn')?.addEventListener('click', onBack);
  root.querySelector('#back-btn-bottom')?.addEventListener('click', onBack);

  return () => {
    root.remove();
  };
}
