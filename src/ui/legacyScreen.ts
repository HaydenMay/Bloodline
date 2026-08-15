import type { Career } from './career.js';
import type { HorseLegacy } from '../data/legacy.js';
import {
  HALL_OF_FAME_THRESHOLD,
  LEGACY_TIERS,
  getStableLegacyPoints,
  getTier,
  getTierFromPoints,
} from '../data/legacy.js';

/**
 * Draw the horse's legacy history as a sparkline — the roller coaster of a
 * career, hot streaks climbing and slumps eating away at them.
 */
function renderArc(legacy: HorseLegacy): string {
  const points = legacy.history;
  if (points.length < 2) {
    return `<p class="arc-empty">Race a few times and this horse's career arc will draw itself here.</p>`;
  }

  const width = 640;
  const height = 140;
  const pad = 8;
  const max = Math.max(...points, HALL_OF_FAME_THRESHOLD * 0.4, 1);
  const stepX = (width - pad * 2) / (points.length - 1);
  const toY = (value: number): number =>
    height - pad - (value / max) * (height - pad * 2);

  const line = points
    .map((value, i) => `${(pad + i * stepX).toFixed(1)},${toY(value).toFixed(1)}`)
    .join(' ');
  const area = `${pad},${height - pad} ${line} ${(pad + (points.length - 1) * stepX).toFixed(1)},${height - pad}`;

  const peakIndex = points.indexOf(legacy.peak);
  const peakX = pad + Math.max(0, peakIndex) * stepX;
  const peakY = toY(legacy.peak);

  return `
    <svg class="legacy-arc" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
         aria-label="Legacy points after each race, from ${points[0]} to ${points[points.length - 1]}">
      <polygon class="arc-area" points="${area}" />
      <polyline class="arc-line" points="${line}" />
      <circle class="arc-peak" cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="4" />
    </svg>
    <div class="arc-legend">
      <span>Debut: ${points[0]}</span>
      <span>Peak: ${legacy.peak}</span>
      <span>Now: ${legacy.points}</span>
    </div>
  `;
}

export function mountLegacyScreen(
  container: HTMLElement,
  career: Career,
  onBack: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'legacy-screen';

  const horseLegacy = career.horseLegacy;
  const stableLegacy = career.stable.legacy;
  const stablePoints = getStableLegacyPoints(stableLegacy, horseLegacy);
  const currentTier = getTier(stablePoints);
  const nextTier = LEGACY_TIERS[getTierFromPoints(stablePoints) + 1];

  const hofProgress = Math.min(100, (horseLegacy.peak / HALL_OF_FAME_THRESHOLD) * 100);

  root.innerHTML = `
    <div class="legacy-container">
      <div class="legacy-top-bar">
        <button class="btn-back" id="back-btn">← Back</button>
        <h2>Legacy & Hall of Fame</h2>
        <div style="width: 80px;"></div>
      </div>

      <!-- Stable prestige: the farm's standing, what unlocks facilities -->
      <div class="legacy-header">
        <div class="tier-display">
          <div class="tier-icon">${currentTier.icon}</div>
          <div class="tier-info">
            <h3>${currentTier.name} Stable</h3>
            <p class="tier-description">${currentTier.description}</p>
          </div>
        </div>
        <div class="points-display">
          <div class="points-value">${stablePoints}</div>
          <div class="points-label">Prestige</div>
        </div>
      </div>

      ${
        nextTier
          ? `
        <div class="tier-progress">
          <div class="progress-header">
            <span>Progress to ${nextTier.name}</span>
            <span>${stablePoints} / ${nextTier.minPoints}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(100, (stablePoints / nextTier.minPoints) * 100)}%"></div>
          </div>
          <p class="progress-text">${nextTier.minPoints - stablePoints} more prestige to reach ${nextTier.name}</p>
        </div>
      `
          : `
        <div class="tier-progress">
          <p class="progress-text complete">Your stable has reached the highest tier.</p>
        </div>
      `
      }

      <div class="legacy-breakdown">
        <div class="breakdown-item">
          <span class="breakdown-label">Banked from past horses</span>
          <span class="breakdown-value">${stableLegacy.archivedPoints}</span>
        </div>
        <div class="breakdown-item">
          <span class="breakdown-label">${career.horse.name} (racing now)</span>
          <span class="breakdown-value">${horseLegacy.points}</span>
        </div>
      </div>

      <!-- The active horse's own arc -->
      <div class="horse-legacy-card">
        <div class="horse-legacy-header">
          <h4>${career.horse.name}'s Career Arc${horseLegacy.hallOfFame ? ' ⭐' : ''}</h4>
          <span class="horse-legacy-points">${horseLegacy.points} pts</span>
        </div>
        ${renderArc(horseLegacy)}
        <div class="hof-progress">
          <div class="progress-header">
            <span>Hall of Fame</span>
            <span>${horseLegacy.peak} / ${HALL_OF_FAME_THRESHOLD} peak</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${horseLegacy.hallOfFame ? 'gold' : ''}" style="width: ${hofProgress}%"></div>
          </div>
          <p class="progress-text">
            ${
              horseLegacy.hallOfFame
                ? `${career.horse.name} is enshrined. That honour cannot be lost.`
                : `Judged on this horse's highest legacy, so a slump never costs it a place already earned.`
            }
          </p>
        </div>
      </div>

      <div class="tier-benefits">
        <h4>Stable Benefits</h4>
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
            <div class="stat-label">Races</div>
            <div class="stat-value">${career.stats.racesCompleted}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Win Rate</div>
            <div class="stat-value">${career.stats.racesCompleted > 0 ? ((career.stats.wins / career.stats.racesCompleted) * 100).toFixed(1) : 0}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Earnings</div>
            <div class="stat-value">$${career.stats.totalEarnings.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Division</div>
            <div class="stat-value">${career.horse.division.charAt(0).toUpperCase() + career.horse.division.slice(1)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Cash</div>
            <div class="stat-value">$${career.stats.cash.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div class="hof-roster">
        <h4>Hall of Fame</h4>
        ${
          stableLegacy.hallOfFame.length === 0
            ? `<p class="hof-empty">No horse from this stable has been enshrined yet. Reach ${HALL_OF_FAME_THRESHOLD} legacy points with a single horse.</p>`
            : `
          <div class="hof-list">
            ${stableLegacy.hallOfFame
              .map(
                (entry) => `
              <div class="hof-entry">
                <div class="hof-entry-name">⭐ ${entry.horseName}</div>
                <div class="hof-entry-meta">
                  ${entry.wins} wins from ${entry.starts} starts •
                  ${entry.division.charAt(0).toUpperCase() + entry.division.slice(1)} •
                  ${entry.legacyPoints} pts
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        `
        }
      </div>
    </div>
  `;

  container.appendChild(root);

  root.querySelector('#back-btn')?.addEventListener('click', onBack);

  return () => {
    root.remove();
  };
}
