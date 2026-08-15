import type { Career } from './career.js';

export interface StableHubCallbacks {
  onTraining: () => void;
  onRaceCalendar: () => void;
  onFacilities: () => void;
  onTrainerJockey: () => void;
  onConsumables: () => void;
  onDossier: () => void;
}

export function mountStableHub(
  container: HTMLElement,
  career: Career,
  callbacks: StableHubCallbacks,
): () => void {
  const root = document.createElement('div');
  root.className = 'stable-hub';

  const horse = career.horse;

  root.innerHTML = `
    <div class="hub-container">
      <!-- Top Status Bar -->
      <div class="hub-status-bar">
        <div class="status-item">
          <span class="status-label">Cash</span>
          <span class="status-value">$${career.stats.cash.toLocaleString()}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Reputation</span>
          <span class="status-value">${career.stats.reputation}</span>
        </div>
      </div>

      <!-- Horse Profile Section -->
      <div class="hub-horse-profile">
        <div class="profile-header">
          <h2>${horse.name}${horse.isChampion ? ' 🏆' : ''}</h2>
          <p class="profile-meta">
            ${horse.style.charAt(0).toUpperCase() + horse.style.slice(1)} •
            ${horse.division.charAt(0).toUpperCase() + horse.division.slice(1)}
          </p>
        </div>
        <div class="profile-stats">
          <div class="stat">
            <span class="stat-label">Races</span>
            <span class="stat-value">${career.stats.racesCompleted}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Wins</span>
            <span class="stat-value">${career.stats.wins}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Earnings</span>
            <span class="stat-value">$${career.stats.totalEarnings.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <!-- Navigation Grid -->
      <div class="hub-navigation">
        <h3>What's Next?</h3>
        <div class="nav-grid">
          <button class="nav-button" id="nav-training" data-action="training">
            <div class="nav-icon">🏋️</div>
            <div class="nav-label">Training</div>
            <div class="nav-desc">Build your horse</div>
          </button>
          <button class="nav-button" id="nav-race-calendar" data-action="race-calendar">
            <div class="nav-icon">📅</div>
            <div class="nav-label">Race Calendar</div>
            <div class="nav-desc">Pick next race</div>
          </button>
          <button class="nav-button" id="nav-facilities" data-action="facilities" disabled>
            <div class="nav-icon">🏗️</div>
            <div class="nav-label">Facilities</div>
            <div class="nav-desc">Build your stable</div>
          </button>
          <button class="nav-button" id="nav-trainer-jockey" data-action="trainer-jockey" disabled>
            <div class="nav-icon">👥</div>
            <div class="nav-label">Staff</div>
            <div class="nav-desc">Hire & level up</div>
          </button>
          <button class="nav-button" id="nav-consumables" data-action="consumables" disabled>
            <div class="nav-icon">💊</div>
            <div class="nav-label">Consumables</div>
            <div class="nav-desc">Supplements & items</div>
          </button>
          <button class="nav-button" id="nav-dossier" data-action="dossier">
            <div class="nav-icon">📋</div>
            <div class="nav-label">Dossier</div>
            <div class="nav-desc">Track rivals</div>
          </button>
        </div>
      </div>

      <!-- Week Info -->
      <div class="hub-week-info">
        <p>Week ${career.week} of Season ${career.season}</p>
      </div>
    </div>
  `;

  container.appendChild(root);

  // Attach event listeners
  const trainingBtn = root.querySelector('#nav-training');
  const raceCalendarBtn = root.querySelector('#nav-race-calendar');
  const facilitiesBtn = root.querySelector('#nav-facilities');
  const trainerJockeyBtn = root.querySelector('#nav-trainer-jockey');
  const consumablesBtn = root.querySelector('#nav-consumables');
  const dossierBtn = root.querySelector('#nav-dossier');

  trainingBtn?.addEventListener('click', callbacks.onTraining);
  raceCalendarBtn?.addEventListener('click', callbacks.onRaceCalendar);
  facilitiesBtn?.addEventListener('click', callbacks.onFacilities);
  trainerJockeyBtn?.addEventListener('click', callbacks.onTrainerJockey);
  consumablesBtn?.addEventListener('click', callbacks.onConsumables);
  dossierBtn?.addEventListener('click', callbacks.onDossier);

  return () => {
    root.remove();
  };
}
