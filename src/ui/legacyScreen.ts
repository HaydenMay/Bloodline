import type { Career } from './career.js';
import { LEGACY_TIERS, isHallOfFame } from '../data/legacy.js';

export function mountLegacyScreen(
  container: HTMLElement,
  career: Career,
  onBack: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'legacy-screen';

  const legacy = career.legacy;
  const currentTier = LEGACY_TIERS[legacy.tier];
  const nextTier = LEGACY_TIERS[legacy.tier + 1];
  const isHOF = isHallOfFame(legacy.totalPoints, career.stats.wins);

  root.innerHTML = `
    <div class="legacy-container">
      <div class="legacy-top-bar">
        <button class="btn-back" id="back-btn">← Back</button>
        <h2>Legacy & Hall of Fame</h2>
        <div style="width: 80px;"></div>
      </div>

      <div class="legacy-header">
        <div class="tier-display">
          <div class="tier-icon">${currentTier.icon}</div>
          <div class="tier-info">
            <h3>${currentTier.name}${isHOF ? ' ⭐ Hall of Fame' : ''}</h3>
            <p class="tier-description">${currentTier.description}</p>
          </div>
        </div>

        <div class="points-display">
          <div class="points-value">${legacy.totalPoints}</div>
          <div class="points-label">Legacy Points</div>
        </div>
      </div>

      ${
        nextTier
          ? `
        <div class="tier-progress">
          <div class="progress-header">
            <span>Progress to ${nextTier.name}</span>
            <span>${legacy.totalPoints} / ${nextTier.minPoints}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(100, (legacy.totalPoints / nextTier.minPoints) * 100)}%"></div>
          </div>
          <p class="progress-text">Earn ${nextTier.minPoints - legacy.totalPoints} more points to reach ${nextTier.name}</p>
        </div>
      `
          : `
        <div class="tier-progress">
          <p class="progress-text complete">You have reached the highest tier!</p>
        </div>
      `
      }

      <div class="tier-benefits">
        <h4>Current Benefits</h4>
        <ul class="benefits-list">
          ${currentTier.benefits.map((benefit) => `<li>${benefit}</li>`).join('')}
        </ul>
      </div>

      <div class="career-stats">
        <h4>Career Overview</h4>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Wins</div>
            <div class="stat-value">${career.stats.wins}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Races Completed</div>
            <div class="stat-value">${career.stats.racesCompleted}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Win Rate</div>
            <div class="stat-value">${career.stats.racesCompleted > 0 ? ((career.stats.wins / career.stats.racesCompleted) * 100).toFixed(1) : 0}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Earnings</div>
            <div class="stat-value">$${career.stats.totalEarnings.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Current Division</div>
            <div class="stat-value">${career.horse.division.charAt(0).toUpperCase() + career.horse.division.slice(1)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Current Cash</div>
            <div class="stat-value">$${career.stats.cash.toLocaleString()}</div>
          </div>
        </div>
      </div>

      ${
        isHOF
          ? `
        <div class="hof-banner">
          <div class="hof-content">
            <h3>🏆 Hall of Fame 🏆</h3>
            <p>Congratulations! Your horse has achieved legendary status and been inducted into the Hall of Fame.</p>
            <p>Your legacy will be remembered for generations to come.</p>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;

  container.appendChild(root);

  root.querySelector('#back-btn')?.addEventListener('click', onBack);

  return () => {
    root.remove();
  };
}
